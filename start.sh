#!/bin/bash
echo "=========================================="
echo "  REPIT — IP-A1 Control + TTS Paging"
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

echo "Building REPIT... this takes about 30 seconds."
echo

rm -rf dist

npx tsx script/build.ts
if [ $? -ne 0 ]; then
    echo
    echo "ERROR: Build failed. See above for details."
    exit 1
fi

echo
echo "Build complete!"
echo
echo "=========================================="
echo "  Default login credentials:"
echo "    Admin:  admin  / admin"
echo "    IT:     it     / it1234"
echo "  (Change these after first login)"
echo "=========================================="
echo
echo "Starting server..."
echo
echo "Open your browser to:  http://localhost:5000"
echo
echo "Press Ctrl+C to stop the server."
echo "=========================================="
echo

# Auto-open browser after 4 seconds
(sleep 4 && open "http://localhost:5000" 2>/dev/null || xdg-open "http://localhost:5000" 2>/dev/null) &

NODE_ENV=production node dist/index.cjs
