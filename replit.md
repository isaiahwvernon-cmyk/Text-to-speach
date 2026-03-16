# IP-A1 Volume Controller

## Overview
A web interface for controlling multiple IP-A1 classroom speakers. Teachers can add rooms, name them, and control each speaker's volume from any browser on the school network.

## Architecture
- **Frontend**: React + TypeScript with Tailwind CSS and shadcn/ui components
- **Backend**: Express.js proxy that handles Digest Authentication to speakers
- **Storage**: Rooms saved in browser localStorage (no database needed)
- **Cross-platform**: Includes start.bat (Windows) and start.sh (Mac/Linux) for local running

## Theme & Design
- **Primary color**: Orange #FF8200
- **Grey accent**: #707372
- **Font**: Barlow (Google Fonts)
- Volume knob shows percentage only (no raw value / max)
- Mobile/tablet-first with large touch targets

## Key Features
- Multi-room management (add/edit/remove rooms, password-protected with "IPA1")
- Room tiles UI with search bar (appears when >5 rooms)
- **Multi-speaker rooms**: each room can have 1–N speakers grouped together
  - Sync mode: one master control fires to all speakers simultaneously
  - Individual mode: each speaker gets its own slider, mute, and presets
  - Numeric badge on room tile shows speaker count when >1
- Per-room volume control: slider, +/- buttons, presets (Low/Normal/Loud)
- Mute/unmute (single speaker or all-at-once in sync mode)
- Auto-polling for status updates every 10 seconds
- Admin lock/unlock (password: IPA1) gates room add/edit/delete
- Old single-speaker rooms.json format is auto-migrated on first load

## Key Files
- `client/src/pages/home.tsx` - Main page: RoomList, AddRoomDialog, AdminPasswordDialog, ControlPanel
- `server/routes.ts` - Backend proxy with Digest Authentication
- `shared/schema.ts` - Shared TypeScript types (Room, SpeakerStatus, SpeakerConnection)
- `client/src/index.css` - Theme colors (orange primary), Barlow font, safe-area CSS
- `start.bat` / `start.sh` - Local startup scripts for Windows / Mac / Linux

## API Proxy Routes
- `POST /api/speaker/status` - Get volume, mute state, model info
- `POST /api/speaker/volume/set` - Set master volume (0-61)
- `POST /api/speaker/volume/increment` - Increment volume
- `POST /api/speaker/volume/decrement` - Decrement volume
- `POST /api/speaker/mute/set` - Set mute/unmute state

## IP-A1 API
- Volume: 0 (Mute) to 61 (0 dB), initial: 31 (-30 dB)
- Auth: HTTP Digest Authentication
- Endpoints: GET /api/v2/volume/{get_master,set_master,inc_master,dec_master,get_master_mute,set_master_mute}
