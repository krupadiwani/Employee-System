# Employee Management System

A Flask-based employee management dashboard with a clean single-page frontend. It includes employee, department, role, and audit-log management backed by SQLite.

## Features

- Employee login and session handling
- Employee CRUD with department, role, manager, and status fields
- Department CRUD with employee counts
- Role CRUD with employee counts
- Dashboard analytics and recent activity feed
- Audit log for major actions
- Responsive UI with modal-based forms

## Tech Stack

- Backend: Flask, Flask-CORS, SQLite
- Frontend: HTML, CSS, vanilla JavaScript
- Deployment: Gunicorn-compatible

## Project Structure

```
ems/
  app.py
  requirements.txt
  static/
    css/style.css
    js/app.js
  templates/index.html
```

## Getting Started

### Prerequisites

- Python 3.10 or newer

### Install Dependencies

```bash
cd ems
pip install -r requirements.txt
```

### Run Locally

```bash
python app.py
```

Open `http://127.0.0.1:5000` in your browser.

## Default Login

- Username: `admin`
- Password: `admin123`

## Notes

- The first run creates `ems.db` automatically in the `ems` folder.
- If you want to deploy this app, set a fixed Flask secret key through the environment before running it in production.

## Troubleshooting

- If the app cannot find the database, make sure you are running it from inside the `ems` folder.
- If ports are busy, change the port in `app.py` before starting the server.