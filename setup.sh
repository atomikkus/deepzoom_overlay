#!/bin/bash

echo "========================================"
echo "WSI DeepZoom Viewer - Setup Script"
echo "========================================"
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 is not installed"
    echo "Please install Python 3.8 or higher"
    exit 1
fi

echo "[1/4] Python found:"
python3 --version
echo ""

# Create virtual environment
echo "[2/4] Creating virtual environment..."
if [ -d "venv" ]; then
    echo "Virtual environment already exists. Skipping..."
else
    python3 -m venv venv
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to create virtual environment"
        exit 1
    fi
    echo "Virtual environment created successfully!"
fi
echo ""

# Activate virtual environment
echo "[3/4] Activating virtual environment..."
source venv/bin/activate
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to activate virtual environment"
    exit 1
fi
echo "Virtual environment activated!"
echo ""

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip
echo ""

# Check for OpenSlide
echo "Checking for OpenSlide..."
if ! command -v openslide-show-properties &> /dev/null; then
    echo "WARNING: OpenSlide not found in PATH"
    echo "You may need to install: sudo apt-get install openslide-tools libopenslide-dev"
    echo ""
fi

# Install dependencies
echo "[4/4] Installing dependencies..."
pip install -r requirements.txt
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install dependencies"
    echo ""
    echo "Common issues:"
    echo "- openslide-python may require OpenSlide libraries"
    echo "  Install with: sudo apt-get install openslide-tools libopenslide-dev (Ubuntu/Debian)"
    echo "  or: brew install openslide (macOS)"
    exit 1
fi
echo ""
echo "========================================"
echo "Setup completed successfully!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Place your GCS service account JSON file in the project root"
echo "2. Update GCS_SERVICE_ACCOUNT_PATH in app.py if needed"
echo "3. Run: source venv/bin/activate"
echo "4. Run: uvicorn app:app --reload --port 8000"
echo "5. Open: http://localhost:8000"
echo ""

