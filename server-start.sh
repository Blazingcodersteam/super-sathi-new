#!/bin/bash

# Server startup script
echo "Starting Vivaaha API Server..."

# Kill existing processes
pkill -f "node src/app.js"

# Install dependencies
npm install

# Build TypeScript
npm run build

# Start server
npm start