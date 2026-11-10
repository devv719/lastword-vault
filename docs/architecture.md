# Architecture — LastWord

## System Overview

LastWord is an EC2-primary application. The main FastAPI backend and React frontend run as Docker containers on a single EC2 instance. AWS Lambda is used only for the periodic background check-in scanner.

```
┌──────────────┐   HTTPS    ┌───────────────────────────────────┐
│   Browser    │ ─────────► │  EC2 (Docker Compose)             │
│  React SPA   │            │  ┌─────────┐   ┌──────────────┐  │
└──────────────┘            │  │ Nginx   │──►│ FastAPI      │  │
                            │  │ :80     │   │ :8000        │  │
                            │  └─────────┘   └──────┬───────┘  │
                            └───────────────────────┼──────────┘
                                                    │
                         ┌──────────────────────────┼──────────────┐
                         │  VPC Private Subnet      ▼              │
                         │              ┌──────────────────┐       │
                         │              │  RDS PostgreSQL  │       │
                         │              │  db.t3.micro     │       │
                         │              └──────────────────┘       │
                         └─────────────────────────────────────────┘

  ┌─────────────┐        ┌─────────────┐       ┌──────┐
  │ EventBridge │──cron──►│   Lambda    │──────►│ SNS  │──► Email
  │ (5 min)     │        │  Scanner    │       │      │
  └─────────────┘        └──────┬──────┘       └──────┘
                                │
                         Reads/writes RDS
                         Reads S3 (for presigned URLs)
```

## Core Components

| Component | Responsibility |
|---|---|
| **React SPA** | Dashboard, vault management, contacts, check-in, audit log |
| **FastAPI** | REST API, JWT auth, business logic, presigned URL generation |
| **PostgreSQL** | Users, vault items, contacts, check-ins, audit log |
| **S3** | Encrypted file storage for vault attachments |
| **Lambda** | Periodic deadline evaluation and state transitions |
| **SNS** | Email notifications (warnings and release links) |
| **SSM** | Secrets management in production |
| **CloudWatch** | Centralized logging |
| **EventBridge** | Scheduled Lambda invocation |

## Database Design

Six tables: `users`, `vault_items`, `vault_item_recipients`, `contacts`, `checkins`, `audit_logs`.

### State Machine

```
ACTIVE ──(deadline missed)──► WARNED ──(no response)──► GRACE ──(expired)──► RELEASED
  ▲                             │                         │                     │
  │         (user checks in)    │     (user checks in)    │   (user reclaims)   │
  └─────────────────────────────┘─────────────────────────┘─────────────────────┘
```

Every transition is:
- Performed inside a database transaction.
- Guarded by the current state (idempotent).
- Recorded in the `audit_logs` table.

## API Design

All endpoints are under `/api/`. Authentication uses JWT tokens stored in httpOnly cookies.

| Group | Prefix | Endpoints |
|---|---|---|
| Auth | `/api/auth` | register, login, logout, me |
| Vault | `/api/vault` | CRUD, upload, download, recipients |
| Contacts | `/api/contacts` | CRUD |
| Check-In | `/api/checkin` | generate token, confirm, status |
| Dashboard | `/api/dashboard` | aggregated stats |
| Settings | `/api/settings` | intervals, demo mode |
| Audit | `/api/audit` | paginated log |
| Release | `/api/release` | public download (no auth) |

## Security Model

1. **Authentication**: bcrypt password hashing + JWT in httpOnly cookies.
2. **Authorization**: Every endpoint verifies resource ownership.
3. **Secrets**: Environment variables locally; SSM Parameter Store in AWS.
4. **Files**: S3 presigned URLs with expiration. Backend never streams files.
5. **Check-in**: Single-use cryptographic tokens.
6. **Release**: Only items with `release_authorized=true` are ever shared.
7. **IAM**: Least-privilege roles for EC2 and Lambda.

