"""Amazon S3 service for storing and retrieving encrypted vault documents.

Zero-Knowledge Threat Model:
- Plaintext file contents and encryption keys NEVER reach this service or AWS S3.
- All files are encrypted client-side in the browser using AES-256-GCM before transmission.
- This service handles only ciphertext bytes and server-side envelope metadata.
- All S3 objects are stored with SSE-S3 (AES256) encryption at rest.
- Uses AWS EC2 IAM role credentials via boto3's default credential chain.
"""

import logging
from typing import Optional, Tuple
import boto3
from botocore.exceptions import ClientError, BotoCoreError, NoCredentialsError

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_s3_client = None


def get_s3_client():
    """Get or initialize boto3 S3 client using EC2 IAM role or environment credentials."""
    global _s3_client
    if _s3_client is None:
        settings = get_settings()
        kwargs = {"region_name": settings.AWS_REGION or "ap-south-1"}
        # In local development, if explicit keys are provided, use them.
        # In EC2 production, AWS_ACCESS_KEY_ID is empty, so boto3 automatically
        # uses the attached EC2 IAM instance profile (lastword-ec2-s3-role).
        if settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY:
            kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
            kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY

        _s3_client = boto3.client("s3", **kwargs)
    return _s3_client


def get_s3_object_key(user_id: str, item_id: str) -> str:
    """Generate predictable, isolated S3 object key strictly scoped by user and item ID."""
    return f"users/{user_id}/items/{item_id}"


def upload_encrypted_file(
    s3_key: str,
    file_data: bytes,
    content_type: str = "application/octet-stream",
) -> bool:
    """
    Upload client-side encrypted ciphertext bytes to private S3 bucket.
    Enforces ServerSideEncryption="AES256" (SSE-S3) for defense-in-depth.
    """
    settings = get_settings()
    bucket = settings.S3_BUCKET_NAME
    if not bucket:
        logger.warning("S3_BUCKET_NAME is not configured; S3 upload skipped.")
        return False

    client = get_s3_client()
    try:
        client.put_object(
            Bucket=bucket,
            Key=s3_key,
            Body=file_data,
            ContentType=content_type,
            ServerSideEncryption="AES256",
        )
        logger.info(f"Successfully uploaded encrypted document to s3://{bucket}/{s3_key} ({len(file_data)} bytes)")
        return True
    except NoCredentialsError:
        logger.error("AWS credentials not found. Ensure the EC2 IAM role is attached.")
        raise
    except (ClientError, BotoCoreError) as e:
        logger.error(f"Failed to upload encrypted file to S3 ({s3_key}): {e}")
        raise


def download_encrypted_file(s3_key: str) -> Tuple[bytes, str]:
    """
    Retrieve encrypted ciphertext bytes from private S3 bucket.
    Returns: (file_bytes, content_type)
    """
    settings = get_settings()
    bucket = settings.S3_BUCKET_NAME
    if not bucket:
        raise ValueError("S3_BUCKET_NAME is not configured in environment")

    client = get_s3_client()
    try:
        response = client.get_object(Bucket=bucket, Key=s3_key)
        data = response["Body"].read()
        content_type = response.get("ContentType", "application/octet-stream")
        return data, content_type
    except client.exceptions.NoSuchKey:
        logger.error(f"S3 object not found: s3://{bucket}/{s3_key}")
        raise FileNotFoundError(f"Object {s3_key} not found in S3")
    except (ClientError, BotoCoreError) as e:
        logger.error(f"Failed to download encrypted file from S3 ({s3_key}): {e}")
        raise


def delete_encrypted_file(s3_key: str) -> bool:
    """
    Delete encrypted object from private S3 bucket.
    """
    settings = get_settings()
    bucket = settings.S3_BUCKET_NAME
    if not bucket:
        return False

    client = get_s3_client()
    try:
        client.delete_object(Bucket=bucket, Key=s3_key)
        logger.info(f"Successfully deleted object s3://{bucket}/{s3_key}")
        return True
    except (ClientError, BotoCoreError) as e:
        logger.error(f"Failed to delete S3 object ({s3_key}): {e}")
        return False

