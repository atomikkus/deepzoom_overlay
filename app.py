"""
WSI DeepZoom Viewer - FastAPI Backend
Provides API endpoints for uploading WSI files and serving DeepZoom tiles
"""

import os
from pathlib import Path
from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks, Query
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from converter import WSIConverter

# Google Cloud Storage imports
try:
    from google.cloud import storage
    from google.oauth2 import service_account
    GCS_AVAILABLE = True
except ImportError:
    GCS_AVAILABLE = False
    print("Warning: google-cloud-storage not installed. GCS features will be disabled.")

# Initialize FastAPI app
app = FastAPI(
    title="WSI DeepZoom Viewer",
    description="High-performance whole slide imaging viewer with DeepZoom support",
    version="1.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
UPLOAD_FOLDER = 'uploads'
CACHE_FOLDER = 'cache'
ALLOWED_EXTENSIONS = {
    'svs', 'tif', 'tiff', 'vms', 'vmu', 'ndpi', 
    'scn', 'mrxs', 'svslide', 'bif'
}

# Google Cloud Storage configuration
# Set these environment variables or update the paths below
GCS_SERVICE_ACCOUNT_PATH = os.getenv('GCS_SERVICE_ACCOUNT_PATH', 'in-4bc-engineering-1f84a3a8a86d-read-access.json')
GCS_BUCKET_NAME = os.getenv('GCS_BUCKET_NAME', 'wsi_bucket53')
gcs_client = None

# Initialize GCS client if available
if GCS_AVAILABLE and os.path.exists(GCS_SERVICE_ACCOUNT_PATH):
    try:
        credentials = service_account.Credentials.from_service_account_file(
            GCS_SERVICE_ACCOUNT_PATH
        )
        gcs_client = storage.Client(credentials=credentials, project=credentials.project_id)
        print(f"✓ GCS client initialized for bucket: {GCS_BUCKET_NAME}")
    except Exception as e:
        print(f"Warning: Failed to initialize GCS client: {e}")
        gcs_client = None
else:
    print("GCS features disabled (missing credentials or library)")

# Initialize converter
converter = WSIConverter(upload_dir=UPLOAD_FOLDER, cache_dir=CACHE_FOLDER)

# Global progress tracker
conversion_progress = {}

def update_progress(slide_name, current, total):
    """Update progress for a slide"""
    percentage = (current / total) * 100
    conversion_progress[slide_name] = {
        'progress': percentage,
        'status': 'converting' if percentage < 100 else 'complete'
    }


def allowed_file(filename: str) -> bool:
    """Check if file has an allowed extension"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# ========================================
# Static Files & HTML
# ========================================

@app.get("/")
async def index():
    """Serve the main HTML page"""
    return FileResponse('index.html')


@app.get("/styles.css")
async def serve_css():
    """Serve CSS file"""
    return FileResponse('styles.css', media_type='text/css')


@app.get("/viewer.js")
async def serve_js():
    """Serve JavaScript file"""
    return FileResponse('viewer.js', media_type='application/javascript')


# Mount uploads folder for direct access (needed for GeoTIFFTileSource)
app.mount("/api/raw_slides", StaticFiles(directory=UPLOAD_FOLDER), name="raw_slides")

# Add CORS headers for GCS proxy endpoint
@app.post("/api/gcs/download")
async def download_gcs_file(blob_path: str = Query(..., description="Path to blob in GCS bucket")):
    """Download a file from GCS to local uploads folder for viewing"""
    if not GCS_AVAILABLE:
        raise HTTPException(status_code=503, detail="GCS library not installed. Install with: pip install google-cloud-storage")
    
    if gcs_client is None:
        raise HTTPException(status_code=503, detail="GCS client not initialized. Check service account credentials.")
    
    try:
        # Handle different URL formats
        original_blob_path = blob_path
        
        if blob_path.startswith('http'):
            if 'storage.cloud.google.com' in blob_path or 'storage.googleapis.com' in blob_path:
                parts = blob_path.split(f'{GCS_BUCKET_NAME}/')
                if len(parts) > 1:
                    blob_path = parts[1]
        
        if blob_path.startswith(f'{GCS_BUCKET_NAME}/'):
            blob_path = blob_path[len(f'{GCS_BUCKET_NAME}/'):]
        
        bucket = gcs_client.bucket(GCS_BUCKET_NAME)
        blob = bucket.blob(blob_path)
        
        if not blob.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {blob_path}")
        
        # Get filename
        filename = blob_path.split('/')[-1]
        slide_name = Path(filename).stem
        
        # Check if file already exists locally
        upload_dir = Path(UPLOAD_FOLDER)
        upload_dir.mkdir(exist_ok=True)
        local_path = upload_dir / filename
        
        if local_path.exists():
            # File already downloaded
            return {
                'success': True,
                'filename': filename,
                'name': slide_name,
                'message': 'File already exists locally',
                'local_path': str(local_path),
                'downloaded': False
            }
        
        # Download file from GCS
        print(f"Downloading {filename} from GCS...")
        blob.download_to_filename(str(local_path))
        print(f"✓ Downloaded {filename} to {local_path}")
        
        # Get file size
        file_size = local_path.stat().st_size
        
        return {
            'success': True,
            'filename': filename,
            'name': slide_name,
            'size': file_size,
            'local_path': str(local_path),
            'downloaded': True,
            'converted': converter.is_converted(slide_name),
            'viewable': converter.is_viewable(slide_name)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to download GCS file: {str(e)}")


@app.get("/api/gcs/proxy/{blob_path:path}")
async def proxy_gcs_file(blob_path: str):
    """Proxy GCS file through server to avoid CORS issues"""
    if not GCS_AVAILABLE or gcs_client is None:
        raise HTTPException(status_code=503, detail="GCS features not available")
    
    try:
        # Handle blob path extraction
        if blob_path.startswith('http'):
            if 'storage.cloud.google.com' in blob_path or 'storage.googleapis.com' in blob_path:
                parts = blob_path.split(f'{GCS_BUCKET_NAME}/')
                if len(parts) > 1:
                    blob_path = parts[1]
        
        if blob_path.startswith(f'{GCS_BUCKET_NAME}/'):
            blob_path = blob_path[len(f'{GCS_BUCKET_NAME}/'):]
        
        bucket = gcs_client.bucket(GCS_BUCKET_NAME)
        blob = bucket.blob(blob_path)
        
        if not blob.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {blob_path}")
        
        # Download blob content
        content = blob.download_as_bytes()
        
        # Get content type
        content_type = blob.content_type or 'application/octet-stream'
        
        # Return file with proper headers
        from fastapi.responses import Response
        return Response(
            content=content,
            media_type=content_type,
            headers={
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'Access-Control-Allow-Headers': '*',
                'Content-Disposition': f'inline; filename="{blob_path.split("/")[-1]}"'
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to proxy GCS file: {str(e)}")


# ========================================
# API Endpoints
# ========================================

@app.get("/api/slides")
async def list_slides():
    """List all uploaded slides"""
    try:
        upload_dir = Path(UPLOAD_FOLDER)
        if not upload_dir.exists():
            return {"slides": []}
        
        slides = []
        for file_path in upload_dir.iterdir():
            if file_path.is_file() and allowed_file(file_path.name):
                slides.append({
                    'name': file_path.stem,
                    'filename': file_path.name,
                    'size': file_path.stat().st_size,
                    'size': file_path.stat().st_size,
                    'converted': converter.is_converted(file_path.stem),
                    'viewable': converter.is_viewable(file_path.stem)
                })
        
        return {"slides": slides}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Handle file upload"""
    try:
        # Check if filename is empty
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file selected")
        
        # Check if file type is allowed
        if not allowed_file(file.filename):
            raise HTTPException(status_code=400, detail="File type not supported")
        
        # Create upload directory
        upload_dir = Path(UPLOAD_FOLDER)
        upload_dir.mkdir(exist_ok=True)
        
        # Save the file
        file_path = upload_dir / file.filename
        
        # Read and write file in chunks
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Get slide info
        slide_info = converter.get_slide_info(file_path)
        
        return {
            'success': True,
            'filename': file.filename,
            'name': file_path.stem,
            'info': slide_info
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/convert/{slide_name}")
async def convert_slide(slide_name: str, background_tasks: BackgroundTasks):
    """Convert a slide to DeepZoom format in background"""
    try:
        # Find the slide file
        upload_dir = Path(UPLOAD_FOLDER)
        slide_files = list(upload_dir.glob(f"{slide_name}.*"))
        
        if not slide_files:
            raise HTTPException(status_code=404, detail="Slide not found")
        
        slide_path = slide_files[0]
        
        # Check if already converted
        if converter.is_converted(slide_name):
            return {
                'success': True,
                'message': 'Slide already converted',
                'dzi_url': f'/api/dzi/{slide_name}.dzi',
                'status': 'complete'
            }
        
        # Initialize progress
        conversion_progress[slide_name] = {
            'progress': 0,
            'status': 'starting'
        }
        
        # Define callback wrapper
        def progress_callback(current, total):
            update_progress(slide_name, current, total)
            
        # Add to background tasks
        background_tasks.add_task(
            converter.convert_to_deepzoom, 
            slide_path, 
            progress_callback=progress_callback
        )
        
        return {
            'success': True,
            'message': 'Conversion started',
            'dzi_url': f'/api/dzi/{slide_name}.dzi',
            'status': 'converting'
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/progress/{slide_name}")
async def get_progress(slide_name: str):
    """Get conversion progress for a slide"""
    # Check if in memory progress
    if slide_name in conversion_progress:
        return conversion_progress[slide_name]
    
    # Check if fully converted on disk
    if converter.is_converted(slide_name):
        return {'progress': 100, 'status': 'complete'}
        
    # Check if viewable but not tracking (e.g. server restarted)
    if converter.is_viewable(slide_name):
        return {'progress': 50, 'status': 'converting'} # Unknown progress but viewable
        
    return {'progress': 0, 'status': 'idle'}


@app.get("/api/info/{slide_name}")
async def get_slide_info(slide_name: str):
    """Get metadata for a slide"""
    try:
        # Find the slide file
        upload_dir = Path(UPLOAD_FOLDER)
        slide_files = list(upload_dir.glob(f"{slide_name}.*"))
        
        if not slide_files:
            raise HTTPException(status_code=404, detail="Slide not found")
        
        slide_path = slide_files[0]
        slide_info = converter.get_slide_info(slide_path)
        
        return slide_info
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/dzi/{filename:path}")
async def serve_dzi(filename: str):
    """Serve DZI descriptor files"""
    try:
        file_path = Path(CACHE_FOLDER) / filename
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="DZI file not found")
        
        return FileResponse(str(file_path))
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/tiles/{slide_name}/{level}/{col}_{row}.{format}")
async def serve_tile(slide_name: str, level: int, col: int, row: int, format: str):
    """Serve individual tiles"""
    try:
        tiles_dir = Path(CACHE_FOLDER) / f"{slide_name}_files"
        tile_path = tiles_dir / str(level) / f"{col}_{row}.{format}"
        
        if not tile_path.exists():
            raise HTTPException(status_code=404, detail="Tile not found")
        
        return FileResponse(str(tile_path), media_type=f'image/{format}')
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/delete/{slide_name}")
async def delete_slide(slide_name: str):
    """Delete a slide and its cached tiles"""
    try:
        upload_dir = Path(UPLOAD_FOLDER)
        slide_files = list(upload_dir.glob(f"{slide_name}.*"))
        
        if not slide_files:
            raise HTTPException(status_code=404, detail="Slide not found")
        
        # Delete the slide file
        for slide_file in slide_files:
            slide_file.unlink()
        
        # Clean up cached tiles
        converter.cleanup_cache(slide_name)
        
        return {'success': True, 'message': 'Slide deleted'}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ========================================
# Google Cloud Storage Endpoints
# ========================================

@app.get("/api/gcs/files")
async def list_gcs_files(prefix: Optional[str] = Query(None, description="Prefix to filter files")):
    """List files from Google Cloud Storage bucket"""
    if not GCS_AVAILABLE or gcs_client is None:
        raise HTTPException(status_code=503, detail="GCS features not available")
    
    try:
        bucket = gcs_client.bucket(GCS_BUCKET_NAME)
        blobs = bucket.list_blobs(prefix=prefix)
        
        files = []
        for blob in blobs:
            # Only include WSI file types
            if '.' in blob.name:
                ext = blob.name.rsplit('.', 1)[1].lower()
                if ext in ALLOWED_EXTENSIONS:
                    files.append({
                        'name': blob.name.split('/')[-1],
                        'path': blob.name,
                        'size': blob.size,
                        'updated': blob.updated.isoformat() if blob.updated else None
                    })
        
        return {'files': files}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list GCS files: {str(e)}")


@app.get("/api/gcs/status")
async def get_gcs_status():
    """Check GCS availability and status"""
    status = {
        'available': False,
        'library_installed': GCS_AVAILABLE,
        'credentials_found': os.path.exists(GCS_SERVICE_ACCOUNT_PATH) if GCS_AVAILABLE else False,
        'client_initialized': gcs_client is not None,
        'bucket_name': GCS_BUCKET_NAME,
        'error': None
    }
    
    if not GCS_AVAILABLE:
        status['error'] = 'google-cloud-storage library not installed. Run: pip install google-cloud-storage'
    elif not os.path.exists(GCS_SERVICE_ACCOUNT_PATH):
        status['error'] = f'Service account file not found: {GCS_SERVICE_ACCOUNT_PATH}'
    elif gcs_client is None:
        status['error'] = 'GCS client failed to initialize. Check service account credentials.'
    else:
        status['available'] = True
    
    return status


@app.get("/api/gcs/signed-url")
async def get_gcs_signed_url(blob_path: str = Query(..., description="Path to blob in GCS bucket"), 
                            expiration_hours: int = Query(24, description="URL expiration in hours")):
    """Generate a signed URL for a GCS blob that can be used directly with GeoTIFFTileSource"""
    if not GCS_AVAILABLE:
        raise HTTPException(status_code=503, detail="GCS library not installed. Install with: pip install google-cloud-storage")
    
    if gcs_client is None:
        raise HTTPException(status_code=503, detail="GCS client not initialized. Check service account credentials.")
    
    try:
        # Handle different URL formats:
        # 1. Full URL: https://storage.cloud.google.com/wsi_bucket53/processed/file.svs
        # 2. Bucket path: wsi_bucket53/processed/file.svs
        # 3. Relative path: processed/file.svs
        
        # Extract blob path from URL if needed
        if blob_path.startswith('http'):
            # Extract path from full URL
            if 'storage.cloud.google.com' in blob_path or 'storage.googleapis.com' in blob_path:
                # Remove protocol and domain, keep bucket/path
                parts = blob_path.split(f'{GCS_BUCKET_NAME}/')
                if len(parts) > 1:
                    blob_path = parts[1]
                else:
                    # Try to extract from URL
                    blob_path = blob_path.split(f'{GCS_BUCKET_NAME}/')[-1] if f'{GCS_BUCKET_NAME}/' in blob_path else blob_path
        
        # Remove bucket name prefix if present
        if blob_path.startswith(f'{GCS_BUCKET_NAME}/'):
            blob_path = blob_path[len(f'{GCS_BUCKET_NAME}/'):]
        
        bucket = gcs_client.bucket(GCS_BUCKET_NAME)
        blob = bucket.blob(blob_path)
        
        # Check if blob exists
        if not blob.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {blob_path}")
        
        # Generate signed URL valid for specified hours
        expiration = datetime.utcnow() + timedelta(hours=expiration_hours)
        signed_url = blob.generate_signed_url(
            expiration=expiration,
            method='GET',
            version='v4',
            response_disposition=None,  # Allow inline viewing
            content_type=None  # Preserve original content type
        )
        
        # Extract filename for display
        filename = blob_path.split('/')[-1]
        
        return {
            'success': True,
            'signed_url': signed_url,
            'filename': filename,
            'name': Path(filename).stem,
            'expires_at': expiration.isoformat(),
            'is_directly_viewable': Path(filename).suffix.lower() in ['.svs', '.tif', '.tiff']
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate signed URL: {str(e)}")


# ========================================
# Startup Event
# ========================================

@app.on_event("startup")
async def startup_event():
    """Create necessary directories on startup"""
    Path(UPLOAD_FOLDER).mkdir(exist_ok=True)
    Path(CACHE_FOLDER).mkdir(exist_ok=True)
    
    print("=" * 60)
    print("WSI DeepZoom Viewer Server (FastAPI)")
    print("=" * 60)
    print(f"Server running on http://localhost:8000")
    print(f"API docs available at http://localhost:8000/docs")
    print(f"Upload folder: {UPLOAD_FOLDER}")
    print(f"Cache folder: {CACHE_FOLDER}")
    print(f"Supported formats: {', '.join(sorted(ALLOWED_EXTENSIONS))}")
    print("=" * 60)


# ========================================
# Run with: uvicorn app:app --reload --port 8000
# ========================================
