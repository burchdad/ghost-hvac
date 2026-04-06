# Ghost HVAC

AI-powered HVAC monitoring MVP with a FastAPI backend and a Next.js dashboard.

## Project Structure

- backend: FastAPI simulator and anomaly detection API
- frontend: Next.js 14 App Router dashboard

## Local Run

### Backend

1. cd backend
2. python3 -m pip install -r requirements.txt
3. uvicorn main:app --reload --port 8000

### Frontend

1. cd frontend
2. npm install
3. npm run dev

Open http://localhost:3000

## API Endpoints

- GET /simulate?leak=true|false
- POST /reset

## Tests

### Backend (Pytest)

1. cd backend
2. python3 -m pip install -r requirements-dev.txt
3. pytest

### Frontend E2E (Playwright)

1. cd frontend
2. npm install
3. npx playwright install-deps chromium
4. npx playwright install chromium
5. npm run test:e2e

## Docker Compose

From repository root:

1. docker compose up --build

Services:

- Frontend: http://localhost:3000
- Backend: http://localhost:8000

## Deploy Backend To Railway

This repository is a monorepo, so Railway may not auto-detect the backend without explicit config.

Included config:

- [railway.toml](railway.toml) uses Nixpacks
- Build command installs Python, creates `.venv`, then installs [backend/requirements.txt](backend/requirements.txt)
- Start command runs `.venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}`

Railway service settings:

1. Create a new service from this repo.
2. Keep Root Directory as repository root.
3. Deploy.

If you prefer deploying only the backend folder directly, set Root Directory to `backend` and use:

- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port ${PORT}`