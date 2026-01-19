#!/bin/bash

# =============================================================================
# DMS Documents API (Python/FastAPI) Deployment Script
# =============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   DMS Documents API Deployment${NC}"
echo -e "${BLUE}========================================${NC}"

# -----------------------------------------------------------------------------
# Pre-flight checks
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[1/6] Running pre-flight checks...${NC}"

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${RED}ERROR: .env file not found in documents-api directory${NC}"
    echo -e "${YELLOW}Please create a .env file with the required environment variables${NC}"
    exit 1
fi
echo -e "${GREEN}✓ .env file found${NC}"

# Check if pyproject.toml exists
if [ ! -f "pyproject.toml" ]; then
    echo -e "${RED}ERROR: pyproject.toml not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ pyproject.toml found${NC}"

# Check if server.py exists
if [ ! -f "server.py" ]; then
    echo -e "${RED}ERROR: server.py not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ server.py found${NC}"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}ERROR: Python3 is not installed${NC}"
    exit 1
fi
PYTHON_VERSION=$(python3 --version)
echo -e "${GREEN}✓ ${PYTHON_VERSION} found${NC}"

# Check/Install Poetry (to user directory, no sudo needed)
if ! command -v poetry &> /dev/null; then
    # Check if poetry is in user's local bin
    if [ -f "$HOME/.local/bin/poetry" ]; then
        export PATH="$HOME/.local/bin:$PATH"
    else
        echo -e "${YELLOW}Poetry not found, installing to user directory...${NC}"
        curl -sSL https://install.python-poetry.org | python3 - --yes
        export PATH="$HOME/.local/bin:$PATH"
    fi
fi
POETRY_VERSION=$(poetry --version)
echo -e "${GREEN}✓ ${POETRY_VERSION} found${NC}"

# Configure poetry to create virtualenv in project directory
poetry config virtualenvs.in-project true 2>/dev/null || true

# Check Redis
if command -v redis-cli &> /dev/null; then
    if redis-cli ping &> /dev/null; then
        echo -e "${GREEN}✓ Redis is running${NC}"
    else
        echo -e "${YELLOW}⚠ Redis is installed but not running${NC}"
        echo -e "${YELLOW}  Please start Redis: redis-server${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Redis CLI not found - make sure Redis is accessible${NC}"
fi

# -----------------------------------------------------------------------------
# Install dependencies
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[2/6] Installing dependencies...${NC}"
poetry install
echo -e "${GREEN}✓ Dependencies installed${NC}"

# -----------------------------------------------------------------------------
# Install system dependencies (if needed)
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[3/6] Checking system dependencies...${NC}"

# Check for tesseract (OCR)
if command -v tesseract &> /dev/null; then
    echo -e "${GREEN}✓ Tesseract OCR found${NC}"
else
    echo -e "${YELLOW}⚠ Tesseract OCR not found - install with:${NC}"
    echo -e "${YELLOW}  macOS: brew install tesseract${NC}"
    echo -e "${YELLOW}  Ubuntu: sudo apt-get install tesseract-ocr${NC}"
fi

# Check for poppler (PDF processing)
if command -v pdftoppm &> /dev/null; then
    echo -e "${GREEN}✓ Poppler found${NC}"
else
    echo -e "${YELLOW}⚠ Poppler not found - install with:${NC}"
    echo -e "${YELLOW}  macOS: brew install poppler${NC}"
    echo -e "${YELLOW}  Ubuntu: sudo apt-get install poppler-utils${NC}"
fi

# -----------------------------------------------------------------------------
# Stop existing processes
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[4/6] Stopping existing processes...${NC}"

# Kill existing uvicorn processes for this app
pkill -f "uvicorn server:app" 2>/dev/null || true

# Kill existing celery workers
pkill -f "celery -A celery_app worker" 2>/dev/null || true

sleep 2
echo -e "${GREEN}✓ Existing processes stopped${NC}"

# -----------------------------------------------------------------------------
# Start FastAPI server
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[5/6] Starting FastAPI server...${NC}"

API_PORT="${API_PORT:-9219}"
API_HOST="${API_HOST:-0.0.0.0}"
API_WORKERS="${API_WORKERS:-1}"

# Create logs directory
mkdir -p logs

# Start uvicorn in background
nohup poetry run uvicorn server:app \
    --host "$API_HOST" \
    --port "$API_PORT" \
    --workers "$API_WORKERS" \
    > logs/api.log 2>&1 &

API_PID=$!
echo $API_PID > logs/api.pid

sleep 2

if kill -0 $API_PID 2>/dev/null; then
    echo -e "${GREEN}✓ FastAPI server started (PID: $API_PID)${NC}"
else
    echo -e "${RED}ERROR: FastAPI server failed to start${NC}"
    echo -e "${YELLOW}Check logs/api.log for details${NC}"
    exit 1
fi

# -----------------------------------------------------------------------------
# Start Celery worker
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[6/6] Starting Celery worker...${NC}"

CELERY_CONCURRENCY="${CELERY_CONCURRENCY:-2}"

# Start celery worker in background
nohup poetry run celery -A celery_app worker \
    --loglevel=info \
    --concurrency=$CELERY_CONCURRENCY \
    > logs/celery.log 2>&1 &

CELERY_PID=$!
echo $CELERY_PID > logs/celery.pid

sleep 2

if kill -0 $CELERY_PID 2>/dev/null; then
    echo -e "${GREEN}✓ Celery worker started (PID: $CELERY_PID)${NC}"
else
    echo -e "${RED}ERROR: Celery worker failed to start${NC}"
    echo -e "${YELLOW}Check logs/celery.log for details${NC}"
    exit 1
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Documents API deployment complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "API URL: http://${API_HOST}:${API_PORT}"
echo -e "API PID: $API_PID"
echo -e "Celery PID: $CELERY_PID"
echo -e ""
echo -e "${BLUE}Log files:${NC}"
echo -e "  logs/api.log     # FastAPI logs"
echo -e "  logs/celery.log  # Celery worker logs"
echo -e ""
echo -e "${BLUE}Useful commands:${NC}"
echo -e "  tail -f logs/api.log     # Watch API logs"
echo -e "  tail -f logs/celery.log  # Watch Celery logs"
echo -e "  kill \$(cat logs/api.pid)    # Stop API"
echo -e "  kill \$(cat logs/celery.pid) # Stop Celery"
