/**
 * WSI DeepZoom Viewer - Frontend Logic
 * Handles file upload, slide management, and OpenSeadragon viewer
 */

// Global state
let viewer = null;
let currentSlide = null;
let slides = [];

// API base URL
const API_BASE = '';

// Formats that can be viewed directly without conversion
const DIRECTLY_VIEWABLE_FORMATS = ['tif', 'tiff', 'svs'];

// ========================================
// Initialization
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    // Verify GeoTIFFTileSource library is loaded
    if (typeof OpenSeadragon !== 'undefined' && typeof OpenSeadragon.GeoTIFFTileSource === 'undefined') {
        console.warn('GeoTIFFTileSource plugin not found. Direct viewing of GeoTIFF files may not work.');
        console.warn('Make sure geotiff-tilesource library is loaded before viewer.js');
    }
    
    initializeEventListeners();
    loadSlides();
});

// ========================================
// Event Listeners
// ========================================

function initializeEventListeners() {
    // Upload area
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');

    uploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    // Drag and drop
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);

    // Viewer controls
    document.getElementById('zoom-in-btn').addEventListener('click', () => {
        if (viewer) viewer.viewport.zoomBy(1.5);
    });

    document.getElementById('zoom-out-btn').addEventListener('click', () => {
        if (viewer) viewer.viewport.zoomBy(0.67);
    });

    document.getElementById('home-btn').addEventListener('click', () => {
        if (viewer) viewer.viewport.goHome();
    });

    document.getElementById('rotate-btn').addEventListener('click', () => {
        if (viewer) {
            const currentRotation = viewer.viewport.getRotation();
            viewer.viewport.setRotation(currentRotation + 90);
        }
    });

    document.getElementById('fullscreen-btn').addEventListener('click', () => {
        if (viewer) viewer.setFullScreen(!viewer.isFullPage());
    });
}

// ========================================
// Drag and Drop Handlers
// ========================================

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('dragover');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        uploadFile(files[0]);
    }
}

function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        uploadFile(files[0]);
    }
}

// ========================================
// File Upload
// ========================================

async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    const progressContainer = document.getElementById('progress-container');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const fileInput = document.getElementById('file-input');

    // Reset file input
    fileInput.value = '';

    let progressInterval = null;

    try {
        // Show progress
        progressContainer.style.display = 'block';
        progressFill.style.width = '0%';
        progressText.textContent = 'Uploading...';

        // Simulate upload progress
        let uploadProgress = 0;
        progressInterval = setInterval(() => {
            if (uploadProgress < 30) {
                uploadProgress += 5;
                progressFill.style.width = uploadProgress + '%';
            }
        }, 200);

        // Upload file
        const response = await fetch(`${API_BASE}/api/upload`, {
            method: 'POST',
            body: formData
        });

        clearInterval(progressInterval);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Upload failed');
        }

        const data = await response.json();

        // Check if file is directly viewable (GeoTIFF-compatible)
        const fileExtension = file.name.split('.').pop().toLowerCase();
        const isDirectlyViewable = DIRECTLY_VIEWABLE_FORMATS.includes(fileExtension);

        if (isDirectlyViewable) {
            // File can be viewed directly, no conversion needed
            progressFill.style.width = '100%';
            progressText.textContent = 'Upload complete!';
            
            // Hide progress after a moment
            setTimeout(() => {
                progressContainer.style.display = 'none';
                progressFill.style.width = '0%';
            }, 1500);
            
            showToast('File uploaded - directly viewable without conversion', 'success');
        } else {
            // File needs conversion
            progressFill.style.width = '40%';
            progressText.textContent = 'Starting conversion...';

            // Start conversion
            await convertSlide(data.name);

            // Start polling for progress
            pollProgress(data.name);
        }

        // Reload slides list
        await loadSlides();

    } catch (error) {
        console.error('Upload error:', error);

        if (progressInterval) clearInterval(progressInterval);

        progressContainer.style.display = 'none';
        progressFill.style.width = '0%';
        showToast(`Upload failed: ${error.message}`, 'error');
    }
}

function pollProgress(slideName) {
    const progressContainer = document.getElementById('progress-container');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');

    let viewerLoaded = false;

    const interval = setInterval(async () => {
        try {
            const response = await fetch(`${API_BASE}/api/progress/${slideName}`);
            if (!response.ok) return;

            const data = await response.json();

            // Update progress bar (scale 40-100%)
            const displayProgress = 40 + (data.progress * 0.6);
            progressFill.style.width = `${displayProgress}%`;
            progressText.textContent = `Converting... ${Math.round(data.progress)}%`;

            // Check for early viewing (1.5%)
            if (data.progress > 1.5 && !viewerLoaded) {
                viewerLoaded = true;
                showToast('Preview available - loading viewer...', 'info');
                await loadSlide(slideName);
            }

            // Check for completion
            if (data.status === 'complete' || data.progress >= 100) {
                clearInterval(interval);
                progressText.textContent = 'Complete!';
                showToast('Conversion complete!', 'success');
                setTimeout(() => {
                    progressContainer.style.display = 'none';
                }, 2000);
                await loadSlides(); // Refresh list to show checkmark
            }

        } catch (e) {
            console.error('Polling error:', e);
            clearInterval(interval);
        }
    }, 1000);
}

// ========================================
// Slide Management
// ========================================

async function loadSlides() {
    try {
        const response = await fetch(`${API_BASE}/api/slides`);
        if (!response.ok) throw new Error('Failed to load slides');

        const data = await response.json();
        slides = data.slides;

        // Update slide count
        document.getElementById('slide-count').textContent =
            `${slides.length} slide${slides.length !== 1 ? 's' : ''}`;

        // Render slides list
        renderSlidesList();

    } catch (error) {
        console.error('Load slides error:', error);
        showToast('Failed to load slides', 'error');
    }
}

function renderSlidesList() {
    const slidesList = document.getElementById('slides-list');

    if (slides.length === 0) {
        slidesList.innerHTML = '<p class="empty-state">No slides uploaded yet</p>';
        return;
    }

    slidesList.innerHTML = slides.map(slide => `
        <div class="slide-item ${currentSlide === slide.name ? 'active' : ''}" 
             onclick="loadSlide('${slide.name}')">
            <button class="slide-delete" onclick="event.stopPropagation(); deleteSlide('${slide.name}')">
                🗑️
            </button>
            <div class="slide-name">${slide.name}</div>
            <div class="slide-status ${slide.converted ? 'converted' : (slide.viewable ? 'viewable' : '')}">
                ${slide.converted ? '✓ Converted' : (slide.viewable ? '👁 Viewable' : '⏳ Processing')}
            </div>
        </div>
    `).join('');
}

async function convertSlide(slideName) {
    try {
        const response = await fetch(`${API_BASE}/api/convert/${slideName}`, {
            method: 'POST'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Conversion failed');
        }

        return await response.json();

    } catch (error) {
        console.error('Conversion error:', error);
        throw error;
    }
}

async function loadSlide(slideName) {
    try {
        currentSlide = slideName;

        // Find slide object to get filename
        const slide = slides.find(s => s.name === slideName);
        if (!slide) throw new Error('Slide not found in list');

        // Get slide info
        const infoResponse = await fetch(`${API_BASE}/api/info/${slideName}`);
        if (!infoResponse.ok) throw new Error('Failed to load slide info');

        const slideInfo = await infoResponse.json();

        // Display slide info
        displaySlideInfo(slideInfo);

        // Check if file is directly viewable (GeoTIFF-compatible)
        const fileExtension = slide.filename.split('.').pop().toLowerCase();
        const isDirectlyViewable = DIRECTLY_VIEWABLE_FORMATS.includes(fileExtension);

        // Try to load slide - prefer direct viewing if supported, otherwise use DZI
        if (isDirectlyViewable && !slide.converted) {
            console.log('Using GeoTIFF source (direct viewing - no conversion needed)');
            const rawUrl = `${API_BASE}/api/raw_slides/${slide.filename}`;
            loadInViewer(rawUrl, 'geotiff');
        } else if (slide.converted || slide.viewable) {
            console.log('Using DeepZoom (DZI) source');
            const dziUrl = `${API_BASE}/api/dzi/${slideName}.dzi`;
            loadInViewer(dziUrl, 'dzi');
        } else {
            // File is not converted and not directly viewable - try direct viewing anyway
            console.log('File not converted, attempting direct viewing...');
            const rawUrl = `${API_BASE}/api/raw_slides/${slide.filename}`;
            loadInViewer(rawUrl, 'geotiff');
        }

        // Update slides list
        renderSlidesList();

        showToast(`Loaded: ${slideName}`, 'success');

    } catch (error) {
        console.error('Load slide error:', error);
        showToast(`Failed to load slide: ${error.message}`, 'error');
    }
}

async function deleteSlide(slideName) {
    if (!confirm(`Delete slide "${slideName}"?`)) return;

    try {
        const response = await fetch(`${API_BASE}/api/delete/${slideName}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Delete failed');
        }

        // If this was the current slide, clear viewer
        if (currentSlide === slideName) {
            currentSlide = null;
            if (viewer) {
                viewer.close();
                viewer = null;
            }
            document.getElementById('info-section').style.display = 'none';
            showViewerPlaceholder();
        }

        // Reload slides
        await loadSlides();

        showToast('Slide deleted', 'success');

    } catch (error) {
        console.error('Delete error:', error);
        showToast(`Failed to delete slide: ${error.message}`, 'error');
    }
}

// ========================================
// Viewer Management
// ========================================

async function loadInViewer(sourceUrl, type) {
    const viewerContainer = document.getElementById('viewer-container');

    // Clear existing content if creating new viewer
    if (viewer) {
        viewer.destroy();
        viewer = null;
    }

    viewerContainer.innerHTML = '';

    let tileSources = sourceUrl;

    // If GeoTIFF, create the specific tile source
    if (type === 'geotiff') {
        try {
            // Ensure URL is absolute
            let absoluteUrl = sourceUrl;
            if (!sourceUrl.startsWith('http')) {
                // Convert relative URL to absolute
                absoluteUrl = new URL(sourceUrl, window.location.origin).href;
            }
            
            console.log('Attempting to load GeoTIFF from:', absoluteUrl);
            console.log('OpenSeadragon available:', typeof OpenSeadragon !== 'undefined');
            console.log('GeoTIFFTileSource available:', typeof OpenSeadragon.GeoTIFFTileSource !== 'undefined');
            
            // Verify GeoTIFFTileSource is available
            if (!OpenSeadragon.GeoTIFFTileSource) {
                throw new Error('GeoTIFFTileSource plugin not loaded. Check that geotiff-tilesource library is included.');
            }
            
            // Test URL accessibility first
            try {
                const testResponse = await fetch(absoluteUrl, { 
                    method: 'HEAD',
                    headers: {
                        'Range': 'bytes=0-1023'
                    }
                });
                console.log('URL test response status:', testResponse.status);
                console.log('URL test response headers:', Object.fromEntries(testResponse.headers.entries()));
            } catch (testError) {
                console.warn('URL accessibility test failed (may be OK):', testError);
            }
            
            // Use getAllTileSources static method as per documentation
            // Supports both local files (File object) and remote URLs (string)
            const options = {
                logLatency: true,  // Enable logging for debugging
                // Enable range requests for better performance
                useRangeRequests: true
            };
            
            // Add CORS-related options for HTTP URLs
            if (absoluteUrl.startsWith('http')) {
                options.headers = {
                    'Accept': 'image/tiff,image/*,*/*'
                };
            }
            
            console.log('Calling GeoTIFFTileSource.getAllTileSources with options:', options);
            tileSources = await OpenSeadragon.GeoTIFFTileSource.getAllTileSources(absoluteUrl, options);
            
            console.log('GeoTIFFTileSource created successfully, tile sources:', tileSources);
            
            // Validate tile sources
            if (!tileSources || (Array.isArray(tileSources) && tileSources.length === 0)) {
                throw new Error('GeoTIFFTileSource returned empty or invalid tile sources');
            }
        } catch (e) {
            console.error('Failed to create GeoTIFFTileSource:', e);
            console.error('Error name:', e.name);
            console.error('Error message:', e.message);
            console.error('Error stack:', e.stack);
            
            // Check if it's a GCS file
            const isGCSFile = sourceUrl.includes('storage.googleapis.com') || sourceUrl.includes('storage.cloud.google.com');
            
            if (isGCSFile) {
                showToast(`Failed to load GCS file: ${e.message}. The file may require CORS configuration or the signed URL may have expired.`, 'error');
            } else {
                console.warn('GeoTIFF direct viewing failed, attempting fallback to DZI...');
                showToast('Direct viewing failed, falling back to converted tiles...', 'warning');
                loadDziFallback();
            }
            return;
        }
    }

    // Create OpenSeadragon viewer
    try {
        viewer = OpenSeadragon({
            id: 'viewer-container',
            prefixUrl: 'https://cdnjs.cloudflare.com/ajax/libs/openseadragon/4.1.0/images/',
            tileSources: tileSources,
            showNavigationControl: false,
            showNavigator: true,
            navigatorPosition: 'BOTTOM_LEFT',
            animationTime: 0.5,
            blendTime: 0.1,
            constrainDuringPan: true,
            maxZoomPixelRatio: 2,
            minZoomLevel: 0.8,
            visibilityRatio: 1,
            zoomPerScroll: 2,
            timeout: 120000,
            crossOriginPolicy: 'Anonymous',
            ajaxWithCredentials: false  // Set to false for CORS with signed URLs
        });

        // Add event handlers
        viewer.addHandler('open', () => {
            console.log('Viewer opened successfully');
            // If we successfully opened a GeoTIFF, show a success message
            if (type === 'geotiff') {
                showToast('Viewing directly from raw file (GeoTIFF)', 'success');
            }
        });

        viewer.addHandler('open-failed', (event) => {
            console.error('Viewer open failed:', event);
            console.error('Event details:', JSON.stringify(event, null, 2));
            
            // Extract error message if available
            let errorMessage = 'Failed to open slide in viewer';
            if (event && event.message) {
                errorMessage = event.message;
            } else if (event && event.userData && event.userData.error) {
                errorMessage = event.userData.error;
            }

            if (type === 'geotiff') {
                console.log('GeoTIFF open failed:', errorMessage);
                // For GCS files, we can't fallback to DZI since they're not converted
                const isGCSFile = sourceUrl.includes('storage.googleapis.com') || sourceUrl.includes('storage.cloud.google.com');
                if (isGCSFile) {
                    showToast(`Failed to load GCS file: ${errorMessage}. Check CORS settings or try downloading the file first.`, 'error');
                } else {
                    console.log('GeoTIFF open failed, attempting fallback to DZI');
                    showToast('Direct view failed, falling back to converted tiles...', 'warning');
                    loadDziFallback();
                }
            } else {
                showToast(`Failed to open slide: ${errorMessage}`, 'error');
                showViewerPlaceholder();
            }
        });

    } catch (error) {
        console.error('Error creating viewer:', error);
        if (type === 'geotiff') {
            loadDziFallback();
        }
    }
}

function loadDziFallback() {
    if (currentSlide) {
        const dziUrl = `${API_BASE}/api/dzi/${currentSlide}.dzi`;
        console.log('Falling back to DZI:', dziUrl);
        loadInViewer(dziUrl, 'dzi');
    }
}

function showViewerPlaceholder() {
    const viewerContainer = document.getElementById('viewer-container');
    viewerContainer.innerHTML = `
        <div class="viewer-placeholder">
            <div class="placeholder-content">
                <div class="placeholder-icon">🔬</div>
                <h2 class="placeholder-title">No Slide Loaded</h2>
                <p class="placeholder-text">Upload a WSI file to get started</p>
            </div>
        </div>
    `;
}

// ========================================
// Display Slide Info
// ========================================

function displaySlideInfo(info) {
    const infoSection = document.getElementById('info-section');
    const infoContent = document.getElementById('info-content');

    const [width, height] = info.dimensions;
    const props = info.properties;

    let html = `
        <div class="info-row">
            <span class="info-label">Dimensions</span>
            <span class="info-value">${width.toLocaleString()} × ${height.toLocaleString()}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Levels</span>
            <span class="info-value">${info.level_count}</span>
        </div>
    `;

    if (props['openslide.vendor']) {
        html += `
            <div class="info-row">
                <span class="info-label">Vendor</span>
                <span class="info-value">${props['openslide.vendor']}</span>
            </div>
        `;
    }

    if (props['openslide.objective-power']) {
        html += `
            <div class="info-row">
                <span class="info-label">Magnification</span>
                <span class="info-value">${props['openslide.objective-power']}×</span>
            </div>
        `;
    }

    if (props['openslide.mpp-x'] && props['openslide.mpp-y']) {
        html += `
            <div class="info-row">
                <span class="info-label">Resolution</span>
                <span class="info-value">${parseFloat(props['openslide.mpp-x']).toFixed(3)} μm/px</span>
            </div>
        `;
    }

    infoContent.innerHTML = html;
    infoSection.style.display = 'block';
}

// ========================================
// Toast Notifications
// ========================================

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');

    toast.textContent = message;
    toast.className = `toast ${type}`;

    // Show toast
    setTimeout(() => toast.classList.add('show'), 10);

    // Hide after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ========================================
// Utility Functions
// ========================================

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// ========================================
// Tab Management
// ========================================

async function switchTab(tabName) {
    const uploadTab = document.getElementById('upload-tab');
    const gcsTab = document.getElementById('gcs-tab');
    const uploadContent = document.getElementById('upload-tab-content');
    const gcsContent = document.getElementById('gcs-tab-content');

    if (tabName === 'upload') {
        uploadTab.classList.add('active');
        gcsTab.classList.remove('active');
        uploadContent.classList.add('active');
        uploadContent.style.display = 'block';
        gcsContent.classList.remove('active');
        gcsContent.style.display = 'none';
    } else {
        gcsTab.classList.add('active');
        uploadTab.classList.remove('active');
        gcsContent.classList.add('active');
        gcsContent.style.display = 'block';
        uploadContent.classList.remove('active');
        uploadContent.style.display = 'none';
        
        // Check GCS status when switching to GCS tab
        const status = await checkGCSStatus();
        const filesList = document.getElementById('gcs-files-list');
        if (!status.available && filesList.innerHTML.includes('empty-state')) {
            filesList.innerHTML = `
                <p class="empty-state" style="color: var(--error);">
                    <strong>⚠️ GCS Not Available</strong><br><br>
                    ${status.error || 'GCS features are disabled'}<br><br>
                    <small>To enable: pip install google-cloud-storage</small>
                </p>
            `;
        }
    }
}

// ========================================
// Google Cloud Storage Functions
// ========================================

async function checkGCSStatus() {
    try {
        const response = await fetch(`${API_BASE}/api/gcs/status`);
        const status = await response.json();
        return status;
    } catch (error) {
        return { available: false, error: 'Failed to check GCS status' };
    }
}

async function loadGCSFileFromUrl() {
    const urlInput = document.getElementById('gcs-url');
    const urlOrPath = urlInput.value.trim();
    
    if (!urlOrPath) {
        showToast('Please enter a GCS URL or path', 'warning');
        return;
    }
    
    // Show loading state
    urlInput.disabled = true;
    
    try {
        // Check GCS status first
        const status = await checkGCSStatus();
        if (!status.available) {
            throw new Error(status.error || 'GCS features not available');
        }
        
        // Download and load the file
        await loadGCSFile(urlOrPath);
        urlInput.value = ''; // Clear input on success
    } catch (error) {
        console.error('Load GCS file from URL error:', error);
        showToast(`Failed to load file: ${error.message}`, 'error');
    } finally {
        urlInput.disabled = false;
    }
}

async function loadGCSFiles() {
    const prefix = document.getElementById('gcs-prefix').value.trim() || null;
    const filesList = document.getElementById('gcs-files-list');
    
    try {
        // Check GCS status first
        const status = await checkGCSStatus();
        if (!status.available) {
            filesList.innerHTML = `
                <p class="empty-state" style="color: var(--error);">
                    <strong>GCS Not Available</strong><br>
                    ${status.error || 'GCS features are disabled'}
                </p>
            `;
            showToast(`GCS not available: ${status.error}`, 'error');
            return;
        }
        
        filesList.innerHTML = '<p class="empty-state">Loading files...</p>';
        
        const url = prefix 
            ? `${API_BASE}/api/gcs/files?prefix=${encodeURIComponent(prefix)}`
            : `${API_BASE}/api/gcs/files`;
        
        const response = await fetch(url);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to load GCS files');
        }
        
        const data = await response.json();
        
        if (data.files.length === 0) {
            filesList.innerHTML = '<p class="empty-state">No files found</p>';
            return;
        }
        
        filesList.innerHTML = data.files.map(file => `
            <div class="gcs-file-item" onclick="loadGCSFile('${file.path.replace(/'/g, "\\'")}')">
                <div class="gcs-file-name">${file.name}</div>
                <div class="gcs-file-info">
                    <span>${formatFileSize(file.size)}</span>
                    ${file.updated ? `<span>${new Date(file.updated).toLocaleDateString()}</span>` : ''}
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Load GCS files error:', error);
        filesList.innerHTML = `<p class="empty-state" style="color: var(--error);">Error: ${error.message}</p>`;
        showToast(`Failed to load GCS files: ${error.message}`, 'error');
    }
}

async function loadGCSFile(blobPath) {
    const progressContainer = document.getElementById('progress-container');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    
    try {
        // Show progress
        progressContainer.style.display = 'block';
        progressFill.style.width = '10%';
        progressText.textContent = 'Downloading from GCS...';
        
        // Download file from GCS to local server
        const downloadResponse = await fetch(`${API_BASE}/api/gcs/download?blob_path=${encodeURIComponent(blobPath)}`, {
            method: 'POST'
        });
        
        if (!downloadResponse.ok) {
            const errorData = await downloadResponse.json();
            throw new Error(errorData.detail || 'Failed to download file from GCS');
        }
        
        const downloadData = await downloadResponse.json();
        
        // Update progress
        progressFill.style.width = '50%';
        progressText.textContent = 'File downloaded, loading...';
        
        const filename = downloadData.filename;
        const slideName = downloadData.name;
        
        // Reload slides list to include the downloaded file
        await loadSlides();
        
        // Find the slide in the list
        const slide = slides.find(s => s.name === slideName);
        if (!slide) {
            throw new Error('Downloaded file not found in slides list');
        }
        
        // Update progress
        progressFill.style.width = '80%';
        progressText.textContent = 'Preparing viewer...';
        
        // Load the slide using the existing local loading mechanism
        await loadSlide(slideName);
        
        // Hide progress
        progressFill.style.width = '100%';
        progressText.textContent = 'Complete!';
        setTimeout(() => {
            progressContainer.style.display = 'none';
            progressFill.style.width = '0%';
        }, 1000);
        
        showToast(`Downloaded and loaded ${filename} from Google Cloud Storage`, 'success');
        
    } catch (error) {
        console.error('Load GCS file error:', error);
        
        // Hide progress on error
        progressContainer.style.display = 'none';
        progressFill.style.width = '0%';
        
        showToast(`Failed to load GCS file: ${error.message}`, 'error');
    }
}
