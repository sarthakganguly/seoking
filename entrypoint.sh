#!/bin/bash
set -e

# 1. Start Xvfb in the background
echo "Starting Xvfb on display :99..."
Xvfb :99 -screen 0 1280x1024x24 -ac +extension RANDR &
# Wait for Xvfb to start
sleep 2

# 2. Start x11vnc in the background
echo "Starting x11vnc..."
# -forever keeps running, -shared allows multiple connections, -nopw disables password for local single-user use
x11vnc -forever -shared -display :99 -rfbport 5900 -nopw -listen localhost -xkb &
sleep 2

# 3. Start websockify for noVNC
echo "Starting websockify on port 8081..."
# On Ubuntu, the files for noVNC are at /usr/share/novnc.
# Link index.html to vnc.html if index.html is missing so noVNC loads directly from root URL
if [ -f /usr/share/novnc/vnc.html ] && [ ! -f /usr/share/novnc/index.html ]; then
    ln -s /usr/share/novnc/vnc.html /usr/share/novnc/index.html
fi
websockify --web /usr/share/novnc 8081 localhost:5900 &
sleep 2

# 4. Run the FastAPI application
echo "Starting FastAPI application..."
if [ "$ENVIRONMENT" = "development" ]; then
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
else
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000
fi
