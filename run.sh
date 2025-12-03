#!/bin/bash

echo "Starting WSI DeepZoom Viewer..."
echo ""

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "ERROR: Virtual environment not found!"
    echo "Please run setup.sh first"
    exit 1
fi

# Activate virtual environment
source venv/bin/activate

# Check if dependencies are installed
python -c "import fastapi" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "ERROR: Dependencies not installed!"
    echo "Please run setup.sh first"
    exit 1
fi

# Create necessary directories
mkdir -p uploads cache

# Set host (0.0.0.0 for server, 127.0.0.1 for local)
HOST=${HOST:-0.0.0.0}
PORT=${PORT:-8000}

# Start server
echo "Server starting on http://${HOST}:${PORT}"
echo "Press Ctrl+C to stop"
echo ""
uvicorn app:app --host "$HOST" --port "$PORT" --reload

