#!/bin/bash
echo "=========================================="
echo "  REPIT -- IP-A1 Control + TTS Paging"
echo "=========================================="
echo

# ── Check Node.js ─────────────────────────────────────────────────────────────
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed."
    echo "Please install it from https://nodejs.org"
    exit 1
fi

NODEVER=$(node --version)
echo "Node.js version: $NODEVER"
echo

# ── Install Node dependencies if needed ───────────────────────────────────────
if [ ! -d "node_modules" ]; then
    echo "Installing Node dependencies... this may take a minute."
    echo
    npm install
    echo
fi

# ── Check Python + install Kokoro TTS ─────────────────────────────────────────
echo "Checking TTS engine (Kokoro)..."
echo

PYTHON_CMD=""
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
fi

if [ -z "$PYTHON_CMD" ]; then
    echo "[TTS] WARNING: Python not found. Kokoro TTS will not be available."
    echo "[TTS] To enable real audio: install Python 3.8+ from https://python.org"
    echo "[TTS] REPIT will still run in simulation mode without it."
    echo
else
    PYVER=$($PYTHON_CMD --version)
    echo "Python found: $PYVER"

    if $PYTHON_CMD -c "import kokoro" &> /dev/null; then
        echo "[TTS] Kokoro TTS: already installed -- OK"
        echo
    else
        echo "[TTS] Installing Kokoro TTS and dependencies..."
        echo "[TTS] This may take several minutes on first run (downloading ~300MB model)."
        echo
        $PYTHON_CMD -m pip install kokoro soundfile
        if [ $? -ne 0 ]; then
            echo
            echo "[TTS] WARNING: Kokoro install failed. TTS will run in simulation mode."
            echo "[TTS] Retry manually: pip install kokoro soundfile"
            echo
        else
            echo
            echo "[TTS] Kokoro TTS installed successfully!"
            echo
        fi
    fi
fi

# ── Check / install ffmpeg ────────────────────────────────────────────────────
echo "Checking audio streaming (ffmpeg)..."
echo

if command -v ffmpeg &> /dev/null; then
    FFVER=$(ffmpeg -version 2>&1 | head -1)
    echo "[AUDIO] $FFVER -- OK"
    echo
else
    echo "[AUDIO] ffmpeg not found. Attempting install..."
    echo

    if [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v brew &> /dev/null; then
            brew install ffmpeg
            echo
        else
            echo "[AUDIO] WARNING: Homebrew not found. Install ffmpeg manually:"
            echo "[AUDIO]   https://ffmpeg.org/download.html"
            echo
        fi
    else
        # Linux — try apt-get then yum
        if command -v apt-get &> /dev/null; then
            sudo apt-get install -y ffmpeg
            echo
        elif command -v yum &> /dev/null; then
            sudo yum install -y ffmpeg
            echo
        else
            echo "[AUDIO] WARNING: Could not auto-install ffmpeg."
            echo "[AUDIO] Install manually: https://ffmpeg.org/download.html"
            echo
        fi
    fi

    if command -v ffmpeg &> /dev/null; then
        echo "[AUDIO] ffmpeg installed successfully!"
        echo
    else
        echo "[AUDIO] Audio delivery will not work until ffmpeg is installed."
        echo
    fi
fi

# ── Build REPIT ────────────────────────────────────────────────────────────────
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

# ── Launch ─────────────────────────────────────────────────────────────────────
echo "=========================================="
echo "  Default login credentials:"
echo "    Admin:  admin  / admin"
echo "    IT:     it     / it1234"
echo "  (Change these after first login via Admin panel)"
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
