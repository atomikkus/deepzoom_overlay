@echo off
echo Starting WSI DeepZoom Viewer...
echo.

REM Check if virtual environment exists
if not exist venv (
    echo ERROR: Virtual environment not found!
    echo Please run setup.bat first
    pause
    exit /b 1
)

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Check if dependencies are installed
python -c "import fastapi" >nul 2>&1
if errorlevel 1 (
    echo ERROR: Dependencies not installed!
    echo Please run setup.bat first
    pause
    exit /b 1
)

REM Create necessary directories
if not exist uploads mkdir uploads
if not exist cache mkdir cache

REM Start server
echo Server starting on http://localhost:8000
echo Press Ctrl+C to stop
echo.
uvicorn app:app --reload --port 8000

