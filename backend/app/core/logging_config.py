"""Application logging and CloudWatch Logs configuration for LastWord Vault.

Zero-Knowledge & Security Safeguards:
- Scrub sensitive credentials (JWTs, tokens, master passwords, vault keys, recovery keys).
- Dual output: Standard output (for Docker / container engine) and rotating file output
  (for the CloudWatch Agent).
- Standardized log levels and formatting compatible with CloudWatch log metric filters.
"""

import logging
from logging.handlers import RotatingFileHandler
import os
import re
import sys
import time
from typing import Callable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# Patterns to scrub from logs to preserve zero-knowledge security
SENSITIVE_PATTERNS = [
    (re.compile(r'(?i)(bearer\s+)[a-zA-Z0-9_\-\.]{15,}'), r'\1[SCRUBBED_TOKEN]'),
    (re.compile(r"""(?i)(['"]?(?:password|token|secret|access_token|refresh_token|vault_key|master_key)['"]?\s*[:=]\s*)['"][^'"]+['"]"""), r'\1"[SCRUBBED]"'),
    (re.compile(r'(?i)([\'"]?(?:password|token|secret|access_token|refresh_token|vault_key|master_key)[\'"]?\s*[:=]\s*)[a-zA-Z0-9_\-\.]{8,}'), r'\1[SCRUBBED]'),
    (re.compile(r'(?i)(verification_token=)[a-zA-Z0-9_\-]+'), r'\1[SCRUBBED_TOKEN]'),
    (re.compile(r'(?i)(download_token=)[a-zA-Z0-9_\-]+'), r'\1[SCRUBBED_TOKEN]'),
]


class SensitiveDataFilter(logging.Filter):
    """Filter that sanitizes passwords, tokens, and cryptographic keys from log messages."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            for pattern, repl in SENSITIVE_PATTERNS:
                record.msg = pattern.sub(repl, record.msg)
        if record.args:
            # If args contain string parameters, scrub them as well
            if isinstance(record.args, dict):
                record.args = {k: self._scrub_value(v) for k, v in record.args.items()}
            elif isinstance(record.args, tuple):
                record.args = tuple(self._scrub_value(v) for v in record.args)
        return True

    def _scrub_value(self, val):
        if isinstance(val, str):
            for pattern, repl in SENSITIVE_PATTERNS:
                val = pattern.sub(repl, val)
        return val


def setup_logging():
    """Configure structured application logging for stdout and CloudWatch-monitored log files."""
    env = os.getenv("APP_ENV", "development").lower()
    log_level = logging.DEBUG if env == "development" else logging.INFO

    formatter = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    scrubber = SensitiveDataFilter()

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # Avoid duplicate handlers on re-entry
    if not any(isinstance(h, logging.StreamHandler) and not isinstance(h, RotatingFileHandler) for h in root_logger.handlers):
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(log_level)
        console_handler.setFormatter(formatter)
        console_handler.addFilter(scrubber)
        root_logger.addHandler(console_handler)

    # File logging for CloudWatch agent collection
    log_dir = os.getenv("LOG_DIR", "/var/log/lastword")
    try:
        if not os.path.exists(log_dir):
            os.makedirs(log_dir, exist_ok=True)

        # Main backend log (INFO and higher)
        backend_log_file = os.path.join(log_dir, "backend.log")
        if not any(isinstance(h, RotatingFileHandler) and h.baseFilename == os.path.abspath(backend_log_file) for h in root_logger.handlers):
            file_handler = RotatingFileHandler(
                backend_log_file,
                maxBytes=10 * 1024 * 1024,  # 10 MB per file
                backupCount=5,
                encoding="utf-8",
            )
            file_handler.setLevel(logging.INFO)
            file_handler.setFormatter(formatter)
            file_handler.addFilter(scrubber)
            root_logger.addHandler(file_handler)

        # Dedicated error log (ERROR and CRITICAL)
        error_log_file = os.path.join(log_dir, "error.log")
        if not any(isinstance(h, RotatingFileHandler) and h.baseFilename == os.path.abspath(error_log_file) for h in root_logger.handlers):
            error_file_handler = RotatingFileHandler(
                error_log_file,
                maxBytes=10 * 1024 * 1024,
                backupCount=5,
                encoding="utf-8",
            )
            error_file_handler.setLevel(logging.ERROR)
            error_file_handler.setFormatter(formatter)
            error_file_handler.addFilter(scrubber)
            root_logger.addHandler(error_file_handler)

        logging.info(f"File logging active at {log_dir} (shipping to CloudWatch)")
    except Exception as e:
        # If running in environment without filesystem write access (e.g. test or restricted sandbox),
        # gracefully continue with console logging only.
        logging.debug(f"File logging not attached ({e}); stdout logging active")

    # Set third-party log levels
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("botocore").setLevel(logging.WARNING)
    logging.getLogger("boto3").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Logs incoming HTTP requests, response latency, and statuses without leaking sensitive headers."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip health check log spamming
        if request.url.path in ("/api/health", "/"):
            return await call_next(request)

        start_time = time.time()
        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path
        method = request.method

        try:
            response = await call_next(request)
            duration_ms = (time.time() - start_time) * 1000
            status_code = response.status_code

            log_msg = f"[HTTP] {method} {path} - {status_code} - {duration_ms:.1f}ms - IP: {client_ip}"
            if status_code >= 500:
                logging.error(log_msg)
            elif status_code >= 400:
                logging.warning(log_msg)
            else:
                logging.info(log_msg)

            return response
        except Exception as exc:
            duration_ms = (time.time() - start_time) * 1000
            logging.error(f"[HTTP] {method} {path} - 500 ERROR ({str(exc)}) - {duration_ms:.1f}ms - IP: {client_ip}", exc_info=True)
            raise exc
