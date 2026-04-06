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