#!/bin/bash

# Redis Management Script
# Usage: ./scripts/redis.sh [start|stop|restart|status]

REDIS_CONTAINER_NAME="middle-redis-1"
USE_DOCKER=${USE_DOCKER:-true}

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if Docker is available
check_docker() {
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Docker is not installed or not in PATH${NC}"
        return 1
    fi
    return 0
}

# Function to check if redis-server is available locally
check_redis_local() {
    if ! command -v redis-server &> /dev/null; then
        echo -e "${RED}redis-server is not installed or not in PATH${NC}"
        return 1
    fi
    return 0
}

# Start Redis
start_redis() {
    if [ "$USE_DOCKER" = "true" ]; then
        if check_docker; then
            echo -e "${GREEN}Starting Redis via Docker...${NC}"
            docker-compose up -d redis
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}Redis started successfully via Docker${NC}"
                docker ps | grep redis
            else
                echo -e "${RED}Failed to start Redis via Docker${NC}"
                exit 1
            fi
        else
            echo -e "${YELLOW}Falling back to local Redis...${NC}"
            USE_DOCKER=false
            start_redis
        fi
    else
        if check_redis_local; then
            echo -e "${GREEN}Starting Redis locally...${NC}"
            redis-server --daemonize yes --port 6379
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}Redis started successfully on port 6379${NC}"
            else
                echo -e "${RED}Failed to start Redis locally${NC}"
                exit 1
            fi
        else
            echo -e "${RED}Cannot start Redis: neither Docker nor redis-server is available${NC}"
            exit 1
        fi
    fi
}

# Stop Redis
stop_redis() {
    if [ "$USE_DOCKER" = "true" ]; then
        if check_docker; then
            echo -e "${YELLOW}Stopping Redis via Docker...${NC}"
            docker-compose stop redis
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}Redis stopped successfully${NC}"
            else
                echo -e "${RED}Failed to stop Redis${NC}"
                exit 1
            fi
        fi
    else
        echo -e "${YELLOW}Stopping Redis locally...${NC}"
        redis-cli shutdown
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}Redis stopped successfully${NC}"
        else
            echo -e "${RED}Failed to stop Redis${NC}"
            exit 1
        fi
    fi
}

# Check Redis status
status_redis() {
    echo -e "${GREEN}Checking Redis status...${NC}"
    
    if [ "$USE_DOCKER" = "true" ]; then
        if check_docker; then
            if docker ps | grep -q redis; then
                echo -e "${GREEN}Redis is running via Docker${NC}"
                docker ps | grep redis
                return 0
            else
                echo -e "${RED}Redis is not running via Docker${NC}"
                return 1
            fi
        fi
    fi
    
    # Check if Redis is responding
    if command -v redis-cli &> /dev/null; then
        if redis-cli ping &> /dev/null; then
            echo -e "${GREEN}Redis is running and responding to ping${NC}"
            redis-cli info server | grep -E "redis_version|uptime_in_seconds|tcp_port"
            return 0
        else
            echo -e "${RED}Redis is not responding${NC}"
            return 1
        fi
    else
        echo -e "${YELLOW}redis-cli not available, cannot check status${NC}"
        return 1
    fi
}

# Restart Redis
restart_redis() {
    echo -e "${YELLOW}Restarting Redis...${NC}"
    stop_redis
    sleep 2
    start_redis
}

# Main script logic
case "$1" in
    start)
        start_redis
        ;;
    stop)
        stop_redis
        ;;
    restart)
        restart_redis
        ;;
    status)
        status_redis
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        echo ""
        echo "Environment variables:"
        echo "  USE_DOCKER=true|false  - Use Docker (default: true) or local Redis"
        echo ""
        echo "Examples:"
        echo "  $0 start           # Start Redis via Docker"
        echo "  USE_DOCKER=false $0 start  # Start local Redis"
        exit 1
        ;;
esac

exit 0
