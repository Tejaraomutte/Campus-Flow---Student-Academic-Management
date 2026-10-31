# Student Information & Academic Performance Management System

Full-stack local Windows project:
- React + Vite frontend
- Python + Flask REST API
- MongoDB for users, student profiles and courses metadata
- Apache Cassandra for attendance and marks history
- JWT login with Admin, Faculty and Student roles

## Requirements
- Windows 10/11
- Node.js 20+ and npm
- Python 3.11 (recommended)
- Docker Desktop with Linux containers enabled

Docker Compose runs MongoDB and Cassandra locally. This avoids the complexity of installing Cassandra natively on Windows.

## Quick start

### 1. Start databases
Open PowerShell in this project folder:

```powershell
docker compose up -d
docker compose ps
```

First Cassandra startup can take 1–3 minutes. Wait until it is healthy/ready before starting Flask. If the first attempt fails, wait a minute and retry.

### 2. Start Flask backend
Open a PowerShell terminal:

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
python app.py
```

If PowerShell blocks activation, use:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

Backend: http://127.0.0.1:5000
Health check: http://127.0.0.1:5000/api/health

The backend initializes the Cassandra keyspace/tables and seeds demo accounts and student profiles on startup.

### 3. Start React frontend
Open a second PowerShell terminal:

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Open the URL printed by Vite, usually http://localhost:5173.

## Demo logins
| Role | Email | Password |
|---|---|---|
| Admin | admin@college.local | Admin123! |
| Faculty | faculty@college.local | Faculty123! |
| Student | student@college.local | Student123! |

Change demo passwords and `JWT_SECRET` before using this beyond a local demo. Demo data is fictional.

## Features
- Login and JWT authentication
- Role-aware navigation and API authorization
- Dashboard summary cards
- Student CRUD (Admin/Faculty)
- Attendance entry and student/month history
- GPA entry and semester history (0–10 scale)
- Light/dark theme selection, saved on this device
- Search/filter students
- Responsive professional college ERP interface
- Demo seed data

## Database responsibilities
- MongoDB: `users`, `students`, and `courses` collections.
- Cassandra: `attendance_by_student_month` and `gpa_by_student_semester` tables.
  The legacy `marks_by_student_semester` table is retained as a read-only migration source for existing records. Tables are designed around the queries the app makes (student + month, student + semester), rather than general-purpose scans.

## Troubleshooting

### Cassandra is not ready
```powershell
docker compose logs -f cassandra
```
Wait for the log line indicating the node is ready, then restart `python app.py`.

### Port already in use
- MongoDB: 27017
- Cassandra native transport: 9042
- Flask: 5000
- Vite: 5173

Change the host port mapping in `docker-compose.yml` if necessary and update `MONGO_URI` / `CASSANDRA_HOSTS` in `backend/.env`.

### MongoDB connection issue
Confirm `docker compose ps` shows MongoDB running. The app uses `mongodb://127.0.0.1:27017`.

### Reset demo database
This deletes local database volumes and all saved data:
```powershell
docker compose down -v
docker compose up -d
```
Then restart Flask so it can seed data again.

## API overview
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/dashboard`
- `GET /api/students`
- `POST /api/students`
- `PUT /api/students/<student_id>`
- `DELETE /api/students/<student_id>`
- `GET /api/attendance?student_id=<id>&month=YYYY-MM`
- `POST /api/attendance`
- `GET /api/marks?student_id=<id>&semester=<number>`
- `POST /api/marks` (accepts a `gpa` value from 0 to 10)

Existing assessment rows saved as marks are converted to the 0–10 GPA scale the first time that student and semester's results are loaded.

All protected endpoints require `Authorization: Bearer <token>`.
