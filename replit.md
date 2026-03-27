# REPIT — IP-A1 Control + TTS Paging System

## Overview
A full-featured web application for controlling TOA IP-A1 speakers and sending Text-to-Speech announcements over SIP/RTP. Features role-based access control, multi-zone paging, and configurable audio routing.

## Architecture
- **Frontend**: React + TypeScript with Tailwind CSS and shadcn/ui components
- **Backend**: Express.js (Node.js) handling auth, speaker control, TTS routing
- **Storage**: JSON file-based (users.json, rooms.json, settings.json, logs.json)
- **Auth**: JWT tokens (bcryptjs + jsonwebtoken)
- **TTS**: Kokoro TTS via Python subprocess (install with: pip install kokoro soundfile)
- **SIP/RTP**: Configured but requires real SIP server/network for live audio

## Theme & Design
- **Primary color**: Orange #FF8200
- **Grey accent**: #707372
- **Font**: Barlow (Google Fonts)
- Mobile/tablet-first with large touch targets

## User Roles

### Normal User (role: user)
- See only assigned rooms
- Send TTS announcements (if ttsEnabled)
- Up to 5 TTS presets
- Volume control for assigned speakers

### Admin (role: admin)
- All user role features + all rooms visible
- Create/edit/delete users
- Assign rooms to users
- Enable/disable TTS per user

### IT (role: it)
- All rooms visible
- SIP configuration (server, port, credentials)
- IP-A1PG gateway settings
- TTS engine settings (codec, delays, voice speed/pitch)
- System logging

## Default Credentials
- **admin / admin** (Admin role)
- **it / it1234** (IT role)
These are seeded automatically on first run if no users.json exists.

## Key Files
- `client/src/pages/home.tsx` — Main dashboard (TTS panel + volume control)
- `client/src/pages/login.tsx` — Login page
- `client/src/pages/admin.tsx` — Admin: user management
- `client/src/pages/it-settings.tsx` — IT: SIP, PG, TTS, logging settings
- `client/src/context/AuthContext.tsx` — JWT auth context
- `client/src/lib/auth.ts` — Auth utilities (token storage, apiFetch)
- `server/routes.ts` — All API routes
- `server/db.ts` — JSON file-based data layer
- `server/auth.ts` — JWT middleware (requireAuth, requireRole)
- `server/tts-engine.ts` — TTS integration (Kokoro via Python subprocess)
- `server/kokoro_tts.py` — Python TTS helper script
- `shared/schema.ts` — All TypeScript types and Zod schemas

## API Routes

### Auth
- `POST /api/auth/login` — Login, returns JWT token
- `GET /api/auth/me` — Get current user (requires auth)

### Rooms (auth required)
- `GET /api/rooms` — List rooms (role-filtered for normal users)
- `PUT /api/rooms` — Save rooms config (admin/IT only)

### Speaker Control (auth required)
- `POST /api/speaker/status` — Get volume, mute, model info
- `POST /api/speaker/volume/set` — Set volume (0-61)
- `POST /api/speaker/volume/increment` — Increment volume
- `POST /api/speaker/volume/decrement` — Decrement volume
- `POST /api/speaker/mute/set` — Set mute/unmute

### User Management (admin only)
- `GET /api/users` — List all users
- `POST /api/users` — Create user
- `PUT /api/users/:id` — Update user
- `DELETE /api/users/:id` — Delete user

### TTS Presets (auth required)
- `GET /api/presets` — Get user's presets
- `POST /api/presets` — Create preset (max 5)
- `PUT /api/presets/:id` — Update preset
- `DELETE /api/presets/:id` — Delete preset

### TTS
- `POST /api/tts/send` — Send TTS announcement

### Settings (IT only)
- `GET /api/settings` — Get system settings
- `PUT /api/settings` — Save system settings

### Logs (IT only)
- `GET /api/logs` — Get recent logs
- `DELETE /api/logs` — Clear all logs

### System
- `GET /api/system/status` — Server, TTS, SIP, PG status
- `GET /api/info` — LAN IP and port

## TTS Flow

### Direct Mode (peer-to-peer)
```
text → Kokoro TTS → PCM → transcode to codec → SIP/RTP → IP-A1 speaker
```

### PG Mode (multicast zones)
```
text → Kokoro TTS → PCM → codec → SIP call to IP-A1PG → DTMF extension →
wait dtmfDelayMs → [chime → wait chimeDelayMs] → RTP stream →
PG routes to multicast channel → speakers
```

## Supported Codecs
- G.711u (PCMU) — 8kHz μ-law
- G.711a (PCMA) — 8kHz A-law
- G.722 — 16kHz wideband

## Enabling Real TTS
1. Install Python 3.8+
2. `pip install kokoro soundfile`
3. Restart the server — it will auto-detect Kokoro at startup
4. Status shows "TTS: ok" in the header when ready

## IP-A1 API
- Volume: 0 (Mute) to 61 (0 dB), initial: 31 (−30 dB)
- Auth: HTTP Digest Authentication
- Endpoints: GET /api/v2/volume/{get_master,set_master,inc_master,dec_master,get_master_mute,set_master_mute}
