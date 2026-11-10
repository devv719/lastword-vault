# LastWord — Local Infrastructure

Local development uses Docker Compose to run PostgreSQL.

## Quick Start

```bash
# From the project root
cp .env.example .env
docker compose up -d db
```

This starts a PostgreSQL 16 instance on `localhost:5432` with:
- User: `lastword`
- Password: `changeme_local_only`
- Database: `lastword`

Data is persisted in a Docker volume (`pgdata`).

## Full Stack (Optional)

```bash
docker compose up --build
```

This starts PostgreSQL, the FastAPI backend, and the Nginx-served frontend.
For active development, it's faster to run the backend and frontend outside
Docker and only use Docker for the database.

