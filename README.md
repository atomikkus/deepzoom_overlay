# WSI DeepZoom Viewer

A modern, high-performance web application for viewing Whole Slide Imaging (WSI) files with DeepZoom support. Upload large pathology slides and view them interactively in your browser with smooth pan and zoom capabilities.

![WSI Viewer](https://img.shields.io/badge/status-ready-success)
![Python](https://img.shields.io/badge/python-3.8+-blue)
![Flask](https://img.shields.io/badge/flask-3.0-green)

## ✨ Features

- 🔬 **Multi-Format Support**: Aperio (.svs), Hamamatsu (.ndpi), Leica (.scn), and more
- ⚡ **DeepZoom Conversion**: Automatic conversion to tiled format for efficient web viewing
- 🎨 **Modern UI**: Beautiful dark theme with glassmorphism effects
- 📤 **Drag & Drop Upload**: Easy file upload with progress indication
- 🔍 **Interactive Viewer**: Zoom, pan, rotate, and fullscreen support using OpenSeadragon
- 💾 **Smart Caching**: Converted tiles are cached for faster subsequent loading
- 📊 **Metadata Display**: View slide dimensions, magnification, and vendor info

## 📋 Supported Formats

- **Aperio**: `.svs`, `.tif`
- **Hamamatsu**: `.vms`, `.vmu`, `.ndpi`
- **Leica**: `.scn`
- **MIRAX**: `.mrxs`
- **Philips**: `.tiff`
- **Sakura**: `.svslide`
- **Ventana**: `.bif`, `.tif`
- **Generic tiled TIFF**: `.tif`

## 🚀 Getting Started

### Prerequisites

- Python 3.8 or higher
- OpenSlide library (see installation below)

### Installation

#### 1. Install OpenSlide Library

**Windows:**
Download and install OpenSlide from: https://openslide.org/download/

Or use the Python package:
```powershell
pip install openslide-python
```

**Note**: On Windows, you may need to download the OpenSlide Windows binaries and add them to your PATH.

**macOS:**
```bash
brew install openslide
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install openslide-tools python3-openslide
```

#### 2. Install Python Dependencies

```powershell
# Navigate to project directory
cd c:\Users\satya\Downloads\deepzoom_overlay

# Create virtual environment (recommended)
python -m venv venv

# Activate virtual environment
.\venv\Scripts\activate  # Windows
source venv/bin/activate  # macOS/Linux

# Install dependencies
pip install -r requirements.txt
```

### Running the Application

```powershell
# Start the Flask server
python app.py
```

The server will start at `http://localhost:5000`

Open your browser and navigate to: **http://localhost:5000**

## 📖 Usage

### 1. Upload a Slide

- **Drag and drop** a WSI file onto the upload area, or
- **Click** the upload area to browse and select a file

Supported file extensions: `.svs`, `.tif`, `.tiff`, `.vms`, `.vmu`, `.ndpi`, `.scn`, `.mrxs`, `.svslide`, `.bif`

### 2. Automatic Conversion

The application automatically converts your WSI file to DeepZoom format in the background. You'll see progress indication during upload and conversion.

### 3. View and Interact

Once converted, the slide appears in the viewer. Use the controls to:

- **Zoom In/Out**: Click the +/- buttons or use mouse wheel
- **Pan**: Click and drag the image
- **Rotate**: Click the rotate button to rotate 90°
- **Reset View**: Click the home button to reset to default view
- **Fullscreen**: Click the fullscreen button for immersive viewing

### 4. Slide Management

- View all uploaded slides in the sidebar
- Click on any slide to load it in the viewer
- Delete slides using the trash icon

## 🏗️ Architecture

### Backend (Flask + OpenSlide)

- **`app.py`**: Flask server with REST API endpoints
- **`converter.py`**: WSI to DeepZoom conversion utilities
- **`uploads/`**: Directory for uploaded WSI files
- **`cache/`**: Directory for cached DeepZoom tiles

### Frontend (HTML + JavaScript + OpenSeadragon)

- **`index.html`**: Main web interface
- **`styles.css`**: Modern styling with dark theme
- **`viewer.js`**: Frontend logic and OpenSeadragon integration

### API Endpoints

- `GET /api/slides` - List all uploaded slides
- `POST /api/upload` - Upload a new slide
- `POST /api/convert/<slide_name>` - Convert slide to DeepZoom
- `GET /api/info/<slide_name>` - Get slide metadata
- `GET /api/dzi/<filename>` - Serve DZI descriptor files
- `GET /api/tiles/<slide_name>/<level>/<col>_<row>.<format>` - Serve tile images
- `DELETE /api/delete/<slide_name>` - Delete a slide

## ⚙️ Configuration

Edit `app.py` to configure:

- **Upload folder**: `UPLOAD_FOLDER = 'uploads'`
- **Cache folder**: `CACHE_FOLDER = 'cache'`
- **Max file size**: `app.config['MAX_CONTENT_LENGTH']` (default: 2GB)
- **Tile size**: In `converter.py`, `tile_size=256` (optimal for web viewing)

## 🔧 Troubleshooting

### OpenSlide Installation Issues (Windows)

If you encounter errors like "OpenSlide library not found":

1. Download OpenSlide Windows binaries from https://openslide.org/download/
2. Extract to a location (e.g., `C:\OpenSlide`)
3. Add the `bin` folder to your PATH environment variable
4. Restart your terminal/IDE

### Large File Upload Issues

If uploads fail for large files:

1. Increase `MAX_CONTENT_LENGTH` in `app.py`
2. Check server timeout settings
3. Ensure sufficient disk space in `uploads/` and `cache/` directories

### Viewer Not Loading

- Check browser console for errors
- Ensure the slide was successfully converted (check for `.dzi` file in `cache/`)
- Verify network requests are reaching the Flask server

## 📚 Technologies Used

- **Backend**: Flask, OpenSlide Python, Pillow
- **Frontend**: OpenSeadragon, Vanilla JavaScript, CSS3
- **Design**: Custom dark theme with glassmorphism effects

## 🤝 Contributing

Contributions are welcome! Feel free to:

- Report bugs
- Suggest new features
- Submit pull requests

## 📄 License

This project is open source and available under the MIT License.

## 🙏 Acknowledgments

- [OpenSlide](https://openslide.org/) - C library for reading WSI files
- [OpenSeadragon](https://openseadragon.github.io/) - JavaScript viewer for zoomable images
- [Flask](https://flask.palletsprojects.com/) - Python web framework

## 📞 Support

For issues or questions:

1. Check the troubleshooting section above
2. Review OpenSlide documentation: https://openslide.org/
3. Open an issue on GitHub

---

**Enjoy viewing your whole slide images! 🔬**
