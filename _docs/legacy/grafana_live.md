---
permalink: /grafana_live/
title: "Grafana Live Setup"
layout: single
toc: true
toc_label: "Contents"
toc_icon: "list"
toc_sticky: true  # Makes the TOC stick on scroll
---

This guide explains how to install Grafana and configure Grafana Live to work with the `GrafanaLiveWriter` for real-time data streaming.

Please also see _[Grafana/InfluxDB-based Displays]({{ "/grafana_displays/" | relative_url }})_ for a broader introduction to using Grafana with InfluxDB.

---

## Overview

The `GrafanaLiveWriter` sends data to Grafana Live using the **InfluxDB Line Protocol** format via HTTP POST to the `/api/live/push/{stream}` endpoint. This provides:

- Real-time streaming (20Hz+ supported)
- No database required for live data
- Automatic Grafana dashboard updates
- Support for alarms and thresholds

**Architecture:**
```
OpenRVDAS Logger → GrafanaLiveWriter → Grafana Live → Dashboard
```

---

## Prerequisites

- Ubuntu 20.04+ or macOS 10.14+
- OpenRVDAS installed
- Internet access for package installation
- sudo/admin privileges

---

## Installation

### Ubuntu/Debian

```bash
# Add Grafana repository
sudo apt-get install -y software-properties-common
sudo add-apt-repository "deb https://packages.grafana.com/oss/deb stable main"

# Add GPG key
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -

# Install Grafana
sudo apt-get update
sudo apt-get install grafana

# Enable and start Grafana
sudo systemctl enable grafana-server
sudo systemctl start grafana-server
```

### macOS

```bash
# Using Homebrew
brew update
brew install grafana

# Start Grafana
brew services start grafana
```

### Verification

Verify Grafana is running:

```bash
# Check service status
sudo systemctl status grafana-server  # Linux
brew services list | grep grafana      # macOS

# Test web access
curl http://localhost:3000/api/health
# Should return: {"database":"ok","version":"..."}
```

Access Grafana web interface:
- URL: **http://localhost:3000**
- Default username: **admin**
- Default password: **admin** (you'll be prompted to change it)

---

## Grafana Live Configuration

Grafana Live is enabled by default in modern versions (8.0+), but you should verify the configuration.

### 1. Edit Grafana Configuration

```bash
sudo nano /etc/grafana/grafana.ini  # Linux
# or
nano /usr/local/etc/grafana/grafana.ini  # macOS
```

### 2. Configure Live Section

Find or add the `[live]` section:

```ini
[live]
# Maximum number of concurrent connections
max_connections = 100

# Allowed origins for WebSocket connections (use * for development)
allowed_origins = *
```

### 3. Restart Grafana

```bash
sudo systemctl restart grafana-server  # Linux
brew services restart grafana          # macOS
```

### 4. Verify Live Endpoint

```bash
# Test the Live push endpoint exists
curl -X POST http://localhost:3000/api/live/push/test \
  -H "Content-Type: text/plain" \
  -d "test_measurement value=1.0"

# You should get a 401 Unauthorized (expected without auth token)
# 404 Not Found means Live is not enabled
```

---

## Authentication Setup

The `GrafanaLiveWriter` requires a **Service Account Token** for authentication.

### 1. Create a Service Account

1. Log in to Grafana (http://localhost:3000)
2. Go to **Administration → Service accounts** (or **Configuration → Service accounts**)
3. Click **Add service account**
4. Fill in details:
   - **Display name**: `OpenRVDAS Writer`
   - **Role**: **Editor** (or **Admin** for full access)
5. Click **Create**

### 2. Generate a Token

1. Click on the newly created service account
2. Click **Add service account token**
3. Fill in details:
   - **Display name**: `openrvdas-token`
   - **Expiration**: Leave blank or set as needed
4. Click **Generate token**
5. **IMPORTANT**: Copy the token immediately - it will only be shown once!

The token will look like: `glsa_AbCdEfGhIjKlMnOpQrStUvWxYz1234567890...`

### 3. Store Token Securely

Create a secure token file (recommended approach):

```bash
# Create secrets directory
sudo mkdir -p /etc/openrvdas/secrets

# Create token file
echo 'glsa_YourTokenHere' | sudo tee /etc/openrvdas/secrets/grafana_token

# Restrict permissions (owner read-only)
sudo chmod 600 /etc/openrvdas/secrets/grafana_token
sudo chown rvdas:rvdas /etc/openrvdas/secrets/grafana_token
```

**Alternative: Environment Variable**

```bash
# Add to ~/.bashrc or /etc/environment
export GRAFANA_API_TOKEN='glsa_YourTokenHere'
```

**Security Notes:**
- **Best**: Use `token_file` with 600 permissions
- **Good**: Use `GRAFANA_API_TOKEN` environment variable
- **Avoid**: Hardcoding `api_token` in config files
- Never commit tokens to version control
- Rotate tokens periodically
- Use minimal required permissions (Editor, not Admin)

---

## GrafanaLiveWriter Configuration

### Basic Logger Configuration

```yaml
# logger_config.yaml
gnss->grafana:
  readers:
    class: SerialReader
    kwargs:
      port: /dev/ttyUSB0
      baudrate: 9600
  transforms:
    - class: TimestampTransform
    - class: PrefixTransform
      kwargs:
        prefix: gnss_cnav
    - class: ParseTransform
      kwargs:
        definition_path: local/devices/devices.yaml
  writers:
    - class: GrafanaLiveWriter
      kwargs:
        host: 'localhost:3000'
        stream_id: 'openrvdas
        token_file: '/etc/openrvdas/secrets/grafana_token'
```

### Configuration Options

```yaml
writers:
  - class: GrafanaLiveWriter
    kwargs:
      # Required
      host: 'localhost:3000'            # Grafana host:port
      stream_id: 'openrvdas             # will have data_id/message_type appended
      token_file: '/etc/openrvdas/secrets/token' # Path to token file (recommended)
      
      # Alternative authentication (less secure)
      # api_token: 'glsa_...'                     # Direct token (discouraged)
      # Or use GRAFANA_API_TOKEN environment variable
      
      # Optional
      secure: false                    # Use HTTPS (default: false)
      measurement_name: 'gnss_data'    # Override measurement (default: uses message_type)
      batch_size: 5                    # Batch records (default: 1)
      queue_size: 1000                 # Queue size (default: 1000)
```

### Stream ID Naming

By default the GrafanaLiveWriter will create a stream for every data_id and message_type encountered. For example, a VTG message from a Garmin GNSS will be written to the Grafana Live Stream `/openrvdas/gnss_cnav/vtg`.

### Testing the Writer

```python
#!/usr/bin/env python3
"""Test GrafanaLiveWriter"""

from logger.writers.grafana_live_writer import GrafanaLiveWriter
import time

# Create writer (using token file - recommended)
writer = GrafanaLiveWriter(
    host='localhost:3000',
    stream_id='openrvdas/test',
    token_file='/etc/openrvdas/secrets/grafana_token'
)

# Send test data
for i in range(10):
    writer.write({
        'timestamp': time.time(),
        'fields': {
            'temperature': 20 + i,
            'humidity': 50 + i
        }
    })
    time.sleep(1)
    print(f'Sent record {i+1}')

# Check stats
print(f'Stats: {writer.get_stats()}')

# Clean shutdown
writer.stop()
```

Run the test:
```bash
python3 test_grafana_writer.py
```

You should see output like:
```
Sent record 1
Sent record 2
...
Stats: {'sent': 10, 'dropped': 0, 'errors': 0, 'last_error': None}
```

---

## Creating Dashboards

### 1. Create a Dashboard

1. Click **+ → Dashboard**
2. Click **Add visualization**
3. Select data source (Grafana Live or configured source)
4. Configure query for your stream

### 2. Example Panel - Live Stream Data

To visualize data from Grafana Live streams:

1. **Panel type**: Time series, Stat, or Gauge
2. **Data source**: Configure based on your Grafana Live setup
3. **Refresh**: 5s (for near real-time updates)
4. **Time range**: Last 15 minutes

### 3. Add Threshold Alerts

1. In panel editor, go to **Alert** tab
2. Click **Create alert rule**
3. Configure conditions:
   ```
   WHEN avg() OF query(A, 5m) IS ABOVE 15
   ```
4. Set notification channels

### 4. Example Dashboard Layout

```
┌─────────────────────────────────────────────┐
│  Speed Over Ground (SOG)     │  Course      │
│  [Time series graph]          │  [Gauge]     │
├─────────────────────────────────────────────┤
│  GPS Quality                  │  Satellites  │
│  [Stat panel]                 │  [Stat]      │
├─────────────────────────────────────────────┤
│  Position History                            │
│  [Geomap or Track visualization]             │
└─────────────────────────────────────────────┘
```

---

## Troubleshooting

### Writer Not Sending Data

**Check Grafana is running:**
```bash
sudo systemctl status grafana-server
curl http://localhost:3000/api/health
```

**Check authentication:**
```bash
# Read token from file
TOKEN=$(cat /etc/openrvdas/secrets/grafana_token)

# Test with your token
curl -X POST http://localhost:3000/api/live/push/test \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: text/plain" \
  -d "test value=1.0"

# Should return 200 or 204 (success)
# 401 = bad token
# 404 = endpoint not available
```

**Check writer stats:**
```python
stats = writer.get_stats()
print(stats)
# {'sent': 0, 'dropped': 0, 'errors': 5, 'last_error': 'HTTP 401: Unauthorized'}
```

**Check Grafana logs:**
```bash
# Linux
sudo journalctl -u grafana-server -f
sudo tail -f /var/log/grafana/grafana.log

# macOS
tail -f /usr/local/var/log/grafana/grafana.log
```

### Data Not Appearing in Dashboard

1. **Verify data is being sent:**
   - Check writer stats show `sent > 0`
   - Check Grafana logs for incoming data

2. **Check time range:**
   - Ensure dashboard time range includes "now"
   - Try "Last 5 minutes" with auto-refresh

3. **Verify measurement name:**
   - Check the measurement name in your query matches what's being sent
   - Use Grafana's Explore feature to browse available data

4. **Check data source configuration:**
   - Verify connection to InfluxDB or Live source
   - Test data source connection

### High Error Rate

**Token Issues:**
```
Error: HTTP 401: Unauthorized
Fix: Regenerate service account token
```

**Network Issues:**
```
Error: Connection error: [Errno 111] Connection refused
Fix: Check Grafana is running and accessible
```

**Rate Limiting:**
```
Error: HTTP 429: Too Many Requests
Fix: Increase batch_size to reduce request rate
```

### Performance Issues

**Slow dashboard updates:**
- Reduce refresh interval in dashboard settings
- Increase `batch_size` in writer configuration
- Check network latency between writer and Grafana

**Writer queue filling:**
```
Warning: GrafanaLiveWriter queue full; dropping record
```
Solutions:
- Increase `queue_size`
- Increase `batch_size` to send faster
- Check network connectivity
- Verify Grafana can keep up with data rate

---

## Performance Tips

### For High-Rate Data (20Hz+)

```yaml
writers:
  - class: GrafanaLiveWriter
    kwargs:
      host: 'localhost:3000'
      stream_id: 'openrvdas/high_rate'
      token_file: '/etc/openrvdas/secrets/grafana_token'
      batch_size: 10        # Batch 10 records per HTTP request
      queue_size: 2000      # Larger queue for bursts
```

**Benefits:**
- 20Hz with `batch_size=10` → 2 HTTP requests/second (vs 20)
- Reduces network overhead by 90%
- Lower CPU usage on both sides

### Network Optimization

**Local Grafana:**
```yaml
host: 'localhost:3000'  # Fastest
```

**Remote Grafana:**
```yaml
host: 'grafana.example.com:3000'
token_file: '/etc/openrvdas/secrets/grafana_token'
secure: true  # Use HTTPS for remote
batch_size: 20  # Larger batches over network
```

### Memory Management

Monitor writer statistics:
```python
import time
import threading

def monitor_writer(writer):
    while True:
        stats = writer.get_stats()
        print(f"Sent: {stats['sent']}, Dropped: {stats['dropped']}, Errors: {stats['errors']}")
        time.sleep(10)

monitor_thread = threading.Thread(target=monitor_writer, args=(writer,), daemon=True)
monitor_thread.start()
```

### Graceful Shutdown

Always call `stop()` to ensure data is flushed:

```python
import signal
import sys

def signal_handler(sig, frame):
    print('Shutting down...')
    writer.stop()  # Flush remaining data
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)
```

---

## Additional Resources

### Official Documentation

- **Grafana Installation**: https://grafana.com/docs/grafana/latest/setup-grafana/installation/
- **Grafana Live**: https://grafana.com/docs/grafana/latest/setup-grafana/set-up-grafana-live/
- **Service Accounts**: https://grafana.com/docs/grafana/latest/administration/service-accounts/
- **InfluxDB Line Protocol**: https://docs.influxdata.com/influxdb/latest/reference/syntax/line-protocol/

### OpenRVDAS Resources

- **OpenRVDAS Documentation**: https://www.oceandatatools.org/openrvdas-docs/
- **Parser Documentation**: https://www.oceandatatools.org/openrvdas-docs/parsing/
- **Writer Documentation**: https://github.com/OceanDataTools/openrvdas/tree/master/logger/writers

### Example Configurations

See the OpenRVDAS repository for complete examples:
- `local/usap/nbp/` - NBP Palmer configuration examples
- `test/` - Test configurations and scripts

---

## Quick Reference

### Minimum Grafana Version
- **Grafana 8.0+** required for Live push API
- **Grafana 9.0+** recommended for best performance

### Required Ports
- **3000** - Grafana web interface (HTTP)
- **3001** - Grafana (HTTPS, if configured)

### Common Commands

```bash
# Start/stop Grafana (Linux)
sudo systemctl start grafana-server
sudo systemctl stop grafana-server
sudo systemctl restart grafana-server

# Start/stop Grafana (macOS)
brew services start grafana
brew services stop grafana
brew services restart grafana

# Check logs
sudo journalctl -u grafana-server -f  # Linux
tail -f /usr/local/var/log/grafana/grafana.log  # macOS

# Test connectivity
curl http://localhost:3000/api/health
```

### Default Credentials
- **Username**: admin
- **Password**: admin (change on first login)

---

## Summary

1. **Install Grafana** using official packages
2. **Enable Grafana Live** in configuration (usually enabled by default)
3. **Create Service Account** with Editor role
4. **Generate API Token** and store securely
5. **Configure GrafanaLiveWriter** in your logger config
6. **Create Dashboards** to visualize streaming data
7. **Monitor performance** using writer statistics

For high-rate data streams (20Hz+), use batching to improve efficiency:
```yaml
batch_size: 10  # Recommended for 20Hz
```

The `GrafanaLiveWriter` provides real-time data streaming to Grafana with minimal latency, making it ideal for live monitoring and alerting applications.
