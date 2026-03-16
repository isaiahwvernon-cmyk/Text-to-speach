#!/bin/bash
echo "=========================================="
echo "  TOA IP-A1 Speaker Control"
echo "=========================================="
echo

if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed."
    echo "Please install it from https://nodejs.org"
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "Installing dependencies... this may take a minute."
    echo
    npm install
    echo
fi

echo "Starting server..."
echo
echo "Open your browser to:  http://localhost:5000"
echo
echo "Press Ctrl+C to stop the server."
echo "=========================================="
echo

NODE_ENV=development npx tsx server/index.ts
