import fs from "fs";
import path from "path";
import crypto from "crypto";
import type {
  UserWithPassword,
  SystemSettings,
  LogEntry,
  LogLevel,
  GlobalPreset,
} from "@shared/schema";

const DATA_DIR = path.resolve(process.cwd());
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const LOGS_FILE = path.join(DATA_DIR, "logs.json");

function makeId(): string {
  return Date.now().toString(36) + crypto.randomBytes(4).toString("hex");
}

// ─── Users ────────────────────────────────────────────────────────────────────

function readUsers(): UserWithPassword[] {
  try {
    if (!fs.existsSync(USERS_FILE)) return [];
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeUsers(users: UserWithPassword[]): void {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
}

export function getAllUsers(): UserWithPassword[] {
  return readUsers();
}

export function getUserById(id: string): UserWithPassword | undefined {
  return readUsers().find((u) => u.id === id);
}

export function getUserByUsername(username: string): UserWithPassword | undefined {
  return readUsers().find((u) => u.username.toLowerCase() === username.toLowerCase());
}

export function createUser(data: Omit<UserWithPassword, "id">): UserWithPassword {
  const users = readUsers();
  const user: UserWithPassword = { id: makeId(), ...data };
  users.push(user);
  writeUsers(users);
  return user;
}

export function updateUser(id: string, data: Partial<UserWithPassword>): UserWithPassword | null {
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  users[idx] = { ...users[idx], ...data };
  writeUsers(users);
  return users[idx];
}

export function deleteUser(id: string): boolean {
  const users = readUsers();
  const filtered = users.filter((u) => u.id !== id);
  if (filtered.length === users.length) return false;
  writeUsers(filtered);
  return true;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: SystemSettings = {
  sip: {
    serverAddress: "",
    serverPort: 5060,
    username: "",
    password: "",
    fromExtension: "",
    realm: "",
  },
  pgs: [],
  tts: {
    defaultCodec: "PCMU",
    defaultMode: "direct",
    dtmfDelayMs: 600,
    chimeEnabled: false,
    chimeDelayMs: 750,
    voiceSpeed: 1.0,
    voicePitch: 1.0,
  },
  logging: {
    enabled: true,
    retainDays: 30,
  },
};

export function getSettings(): SystemSettings {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return DEFAULT_SETTINGS;
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));

    // Migrate from old single `pg` object to `pgs` array
    let pgs = Array.isArray(raw.pgs) ? raw.pgs : [];
    if (pgs.length === 0 && raw.pg && raw.pg.address) {
      pgs = [{ id: "default", name: "Main Gateway", ...raw.pg }];
    }

    return {
      sip: { ...DEFAULT_SETTINGS.sip, ...raw.sip },
      pgs,
      tts: { ...DEFAULT_SETTINGS.tts, ...raw.tts },
      logging: { ...DEFAULT_SETTINGS.logging, ...raw.logging },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: SystemSettings): void {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

function readLogs(): LogEntry[] {
  try {
    if (!fs.existsSync(LOGS_FILE)) return [];
    return JSON.parse(fs.readFileSync(LOGS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeLogs(logs: LogEntry[]): void {
  fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2), "utf-8");
}

export function addLog(
  level: LogLevel,
  message: string,
  user?: string,
  details?: string
): LogEntry {
  const settings = getSettings();
  if (!settings.logging.enabled) {
    return {
      id: makeId(),
      timestamp: new Date().toISOString(),
      level,
      message,
      user,
      details,
    };
  }

  const logs = readLogs();
  const entry: LogEntry = {
    id: makeId(),
    timestamp: new Date().toISOString(),
    level,
    message,
    user,
    details,
  };

  logs.unshift(entry);

  // Trim old logs
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - settings.logging.retainDays);
  const trimmed = logs.filter((l) => new Date(l.timestamp) >= cutoff);

  writeLogs(trimmed.slice(0, 5000));
  return entry;
}

export function getLogs(limit = 200): LogEntry[] {
  return readLogs().slice(0, limit);
}

export function clearLogs(): void {
  writeLogs([]);
}

// ─── Global Presets ───────────────────────────────────────────────────────────

const PRESETS_FILE = path.join(DATA_DIR, "presets.json");
export const PRESETS_AUDIO_DIR = path.join(DATA_DIR, "data", "presets");

function readPresets(): GlobalPreset[] {
  try {
    if (!fs.existsSync(PRESETS_FILE)) return [];
    return JSON.parse(fs.readFileSync(PRESETS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writePresets(presets: GlobalPreset[]): void {
  fs.writeFileSync(PRESETS_FILE, JSON.stringify(presets, null, 2), "utf-8");
}

export function getAllPresets(): GlobalPreset[] {
  return readPresets();
}

export function getPresetById(id: string): GlobalPreset | undefined {
  return readPresets().find((p) => p.id === id);
}

export function createPreset(data: Omit<GlobalPreset, "id">): GlobalPreset {
  const presets = readPresets();
  const preset: GlobalPreset = { id: makeId(), ...data };
  presets.push(preset);
  writePresets(presets);
  return preset;
}

export function updatePreset(id: string, data: Partial<GlobalPreset>): GlobalPreset | null {
  const presets = readPresets();
  const idx = presets.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  presets[idx] = { ...presets[idx], ...data };
  writePresets(presets);
  return presets[idx];
}

export function deletePreset(id: string): GlobalPreset | null {
  const presets = readPresets();
  const idx = presets.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const [removed] = presets.splice(idx, 1);
  writePresets(presets);
  return removed;
}

// ─── Seed default admin ───────────────────────────────────────────────────────
export async function seedDefaultAdmin(): Promise<void> {
  const users = readUsers();
  if (users.length > 0) return;

  // Import bcryptjs dynamically
  const bcrypt = await import("bcryptjs");
  const hash = await bcrypt.hash("admin", 10);

  const admin: UserWithPassword = {
    id: makeId(),
    username: "admin",
    displayName: "Administrator",
    role: "admin",
    passwordHash: hash,
    ttsEnabled: true,
    assignedRoomIds: [],
    presets: [],
  };

  const itHash = await bcrypt.hash("it1234", 10);
  const itUser: UserWithPassword = {
    id: makeId(),
    username: "it",
    displayName: "IT Manager",
    role: "it",
    passwordHash: itHash,
    ttsEnabled: true,
    assignedRoomIds: [],
    presets: [],
  };

  writeUsers([admin, itUser]);
  console.log("[IV VoxNova] Default users seeded — admin/admin and it/it1234");
}
