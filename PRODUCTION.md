# Production Deployment Guide (Ubuntu Server)

## Prerequisites

- Ubuntu 20.04+ server
- Root or sudo access
- Domain name (optional, for SSL)
- Nginx installed

## Step 1: Install System Dependencies

```bash
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-venv openslide-tools libopenslide-dev build-essential nginx
```

## Step 2: Setup Application

```bash
cd /opt  # or your preferred location
git clone <repository-url> wsi-viewer
cd wsi-viewer
chmod +x setup.sh
./setup.sh
```

## Step 3: Configure Environment Variables

Create `.env` file or set environment variables:

```bash
export GCS_SERVICE_ACCOUNT_PATH="/opt/wsi-viewer/service-account.json"
export GCS_BUCKET_NAME="your-bucket-name"
```

## Step 4: Setup Systemd Service

```bash
# Make script executable
chmod +x systemd-service.sh

# Run the script to generate service file
./systemd-service.sh

# Copy service file to systemd
sudo cp /tmp/wsi-viewer.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable and start service
sudo systemctl enable wsi-viewer
sudo systemctl start wsi-viewer

# Check status
sudo systemctl status wsi-viewer
```

## Step 5: Configure Nginx Reverse Proxy

Create Nginx configuration:

```bash
sudo nano /etc/nginx/sites-available/wsi-viewer
```

Add configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # or your server IP

    client_max_body_size 5G;  # Adjust for large file uploads

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Increase timeouts for large file uploads
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/wsi-viewer /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Step 6: Setup SSL with Let's Encrypt (Optional)

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Step 7: Firewall Configuration

```bash
# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow SSH (if not already)
sudo ufw allow 22/tcp

# Enable firewall
sudo ufw enable
```

## Step 8: Monitoring and Logs

View application logs:
```bash
sudo journalctl -u wsi-viewer -f
```

View Nginx logs:
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

## Step 9: Performance Optimization

### Increase File Upload Limits

Edit `/etc/nginx/nginx.conf`:
```nginx
http {
    client_max_body_size 5G;
    client_body_timeout 300s;
}
```

### Optimize Python Process

Edit systemd service to use multiple workers:
```ini
ExecStart=/opt/wsi-viewer/venv/bin/uvicorn app:app --host 0.0.0.0 --port 8000 --workers 4
```

## Maintenance

### Update Application

```bash
cd /opt/wsi-viewer
git pull
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart wsi-viewer
```

### Backup

```bash
# Backup uploads and cache
tar -czf backup-$(date +%Y%m%d).tar.gz uploads/ cache/
```

### Cleanup Old Files

Set up cron job to clean old cache files:
```bash
crontab -e
# Add: 0 2 * * 0 find /opt/wsi-viewer/cache -type f -mtime +30 -delete
```

