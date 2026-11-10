# 🔐 LastWord — Dead Man's Switch Vault

A secure cloud-based application where users store sensitive documents and notes, assign trusted contacts, and periodically check in. If the user misses their check-in deadline, the system sends warnings and — after a configurable grace period — releases explicitly authorized vault items to designated recipients through secure temporary download links.

## Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18 · Vite · TypeScript · Tailwind CSS |
| **Backend** | Python · FastAPI · SQLAlchemy (async) · Pydantic v2 |
| **Database** | PostgreSQL 16 (local Docker / AWS RDS) |
| **Containerization** | Docker · Docker Compose |
| **Cloud** | AWS EC2 · VPC · RDS · S3 · IAM · SSM Parameter Store · CloudWatch · EventBridge · Lambda · SNS |

## Project Structure

```
lastword-vault/
├── frontend/          # React SPA
├── backend/           # FastAPI REST API
├── lambda/            # EventBridge-triggered scanner
├── infra/
│   ├── aws/           # IAM policies, EventBridge rules
│   └── local/         # Local Docker setup docs
├── docs/              # Architecture & development guides
├── docker-compose.yml # Full local stack
├── .env.example       # Environment variable template
└── README.md          # ← You are here
```

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 20
- [Python](https://python.org/) ≥ 3.12
- [Docker](https://docker.com/) & Docker Compose

### 1. Clone & Configure

```bash
git clone <repository-url> lastword-vault
cd lastword-vault
cp .env.example .env
# Edit .env with your local settings
```

### 2. Start the Database

```bash
docker compose up -d db
```

### 3. Start the Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The API will be available at http://localhost:8000. Interactive docs at http://localhost:8000/docs.

### 4. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

The app will be available at http://localhost:5173.

### Full Stack (Docker)

```bash
docker compose up --build
```

This starts all three services. The frontend is served at http://localhost:80.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full system architecture, database design, and AWS integration plan.

## Development

See [docs/development.md](docs/development.md) for the development workflow, coding conventions, and testing guide.

## Security

- Passwords are hashed with bcrypt — never stored in plaintext.
- AWS credentials are never hardcoded — environment variables locally, SSM Parameter Store in production.
- File access uses time-limited presigned S3 URLs.
- Check-in tokens are single-use.
- Vault items are only released when explicitly authorized by the owner.
- All state transitions are idempotent and audited.

## License

This project is a college Cloud Computing Lab mini-project. Not intended for production use.

