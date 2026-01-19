#!/bin/bash

# =============================================================================
# DMS Full Stack Deployment Script (No Docker, No Sudo)
# =============================================================================
# 
# This script deploys the entire DMS application stack:
#   - Next.js App (frontend)
#   - Documents API (FastAPI backend)
#   - Celery Worker (background tasks)
#
# All dependencies are installed locally (no sudo required)
# Uses nvm for Node.js version management
#
# Prerequisites:
#   - Python 3.11+
#   - Redis server running
#   - PostgreSQL database accessible
#   - curl (for installing nvm if needed)
#
# Usage:
#   ./deploy.sh [options]
#
# Options:
#   --app-only      Deploy only the Next.js app
#   --api-only      Deploy only the Documents API
#   --stop          Stop all services
#   --status        Show status of all services
#   --logs          Show logs from all services
#   --help          Show this help message
#
# =============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script directory (root of project)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Add user's local bin to PATH for poetry
export PATH="$HOME/.local/bin:$PATH"

# Load nvm if available
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Default values
DEPLOY_APP=true
DEPLOY_API=true

# Required Node.js version
REQUIRED_NODE_VERSION="20.9.0"

# -----------------------------------------------------------------------------
# Helper functions
# -----------------------------------------------------------------------------

print_banner() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════════╗"
    echo "║                                                                   ║"
    echo "║     ██████╗ ███╗   ███╗███████╗    ██████╗ ███████╗██████╗ ██╗    ║"
    echo "║     ██╔══██╗████╗ ████║██╔════╝    ██╔══██╗██╔════╝██╔══██╗██║    ║"
    echo "║     ██║  ██║██╔████╔██║███████╗    ██║  ██║█████╗  ██████╔╝██║    ║"
    echo "║     ██║  ██║██║╚██╔╝██║╚════██║    ██║  ██║██╔══╝  ██╔═══╝ ██║    ║"
    echo "║     ██████╔╝██║ ╚═╝ ██║███████║    ██████╔╝███████╗██║     ███████╗"
    echo "║     ╚═════╝ ╚═╝     ╚═╝╚══════╝    ╚═════╝ ╚══════╝╚═╝     ╚══════╝"
    echo "║                                                                   ║"
    echo "║                   Document Management System                      ║"
    echo "║                      Deployment Script                            ║"
    echo "║                                                                   ║"
    echo "╚═══════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

show_help() {
    echo "Usage: ./deploy.sh [options]"
    echo ""
    echo "Options:"
    echo "  --app-only      Deploy only the Next.js app"
    echo "  --api-only      Deploy only the Documents API"
    echo "  --stop          Stop all services"
    echo "  --status        Show status of all services"
    echo "  --logs          Show logs from all services"
    echo "  --help          Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  PORT              Next.js app port (default: 3000)"
    echo "  API_PORT          Documents API port (default: 9219)"
    echo "  API_WORKERS       Number of API workers (default: 1)"
    echo "  CELERY_CONCURRENCY  Celery worker concurrency (default: 2)"
    echo ""
    echo "Examples:"
    echo "  ./deploy.sh                    # Full deployment"
    echo "  ./deploy.sh --app-only         # Deploy only the app"
    echo "  ./deploy.sh --api-only         # Deploy only the API"
    echo "  ./deploy.sh --stop             # Stop all services"
}

# Get PM2 command (local or global)
get_pm2_cmd() {
    if [ -f "app/node_modules/.bin/pm2" ]; then
        echo "app/node_modules/.bin/pm2"
    elif command -v pm2 &> /dev/null; then
        echo "pm2"
    else
        echo ""
    fi
}

stop_all_services() {
    echo -e "${YELLOW}Stopping all services...${NC}"
    
    # Stop PM2 app
    PM2_CMD=$(get_pm2_cmd)
    if [ -n "$PM2_CMD" ]; then
        $PM2_CMD stop dms-app 2>/dev/null || true
        echo -e "${GREEN}✓ Next.js app stopped${NC}"
    fi
    
    # Stop API
    if [ -f "documents-api/logs/api.pid" ]; then
        kill $(cat documents-api/logs/api.pid) 2>/dev/null || true
        rm -f documents-api/logs/api.pid
        echo -e "${GREEN}✓ FastAPI server stopped${NC}"
    fi
    
    # Stop Celery
    if [ -f "documents-api/logs/celery.pid" ]; then
        kill $(cat documents-api/logs/celery.pid) 2>/dev/null || true
        rm -f documents-api/logs/celery.pid
        echo -e "${GREEN}✓ Celery worker stopped${NC}"
    fi
    
    # Also kill any remaining processes
    pkill -f "uvicorn server:app" 2>/dev/null || true
    pkill -f "celery -A celery_app worker" 2>/dev/null || true
    
    echo -e "${GREEN}✓ All services stopped${NC}"
}

show_status() {
    echo -e "${CYAN}Service Status:${NC}"
    echo ""
    
    # Check PM2 app
    echo -e "${BLUE}Next.js App (PM2):${NC}"
    PM2_CMD=$(get_pm2_cmd)
    if [ -n "$PM2_CMD" ]; then
        $PM2_CMD describe dms-app 2>/dev/null | grep -E "status|pid|uptime|memory" || echo "  Not running"
    else
        echo "  PM2 not installed"
    fi
    echo ""
    
    # Check API
    echo -e "${BLUE}FastAPI Server:${NC}"
    if [ -f "documents-api/logs/api.pid" ]; then
        API_PID=$(cat documents-api/logs/api.pid)
        if kill -0 $API_PID 2>/dev/null; then
            echo "  Running (PID: $API_PID)"
        else
            echo "  Not running (stale PID file)"
        fi
    else
        echo "  Not running"
    fi
    echo ""
    
    # Check Celery
    echo -e "${BLUE}Celery Worker:${NC}"
    if [ -f "documents-api/logs/celery.pid" ]; then
        CELERY_PID=$(cat documents-api/logs/celery.pid)
        if kill -0 $CELERY_PID 2>/dev/null; then
            echo "  Running (PID: $CELERY_PID)"
        else
            echo "  Not running (stale PID file)"
        fi
    else
        echo "  Not running"
    fi
    echo ""
    
    # Check Redis
    echo -e "${BLUE}Redis:${NC}"
    if command -v redis-cli &> /dev/null && redis-cli ping &> /dev/null; then
        echo "  Running"
    else
        echo "  Not running or not accessible"
    fi
}

show_logs() {
    echo -e "${CYAN}Showing logs (Ctrl+C to exit)...${NC}"
    echo ""
    
    # Use multitail if available, otherwise tail
    if command -v multitail &> /dev/null; then
        multitail -i documents-api/logs/api.log -i documents-api/logs/celery.log
    else
        echo -e "${YELLOW}Tip: Install 'multitail' for better log viewing${NC}"
        echo ""
        tail -f documents-api/logs/api.log documents-api/logs/celery.log 2>/dev/null || \
        echo "No log files found. Services may not be running."
    fi
}

# Compare versions (check if $1 >= $2)
version_gte() {
    [ "$(printf '%s\n' "$1" "$2" | sort -V | head -n1)" = "$2" ]
}

setup_nodejs() {
    echo -e "${YELLOW}Setting up Node.js environment...${NC}"
    
    # Check if nvm is available
    if ! command -v nvm &> /dev/null; then
        echo -e "${YELLOW}nvm not found, installing...${NC}"
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
        
        # Load nvm
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    fi
    
    # Check current Node.js version
    CURRENT_NODE_VERSION=$(node -v 2>/dev/null | sed 's/v//' || echo "0.0.0")
    
    if ! version_gte "$CURRENT_NODE_VERSION" "$REQUIRED_NODE_VERSION"; then
        echo -e "${YELLOW}Node.js $CURRENT_NODE_VERSION found, but >= $REQUIRED_NODE_VERSION required${NC}"
        echo -e "${BLUE}Installing Node.js $REQUIRED_NODE_VERSION via nvm...${NC}"
        nvm install "$REQUIRED_NODE_VERSION"
        nvm use "$REQUIRED_NODE_VERSION"
        nvm alias default "$REQUIRED_NODE_VERSION"
    fi
    
    echo -e "${GREEN}✓ Node.js $(node -v) ready${NC}"
}

check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"
    
    local missing=false
    
    # Setup Node.js (will install via nvm if needed)
    if [ "$DEPLOY_APP" = true ]; then
        setup_nodejs
    fi
    
    # Check Python
    if command -v python3 &> /dev/null; then
        echo -e "${GREEN}✓ $(python3 --version)${NC}"
    else
        echo -e "${RED}✗ Python3 not found${NC}"
        missing=true
    fi
    
    # Check Redis
    if command -v redis-cli &> /dev/null && redis-cli ping &> /dev/null; then
        echo -e "${GREEN}✓ Redis is running${NC}"
    else
        echo -e "${RED}✗ Redis is not running${NC}"
        echo -e "${YELLOW}  Start Redis with: redis-server${NC}"
        missing=true
    fi
    
    if [ "$missing" = true ]; then
        echo -e "\n${RED}Please install missing prerequisites before deploying${NC}"
        exit 1
    fi
}

# -----------------------------------------------------------------------------
# Parse arguments
# -----------------------------------------------------------------------------

while [[ $# -gt 0 ]]; do
    case $1 in
        --app-only)
            DEPLOY_APP=true
            DEPLOY_API=false
            shift
            ;;
        --api-only)
            DEPLOY_APP=false
            DEPLOY_API=true
            shift
            ;;
        --stop)
            stop_all_services
            exit 0
            ;;
        --status)
            show_status
            exit 0
            ;;
        --logs)
            show_logs
            exit 0
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

# -----------------------------------------------------------------------------
# Main deployment
# -----------------------------------------------------------------------------

print_banner

echo -e "${MAGENTA}Starting deployment at $(date)${NC}\n"

# Check prerequisites
echo -e "${YELLOW}[1/4] Checking prerequisites...${NC}"
check_prerequisites

# -----------------------------------------------------------------------------
# Pre-flight checks
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[2/4] Running pre-flight checks...${NC}"

if [ "$DEPLOY_APP" = true ]; then
    if [ ! -f "app/.env" ]; then
        echo -e "${RED}ERROR: app/.env file not found${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ app/.env found${NC}"
fi

if [ "$DEPLOY_API" = true ]; then
    if [ ! -f "documents-api/.env" ]; then
        echo -e "${RED}ERROR: documents-api/.env file not found${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ documents-api/.env found${NC}"
fi

# -----------------------------------------------------------------------------
# Deploy services
# -----------------------------------------------------------------------------

if [ "$DEPLOY_API" = true ]; then
    echo -e "\n${YELLOW}[3/4] Deploying Documents API...${NC}"
    cd documents-api
    chmod +x deploy.sh
    ./deploy.sh
    cd "$SCRIPT_DIR"
else
    echo -e "\n${YELLOW}[3/4] Skipping Documents API (--app-only)${NC}"
fi

if [ "$DEPLOY_APP" = true ]; then
    echo -e "\n${YELLOW}[4/4] Deploying Next.js App...${NC}"
    cd app
    chmod +x deploy.sh
    ./deploy.sh
    cd "$SCRIPT_DIR"
else
    echo -e "\n${YELLOW}[4/4] Skipping Next.js App (--api-only)${NC}"
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo -e "\n${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    DEPLOYMENT COMPLETE                            ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

show_status

echo ""
echo -e "${CYAN}Access Points:${NC}"
if [ "$DEPLOY_APP" = true ]; then
    echo -e "  ${GREEN}•${NC} App:           http://localhost:${PORT:-3000}"
fi
if [ "$DEPLOY_API" = true ]; then
    echo -e "  ${GREEN}•${NC} Documents API: http://localhost:${API_PORT:-9219}"
fi
echo ""
echo -e "${CYAN}Useful Commands:${NC}"
echo -e "  ${BLUE}./deploy.sh --logs${NC}      View all service logs"
echo -e "  ${BLUE}./deploy.sh --status${NC}   Check service status"
echo -e "  ${BLUE}./deploy.sh --stop${NC}     Stop all services"
echo ""
echo -e "${MAGENTA}Deployment completed at $(date)${NC}"
