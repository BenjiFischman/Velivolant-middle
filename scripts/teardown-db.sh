#!/bin/bash

# PostgreSQL Database Teardown Script
# Gracefully tears down database, connections, and optionally removes data

set -e

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${RED}PostgreSQL Database Teardown${NC}"
echo "========================================"
echo ""

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo -e "${YELLOW}Warning: .env file not found, using defaults${NC}"
    POSTGRES_HOST=${POSTGRES_HOST:-localhost}
    POSTGRES_PORT=${POSTGRES_PORT:-5432}
    POSTGRES_DB=${POSTGRES_DB:-velivolant_db}
    POSTGRES_USER=${POSTGRES_USER:-velivolant}
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
    if docker ps --format '{{.Names}}' | grep -q postgres; then
        echo -e "${BLUE}PostgreSQL running in Docker${NC}"
    else
        echo -e "${YELLOW}PostgreSQL is not running. Nothing to tear down.${NC}"
        exit 0
    fi
fi

echo -e "${GREEN}✓ PostgreSQL is accessible${NC}"
echo ""

# Function to terminate active connections
terminate_connections() {
    local db=$1
    echo -e "${YELLOW}Terminating active connections to '$db'...${NC}"
    
    docker exec velivolant-postgres psql -U postgres -c "
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = '$db'
          AND pid <> pg_backend_pid()
          AND backend_type = 'client backend';
    " 2>/dev/null || psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U postgres -c "
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = '$db'
          AND pid <> pg_backend_pid()
          AND backend_type = 'client backend';
    " 2>/dev/null || echo -e "${YELLOW}  Could not terminate connections (may require superuser)${NC}"
}

# Ask for confirmation
echo -e "${RED}WARNING: This will destroy the database and all data!${NC}"
echo -e "${YELLOW}What would you like to do?${NC}"
echo ""
echo "1) Drop database only (keep role/user)"
echo "2) Drop database and remove role/user"
echo "3) Full teardown (database, role, and Docker container)"
echo "4) Cancel"
echo ""
read -p "Enter choice [1-4]: " choice

case $choice in
    1)
        echo ""
        echo -e "${YELLOW}Dropping database '$POSTGRES_DB'...${NC}"
        
        # Terminate connections
        terminate_connections $POSTGRES_DB
        
        # Wait a moment for connections to close
        sleep 2
        
        # Drop database
        docker exec velivolant-postgres psql -U postgres -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\";" 2>/dev/null || \
            psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U postgres -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\";" || {
            echo -e "${RED}Failed to drop database${NC}"
            exit 1
        }
        
        echo -e "${GREEN}✓ Database '$POSTGRES_DB' dropped${NC}"
        echo -e "${BLUE}Role '$POSTGRES_USER' preserved${NC}"
        ;;
        
    2)
        echo ""
        echo -e "${YELLOW}Dropping database and role...${NC}"
        
        # Terminate connections
        terminate_connections $POSTGRES_DB
        sleep 2
        
        # Drop database
        echo -e "${YELLOW}Dropping database '$POSTGRES_DB'...${NC}"
        docker exec velivolant-postgres psql -U postgres -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\";" 2>/dev/null || \
            psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U postgres -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\";"
        echo -e "${GREEN}✓ Database dropped${NC}"
        
        # Revoke privileges and drop role
        echo -e "${YELLOW}Dropping role '$POSTGRES_USER'...${NC}"
        docker exec velivolant-postgres psql -U postgres -c "DROP ROLE IF EXISTS \"$POSTGRES_USER\";" 2>/dev/null || \
            psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U postgres -c "DROP ROLE IF EXISTS \"$POSTGRES_USER\";"
        echo -e "${GREEN}✓ Role dropped${NC}"
        ;;
        
    3)
        echo ""
        echo -e "${YELLOW}Full teardown: database, role, and Docker container...${NC}"
        
        # Stop Docker container if running
        if docker ps --format '{{.Names}}' | grep -q velivolant-postgres; then
            echo -e "${YELLOW}Stopping PostgreSQL container...${NC}"
            docker stop velivolant-postgres
            echo -e "${GREEN}✓ Container stopped${NC}"
        fi
        
        # Remove Docker container
        if docker ps -a --format '{{.Names}}' | grep -q velivolant-postgres; then
            echo -e "${YELLOW}Removing PostgreSQL container...${NC}"
            docker rm velivolant-postgres
            echo -e "${GREEN}✓ Container removed${NC}"
        fi
        
        # Ask about volumes
        echo ""
        read -p "Remove Docker volumes (all data will be lost)? [y/N]: " remove_volumes
        if [[ $remove_volumes =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}Removing Docker volumes...${NC}"
            docker volume rm middle_postgres_data 2>/dev/null || docker volume rm postgres_data 2>/dev/null || echo -e "${YELLOW}  No volumes found${NC}"
            echo -e "${GREEN}✓ Volumes removed${NC}"
        fi
        ;;
        
    4)
        echo ""
        echo -e "${BLUE}Teardown cancelled${NC}"
        exit 0
        ;;
        
    *)
        echo ""
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}✓ Teardown complete!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""

if [ "$choice" != "3" ]; then
    echo "To rebuild, run:"
    echo "  ./scripts/setup-db.sh"
else
    echo "To rebuild from scratch, run:"
    echo "  docker-compose up -d postgres"
    echo "  ./scripts/setup-db.sh"
fi
echo ""

