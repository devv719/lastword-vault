# Development Guide — LastWord

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | ≥ 20 | Frontend build and dev server |
| Python | ≥ 3.12 | Backend runtime |
| Docker | Latest | PostgreSQL and full-stack deployment |
| Git | Latest | Version control |

## Local Development Setup

### 1. Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your local values. The defaults work for local development with Docker PostgreSQL.

### 2. Database

Start PostgreSQL via Docker Compose:

```bash
docker compose up -d db
```

This creates a persistent volume. Your data survives container restarts.

### 3. Backend

```bash
cd backend
python -m venv .venv

# Activate virtual environment
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux

pip install -r requirements.txt

# Run database migrations
alembic upgrade head

# Start development server
uvicorn app.main:app --reload --port 8000
```

- API: http://localhost:8000
- Swagger docs: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

- App: http://localhost:5173
- The Vite dev server proxies `/api` requests to `localhost:8000`.

## Project Conventions

### Backend

- **Async everywhere**: Use `async def` for all route handlers and service functions.
- **Dependency injection**: Use FastAPI's `Depends()` for database sessions and auth.
- **Models → Schemas → Services → API**: Keep layers separate.
  - `models/` — SQLAlchemy ORM models (database tables).
  - `schemas/` — Pydantic v2 models (request/response validation).
  - `services/` — Business logic (no HTTP concerns).
  - `api/` — Route handlers (thin — delegate to services).
- **Naming**: Snake_case for Python, kebab-case for API paths.

### Frontend

- **Functional components only**: No class components.
- **TypeScript strict mode**: No `any` types.
- **Tailwind CSS only**: No CSS files or CSS modules.
- **Folder structure**:
  - `pages/` — Route-level components (one per page).
  - `components/` — Reusable UI components.
  - `layouts/` — Page layout wrappers.
  - `hooks/` — Custom React hooks.
  - `services/` — API call wrappers.
  - `context/` — React context providers.
  - `types/` — TypeScript type definitions.
  - `api/` — Axios client configuration.

## Testing

### Backend Tests

```bash
cd backend
pytest tests/ -v
```

### Frontend Type Check

```bash
cd frontend
npx tsc --noEmit
```

### Frontend Build Check

```bash
cd frontend
npm run build
```

## Docker (Full Stack)

```bash
# Build and start everything
docker compose up --build

# Stop
docker compose down

# Stop and remove data
docker compose down -v
```

## Database Migrations

```bash
cd backend

# Create a new migration after changing models
alembic revision --autogenerate -m "description of change"

# Apply pending migrations
alembic upgrade head

# Rollback one migration
alembic downgrade -1
```

## Demo Mode

Set `DEMO_MODE=true` in your `.env` file to use shortened intervals:
- Check-in interval: 120 seconds (instead of 72 hours)
- Grace period: 60 seconds (instead of 24 hours)

This makes it practical to demonstrate the full lifecycle in a live presentation.

