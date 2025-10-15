#!/bin/bash

# PostgreSQL Database Setup Script
# Sets up the database to work with both middle layer and yazhitite

set -e

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}PostgreSQL Database Setup${NC}"
echo "========================================"

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo -e "${YELLOW}Warning: .env file not found, using defaults${NC}"
    POSTGRES_HOST=${POSTGRES_HOST:-localhost}
    POSTGRES_PORT=${POSTGRES_PORT:-5432}
    POSTGRES_DB=${POSTGRES_DB:-libation_db}
    POSTGRES_USER=${POSTGRES_USER:-libation}
    POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-changeme}
fi

echo "Configuration:"
echo "  Host: $POSTGRES_HOST"
echo "  Port: $POSTGRES_PORT"
echo "  Database: $POSTGRES_DB"
echo "  User: $POSTGRES_USER"
echo ""

# Check if PostgreSQL is running
echo -e "${YELLOW}Checking PostgreSQL connection...${NC}"
if ! pg_isready -h $POSTGRES_HOST -p $POSTGRES_PORT > /dev/null 2>&1; then
    echo -e "${RED}PostgreSQL is not running on $POSTGRES_HOST:$POSTGRES_PORT${NC}"
    echo ""
    echo "To start PostgreSQL:"
    echo "  macOS (Homebrew): brew services start postgresql"
    echo "  Docker: docker run -d --name postgres -e POSTGRES_PASSWORD=changeme -p 5432:5432 postgres:16-alpine"
    echo "  yazhitite: ./scripts/run_demo.sh (in yazhitite directory)"
    exit 1
fi

echo -e "${GREEN}✓ PostgreSQL is running${NC}"
echo ""

# Check if database exists
echo -e "${YELLOW}Checking if database exists...${NC}"
if psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U postgres -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw $POSTGRES_DB; then
    echo -e "${GREEN}✓ Database '$POSTGRES_DB' exists${NC}"
else
    echo -e "${YELLOW}Creating database '$POSTGRES_DB'...${NC}"
    createdb -h $POSTGRES_HOST -p $POSTGRES_PORT -U postgres $POSTGRES_DB || {
        echo -e "${RED}Failed to create database. You may need to create it manually:${NC}"
        echo "  psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U postgres"
        echo "  CREATE DATABASE $POSTGRES_DB;"
        echo "  CREATE USER $POSTGRES_USER WITH PASSWORD '$POSTGRES_PASSWORD';"
        echo "  GRANT ALL PRIVILEGES ON DATABASE $POSTGRES_DB TO $POSTGRES_USER;"
        exit 1
    }
    echo -e "${GREEN}✓ Database created${NC}"
fi

echo ""

# Ensure required role exists
check_role=$(psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname = '$POSTGRES_USER';")
if [ "$check_role" != "1" ]; then
    echo -e "${YELLOW}Creating role '$POSTGRES_USER'...${NC}"
    psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U postgres -c "CREATE ROLE \"$POSTGRES_USER\" WITH LOGIN PASSWORD '$POSTGRES_PASSWORD';" || {
        echo -e "${RED}Failed to create role '$POSTGRES_USER'. Please create it manually and re-run the script.${NC}"
        exit 1
    }
    echo -e "${GREEN}✓ Role created${NC}"
else
    echo -e "${GREEN}✓ Role '$POSTGRES_USER' exists${NC}"
    echo -e "${YELLOW}Ensuring password is up to date...${NC}"
    psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U postgres -c "ALTER ROLE \"$POSTGRES_USER\" WITH PASSWORD '$POSTGRES_PASSWORD';" > /dev/null
fi

# Grant privileges to role
psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U postgres -d $POSTGRES_DB -c "GRANT ALL PRIVILEGES ON DATABASE \"$POSTGRES_DB\" TO \"$POSTGRES_USER\";" > /dev/null

# Run migrations
echo -e "${YELLOW}Running migrations...${NC}"
node db/runMigrations.js

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Migrations completed successfully${NC}"
else
    echo -e "${RED}✗ Migrations failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}✓ Database setup complete!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo "You can now start the server:"
echo "  npm run dev"
echo ""
echo "To verify the setup:"
echo "  psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB -c '\\dt'"
