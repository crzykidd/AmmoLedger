# AmmoLedger

This app is very early and still in development

A self-hosted web application to track your ammunition inventory. Keep your ammo counts accurate on and off the range.



## Features

- Track ammo by caliber, brand, and grain weight
- Log usage from range sessions
- View current inventory at a glance
- Runs entirely in Docker — no cloud, no subscriptions, your data stays yours

## Tech Stack

- **Backend:** Python + FastAPI
- **Frontend:** React + Tailwind CSS
- **Database:** SQLite (single file, easy to back up)
- **Container:** Docker + Docker Compose

## Requirements

- Docker Desktop (with WSL2 on Windows)
- Git

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/yourusername/AmmoLedger.git
cd AmmoLedger
```

### 2. Start the app

```bash
docker compose up --build
```

### 3. Open in your browser

- **App:** http://localhost:5173
- **API docs:** http://localhost:8000/docs

## Development

This project uses VS Code Dev Containers. Open the project in VS Code and when prompted, click **Reopen in Container**. Your full development environment will be running inside Docker automatically.

### Useful commands

```bash
# Start in background
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down

# Rebuild after dependency changes
docker compose up --build
```

## Backup

Your data lives in a single file: `./data/ammoledger.db`

To back up, just copy that file somewhere safe.

## Project Structure

```
AmmoLedger/
├── backend/
│   ├── main.py          # FastAPI app and routes
│   ├── models.py        # Database models
│   ├── database.py      # SQLite connection
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
├── data/                # SQLite database lives here (git ignored)
├── .devcontainer/
│   └── devcontainer.json
├── .github/
│   └── workflows/
│       └── docker-publish.yml
├── docker-compose.yml
├── Dockerfile.backend
├── Dockerfile.frontend
└── .gitignore
```

## License

MIT
