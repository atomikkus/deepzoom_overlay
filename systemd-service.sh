#!/bin/bash

# Script to create systemd service for WSI DeepZoom Viewer

SERVICE_NAME="wsi-viewer"
SERVICE_USER=$(whoami)
PROJECT_DIR=$(pwd)
PYTHON_PATH="$PROJECT_DIR/venv/bin/python"
SCRIPT_PATH="$PROJECT_DIR/venv/bin/uvicorn"

echo "Creating systemd service for WSI DeepZoom Viewer..."
echo "Project directory: $PROJECT_DIR"
echo "Service user: $SERVICE_USER"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    echo "ERROR: Do not run this script as root"
    echo "Run as the user who will own the service"
    exit 1
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "ERROR: Virtual environment not found!"
    echo "Please run ./setup.sh first"
    exit 1
fi

# Create systemd service file
SERVICE_FILE="/tmp/${SERVICE_NAME}.service"

cat > "$SERVICE_FILE" << EOF
[Unit]
Description=WSI DeepZoom Viewer
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$PROJECT_DIR
Environment="PATH=$PROJECT_DIR/venv/bin"
ExecStart=$SCRIPT_PATH app:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo "Service file created at: $SERVICE_FILE"
echo ""
echo "To install the service:"
echo "1. Copy the service file:"
echo "   sudo cp $SERVICE_FILE /etc/systemd/system/${SERVICE_NAME}.service"
echo ""
echo "2. Reload systemd:"
echo "   sudo systemctl daemon-reload"
echo ""
echo "3. Enable and start the service:"
echo "   sudo systemctl enable ${SERVICE_NAME}"
echo "   sudo systemctl start ${SERVICE_NAME}"
echo ""
echo "4. Check status:"
echo "   sudo systemctl status ${SERVICE_NAME}"
echo ""
echo "5. View logs:"
echo "   sudo journalctl -u ${SERVICE_NAME} -f"
echo ""

