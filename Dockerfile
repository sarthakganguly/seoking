FROM mcr.microsoft.com/playwright/python:v1.60.0-jammy

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies for VNC, Xvfb, and other requirements
RUN apt-get update && apt-get install -y \
    xvfb \
    x11vnc \
    novnc \
    websockify \
    && rm -rf /var/lib/apt/lists/*

# Set up working directory
WORKDIR /app

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download spaCy model for NLP Content Optimization
RUN python -m spacy download en_core_web_sm

# Copy the rest of the application
COPY . .

# Ensure entrypoint.sh is executable
RUN chmod +x entrypoint.sh

# Expose FastAPI and noVNC ports
EXPOSE 8000
EXPOSE 8081

# Set display environment variable for Xvfb
ENV DISPLAY=:99
ENV PYTHONUNBUFFERED=1

ENTRYPOINT ["/app/entrypoint.sh"]
