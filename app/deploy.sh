#!/bin/bash

# =============================================================================
# DMS App (Next.js) Deployment Script
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
echo -e "${BLUE}   DMS App (Next.js) Deployment${NC}"
echo -e "${BLUE}========================================${NC}"

# -----------------------------------------------------------------------------
# Setup NVM and Node.js
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[1/7] Setting up Node.js environment...${NC}"

# Required Node.js version
REQUIRED_NODE_VERSION="20.9.0"

# Load nvm if available
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

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

# Compare versions (check if current >= required)
version_gte() {
    [ "$(printf '%s\n' "$1" "$2" | sort -V | head -n1)" = "$2" ]
}

if ! version_gte "$CURRENT_NODE_VERSION" "$REQUIRED_NODE_VERSION"; then
    echo -e "${YELLOW}Node.js $CURRENT_NODE_VERSION found, but >= $REQUIRED_NODE_VERSION required${NC}"
    echo -e "${BLUE}Installing Node.js $REQUIRED_NODE_VERSION via nvm...${NC}"
    nvm install "$REQUIRED_NODE_VERSION"
    nvm use "$REQUIRED_NODE_VERSION"
    nvm alias default "$REQUIRED_NODE_VERSION"
fi

# Ensure we're using the correct version
nvm use "$REQUIRED_NODE_VERSION" 2>/dev/null || true

NODE_VERSION=$(node -v)
NODE_PATH=$(which node)
echo -e "${GREEN}✓ Node.js ${NODE_VERSION} ready${NC}"
echo -e "${GREEN}✓ Node path: ${NODE_PATH}${NC}"

# Create .nvmrc file for future use
echo "$REQUIRED_NODE_VERSION" > .nvmrc
echo -e "${GREEN}✓ Created .nvmrc file${NC}"

# -----------------------------------------------------------------------------
# Pre-flight checks
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[2/7] Running pre-flight checks...${NC}"

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${RED}ERROR: .env file not found in app directory${NC}"
    echo -e "${YELLOW}Please create a .env file with the required environment variables${NC}"
    exit 1
fi
echo -e "${GREEN}✓ .env file found${NC}"

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo -e "${RED}ERROR: package.json not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ package.json found${NC}"

# Check if prisma schema exists
if [ ! -f "prisma/schema.prisma" ]; then
    echo -e "${RED}ERROR: prisma/schema.prisma not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Prisma schema found${NC}"

# Install pnpm locally if not available
if ! command -v pnpm &> /dev/null && [ ! -f "node_modules/.bin/pnpm" ]; then
    echo -e "${YELLOW}pnpm not found, installing locally...${NC}"
    npm install pnpm --save-dev
fi

# Set pnpm command (prefer local, fallback to global)
if [ -f "node_modules/.bin/pnpm" ]; then
    PNPM="./node_modules/.bin/pnpm"
else
    PNPM="pnpm"
fi
PNPM_VERSION=$($PNPM -v)
echo -e "${GREEN}✓ pnpm ${PNPM_VERSION} found${NC}"

# Install PM2 locally if not available
if ! command -v pm2 &> /dev/null && [ ! -f "node_modules/.bin/pm2" ]; then
    echo -e "${YELLOW}PM2 not found, installing locally...${NC}"
    npm install pm2 --save-dev
fi

# Set PM2 command (prefer local, fallback to global)
if [ -f "node_modules/.bin/pm2" ]; then
    PM2="./node_modules/.bin/pm2"
else
    PM2="pm2"
fi
PM2_VERSION=$($PM2 -v)
echo -e "${GREEN}✓ PM2 ${PM2_VERSION} found${NC}"

# -----------------------------------------------------------------------------
# Install dependencies
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[3/7] Installing dependencies...${NC}"
$PNPM install
echo -e "${GREEN}✓ Dependencies installed${NC}"

# -----------------------------------------------------------------------------
# Generate Prisma client
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[4/7] Generating Prisma client...${NC}"
npx prisma generate
echo -e "${GREEN}✓ Prisma client generated${NC}"

# -----------------------------------------------------------------------------
# Run database migrations
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[5/7] Running database migrations...${NC}"
npx prisma migrate deploy
echo -e "${GREEN}✓ Database migrations applied${NC}"

# -----------------------------------------------------------------------------
# Build application
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[6/7] Building application...${NC}"
$PNPM run build
echo -e "${GREEN}✓ Application built${NC}"

# -----------------------------------------------------------------------------
# Start/Restart with PM2
# -----------------------------------------------------------------------------
echo -e "\n${YELLOW}[7/7] Starting application with PM2...${NC}"

APP_NAME="dms-app"
PORT="${PORT:-3000}"

# Find the standalone server.js path
STANDALONE_DIR="${SCRIPT_DIR}/.next/standalone/app"
SERVER_JS="${STANDALONE_DIR}/server.js"

if [ ! -f "$SERVER_JS" ]; then
    echo -e "${RED}ERROR: Standalone server.js not found at ${SERVER_JS}${NC}"
    echo -e "${YELLOW}Searching for server.js...${NC}"
    find .next/standalone -name "server.js" -type f | head -5
    exit 1
fi

echo -e "${GREEN}✓ Found standalone server at ${SERVER_JS}${NC}"

# Stop and delete existing app if running
$PM2 delete "$APP_NAME" 2>/dev/null || true

# Start with PM2 using the correct Node.js path and working directory
echo -e "${BLUE}Starting PM2 process...${NC}"
$PM2 start "$NODE_PATH" \
    --name "$APP_NAME" \
    --cwd "$STANDALONE_DIR" \
    -- server.js

# Save PM2 process list
$PM2 save

# Wait a moment and check status
sleep 3

# Check if the app is running
APP_STATUS=$($PM2 show "$APP_NAME" 2>/dev/null | grep "status" | awk '{print $4}' || echo "unknown")

if [ "$APP_STATUS" = "online" ]; then
    echo -e "${GREEN}✓ Application started successfully${NC}"
else
    echo -e "${RED}⚠ Application may have issues. Status: ${APP_STATUS}${NC}"
    echo -e "${YELLOW}Check logs with: $PM2 logs $APP_NAME${NC}"
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}✓ App deployment complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "App Name: ${APP_NAME}"
echo -e "Port: ${PORT}"
echo -e "Node.js: ${NODE_VERSION}"
echo -e "URL: http://localhost:${PORT}"
echo -e ""
echo -e "${BLUE}Useful PM2 commands:${NC}"
echo -e "  $PM2 status              # Check status"
echo -e "  $PM2 logs ${APP_NAME}    # View logs"
echo -e "  $PM2 restart ${APP_NAME} # Restart app"
echo -e "  $PM2 stop ${APP_NAME}    # Stop app"
echo -e "  $PM2 monit               # Monitor all processes"
