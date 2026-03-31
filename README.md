# IV VoxNova — IP-A1 Control + TTS Paging System

A self-hosted web application for controlling TOA IP-A1 series network speakers and sending Text-to-Speech announcements over your local network. Supports role-based access (User / Admin / IT), multi-zone paging via Paging Gateways, and direct SIP speaker routing.

---

## Requirements

### Node.js (required)
- **Node.js 18 or newer** — https://nodejs.org (download the LTS version)
- After installing, restart the PC
- Verify: open Command Prompt and type `node --version`

### Python 3.12 (required for TTS voice announcements)
- **Python 3.12** — https://www.python.org/downloads/release/python-3120/
- During installation, **tick "Add Python to PATH"** — this is critical
- Verify: open Command Prompt and type `python --version` (should show 3.12.x)

### Python packages (required for TTS)
After installing Python 3.12, open Command Prompt and run:
```
pip install kokoro soundfile
```
These packages provide the Kokoro TTS voice engine (free, open-source, Apache 2.0).

### ffmpeg (required for SIP/RTP audio delivery)
- Download from https://ffmpeg.org/download.html
- Extract and add the `bin` folder to your system PATH
- Verify: open Command Prompt and type `ffmpeg -version`

### Hardware
- TOA IP-A1 series network ceiling speakers (with HTTP API v2 support)
- Speakers must have fixed/reserved IP addresses on the same LAN
- Optional: TOA IP-A1PG Paging Gateway (for multicast zone paging)

---

## Quick Start (Windows)

1. Install Node.js, Python 3.12 (with PATH), and run `pip install kokoro soundfile`
2. Download and unzip this project folder
3. Double-click **start.bat**
4. A browser window opens automatically — scan the QR code from any device on your network

## Quick Start (Mac / Linux)

1. Install Node.js and Python 3.12 (ensure `python3` is in PATH)
2. Run: `pip3 install kokoro soundfile`
3. Open a terminal in the project folder and run: `bash start.sh`
4. Open your browser to **http://localhost:5000**

---

## Default Login Credentials

| Username | Password | Role |
|----------|----------|------|
| admin    | admin    | Admin |
| it       | it1234   | IT Manager |

Change these after first login via Admin → User Management.

---

## Features

- **Role-based access**: User / Admin / IT — each role sees only what they need
- **TTS Announcements**: Type text, send voice announcements to speakers or paging zones
- **Direct SIP routing**: Send audio directly to IP-A1 speaker IP addresses
- **PG Gateway routing**: Route audio through one or more Paging Gateways to multicast zones
- **Volume & mute control**: Full speaker volume management from any browser or phone
- **Contacts**: Admin/IT create named contacts (zones/rooms) and assign them to users
- **TTS presets**: Save frequently used announcement texts for one-tap sending
- **TTS queue**: Multiple users can send at the same time — requests are queued automatically
- **QR code**: Scan to connect any phone or tablet instantly — no app install needed
- **System logging**: Full audit log of all TTS sends, logins, and configuration changes

---

## Architecture

- **Frontend**: React + TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Node.js + Express
- **TTS engine**: Kokoro TTS (Python 3.12 subprocess)
- **Audio delivery**: ffmpeg + SIP/RTP
- **Storage**: JSON files (no database required)
- **Auth**: JWT tokens (bcryptjs)

---

## Folder Structure

```
/
├── client/           React frontend (Vite)
├── server/           Express backend
│   ├── routes.ts     All API endpoints
│   ├── db.ts         JSON file storage layer
│   ├── tts-engine.ts Kokoro TTS integration
│   ├── tts-queue.ts  TTS job queue
│   └── kokoro_tts.py Python TTS script
├── shared/
│   └── schema.ts     Shared TypeScript types + Zod schemas
├── users.json        User accounts (auto-created)
├── rooms.json        Contacts/speaker config (auto-created)
├── settings.json     System settings (auto-created)
├── logs.json         System log (auto-created)
└── start.bat         Windows launcher
```

---

## License

MIT License — see OPEN_SOURCE.txt for full text and dependency information.

This software is NOT affiliated with or endorsed by TOA Corporation or TOA Canada.
It is a third-party community tool that communicates with TOA speakers using their
publicly documented HTTP API.
