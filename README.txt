================================================================================
  IV VoxNova — IP-A1 CONTROL + TTS PAGING SYSTEM
================================================================================
A self-hosted web application for controlling TOA IP-A1 series network speakers
and sending Text-to-Speech announcements over your local network. Supports
role-based access (User / Admin / IT / Recovery), multi-zone paging via Paging
Gateways, direct SIP speaker routing, a full Multicast Channel Matrix for
managing receiver subscriptions across all PG channels, Global Priority Presets,
and bilingual announcements.


--------------------------------------------------------------------------------
REQUIREMENTS
--------------------------------------------------------------------------------

NODE.JS (required)
  - Node.js 18 or newer — https://nodejs.org (download the LTS version)
  - After installing, restart the PC
  - Verify: open Command Prompt and type:  node --version

PYTHON 3.12 (required for TTS voice announcements)
  - Python 3.12 — https://www.python.org/downloads/release/python-3120/
  - During installation, TICK "Add Python to PATH" — this is critical
  - Verify: open Command Prompt and type:  python --version  (should show 3.12.x)

PYTHON PACKAGES (required for TTS)
  After installing Python 3.12, open Command Prompt and run:
    pip install kokoro soundfile
  These packages provide the Kokoro TTS voice engine (free, open-source,
  Apache 2.0). start.bat installs them automatically on first run.

FFMPEG (required for SIP/RTP audio delivery)
  - Download from https://ffmpeg.org/download.html
  - Extract and add the bin folder to your system PATH
  - Verify: open Command Prompt and type:  ffmpeg -version

HARDWARE
  - TOA IP-A1 series network ceiling speakers (with HTTP API v2 support)
  - Speakers must have fixed/reserved IP addresses on the same LAN
  - Optional: TOA IP-A1PG Paging Gateway (for multicast zone paging)


--------------------------------------------------------------------------------
QUICK START (WINDOWS)
--------------------------------------------------------------------------------
1. Install Node.js and Python 3.12 (tick "Add Python to PATH")
2. Download and unzip this project folder
3. Double-click  start.bat
   (start.bat will install all Python packages and build the app automatically
    on first run — this may take 1-2 minutes)
4. A browser window opens automatically — scan the QR code from any device
   on your network to connect

QUICK START (MAC / LINUX)
1. Install Node.js and Python 3.12 (ensure python3 is in PATH)
2. Run:  pip3 install kokoro soundfile
3. Open a terminal in the project folder and run:  bash start.sh
4. Open your browser to  http://localhost:5000


--------------------------------------------------------------------------------
DEFAULT LOGIN CREDENTIALS
--------------------------------------------------------------------------------
  Username    Password    Role
  --------    --------    ----
  admin       admin       Admin
  it          it1234      IT Manager

Change these after first login via Admin -> User Management.


--------------------------------------------------------------------------------
FEATURES
--------------------------------------------------------------------------------
  - Role-based access: User / Admin / IT — each role sees only what they need
  - TTS Announcements: type text, send voice to speakers or paging zones
  - Bilingual announcements: add a second language that plays right after
    the first as one seamless audio clip
  - Global Priority Presets: pre-generated announcements that play instantly
    with higher priority than regular TTS, interrupting any current playback
  - Direct SIP routing: send audio directly to IP-A1 speaker IP addresses
  - PG Gateway routing: route audio through Paging Gateways to multicast zones
  - Multi-Management: full Multicast Channel Matrix — sync receiver channel
    subscriptions from all PG receivers on the network, view and edit which
    channels each receiver is subscribed to, and push changes back to devices
    in one click; PG active channels are highlighted; zone grouping by contact
  - Volume & mute control: full speaker volume management from any browser
  - Contacts: admin/IT create named contacts (zones/rooms) assigned to users
  - Personal TTS presets: save frequently used announcement texts for users
  - TTS queue: multiple users send at the same time — requests queue automatically
  - QR code: scan to connect any phone or tablet instantly, no app required
  - System logging: full audit log of all TTS sends, logins, config changes
  - Export/import: back up and restore contacts and system configuration

SUPPORTED TTS LANGUAGES
  - English (US / UK)
  - French, Spanish, Italian, Portuguese
  - Hindi


--------------------------------------------------------------------------------
ARCHITECTURE
--------------------------------------------------------------------------------
  Frontend:   React + TypeScript, Tailwind CSS, shadcn/ui
  Backend:    Node.js + Express
  TTS engine: Kokoro TTS (Python 3.12 subprocess)
  Audio:      ffmpeg + SIP/RTP
  Storage:    JSON files (no database required)
  Auth:       JWT tokens (bcryptjs password hashing)


--------------------------------------------------------------------------------
FOLDER STRUCTURE
--------------------------------------------------------------------------------
  /
  ├── client/              React frontend (Vite)
  ├── server/              Express backend
  │   ├── routes.ts        All API endpoints
  │   ├── tts-engine.ts    Kokoro TTS integration
  │   ├── tts-queue.ts     TTS job queue
  │   ├── sip-sender.ts    SIP/RTP audio delivery
  │   └── kokoro_tts.py    Python TTS script
  ├── shared/
  │   └── schema.ts        Shared TypeScript types + Zod schemas
  ├── data/
  │   ├── users.json       User accounts (auto-created)
  │   ├── rooms.json       Contacts/speaker config (auto-created)
  │   ├── settings.json    System settings (auto-created)
  │   ├── logs.json        System log (auto-created)
  │   └── presets/         Pre-generated audio files for Global Presets
  ├── start.bat            Windows launcher
  └── README.txt           This file


--------------------------------------------------------------------------------
LICENSE
--------------------------------------------------------------------------------
MIT License — see OPEN_SOURCE.txt for full text and dependency information.

This software is NOT affiliated with or endorsed by TOA Corporation or
TOA Canada. It is a third-party community tool that communicates with TOA
speakers using their publicly documented HTTP API.


================================================================================
  END OF README
================================================================================
