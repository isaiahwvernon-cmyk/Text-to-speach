import type { Express } from "express";
import http, { type Server } from "http";
import {
  speakerConnectionSchema,
  contactSchema,
  loginSchema,
  createUserSchema,
  updateUserSchema,
  systemSettingsSchema,
  ttsSendSchema,
  ttsPresetSchema,
} from "@shared/schema";
import { z } from "zod";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import os from "os";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import {
  getAllUsers,
  getUserByUsername,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getSettings,
  saveSettings,
  getLogs,
  clearLogs,
  addLog,
  getAllPresets,
  getPresetById,
  createPreset,
  updatePreset,
  deletePreset,
} from "./db.js";
import { signToken, requireAuth, requireRole } from "./auth.js";
import {
  sendTtsAnnouncement,
  getTtsStatus,
  generatePresetAudio,
  sendPresetAnnouncement,
  deletePresetAudio,
} from "./tts-engine.js";
import { enqueueJob, getJobStatus, getQueueLength } from "./tts-queue.js";
import {
  createGlobalPresetSchema,
  presetPlaySchema,
} from "@shared/schema";

const ROOMS_CONFIG_PATH = path.resolve(process.cwd(), "rooms.json");

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function readRoomsConfig(): any[] {
  try {
    if (!fs.existsSync(ROOMS_CONFIG_PATH)) {
      fs.writeFileSync(ROOMS_CONFIG_PATH, JSON.stringify([], null, 2), "utf-8");
    }
    const raw = fs.readFileSync(ROOMS_CONFIG_PATH, "utf-8");
    const parsed: any[] = JSON.parse(raw);

    const migrated = parsed.map((r: any) => {
      // Migrate old flat structure
      if (r.ipAddress && !r.speakers) {
        return {
          id: r.id,
          name: r.name,
          mode: "direct",
          syncMode: true,
          pgExtension: "",
          speakers: [
            {
              id: makeId(),
              label: "Speaker 1",
              ipAddress: r.ipAddress,
              username: r.username,
              password: r.password,
            },
          ],
        };
      }
      // Ensure mode/pgExtension fields exist
      return {
        mode: "direct",
        pgExtension: "",
        ...r,
      };
    });

    if (migrated.some((r: any, i: number) => r !== parsed[i])) {
      fs.writeFileSync(ROOMS_CONFIG_PATH, JSON.stringify(migrated, null, 2), "utf-8");
    }

    return migrated;
  } catch {
    return [];
  }
}

function writeRoomsConfig(rooms: any[]): void {
  fs.writeFileSync(ROOMS_CONFIG_PATH, JSON.stringify(rooms, null, 2), "utf-8");
}

function getNetworkUrls(): string[] {
  const ifaces = os.networkInterfaces();
  const urls: string[] = [];
  for (const [, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === "IPv4" && !addr.internal) {
        urls.push(`http://${addr.address}:5000`);
      }
    }
  }
  return urls.length > 0 ? urls : ["http://localhost:5000"];
}

const volumeSetSchema = speakerConnectionSchema.extend({
  volume: z.number().int().min(0).max(61),
});

const muteSetSchema = speakerConnectionSchema.extend({
  mute_state: z.enum(["mute", "unmute"]),
});

function parseDigestChallenge(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /(\w+)=(?:"([^"]+)"|([^\s,]+))/g;
  let match;
  while ((match = regex.exec(header)) !== null) {
    result[match[1]] = match[2] || match[3];
  }
  return result;
}

function buildDigestAuth(
  method: string,
  uri: string,
  username: string,
  password: string,
  realm: string,
  nonce: string,
  qop?: string,
  nc?: string,
  cnonce?: string,
  opaque?: string
): string {
  const ha1 = crypto.createHash("md5").update(`${username}:${realm}:${password}`).digest("hex");
  const ha2 = crypto.createHash("md5").update(`${method}:${uri}`).digest("hex");
  let response: string;
  if (qop === "auth" && nc && cnonce) {
    response = crypto.createHash("md5").update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`).digest("hex");
  } else {
    response = crypto.createHash("md5").update(`${ha1}:${nonce}:${ha2}`).digest("hex");
  }
  let header = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
  if (qop) header += `, qop=${qop}`;
  if (nc) header += `, nc=${nc}`;
  if (cnonce) header += `, cnonce="${cnonce}"`;
  if (opaque) header += `, opaque="${opaque}"`;
  return header;
}

async function makeRequest(
  ipAddress: string,
  apiPath: string,
  username: string,
  password: string
): Promise<{ status: number; response: any }> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: ipAddress,
      port: 80,
      path: apiPath,
      method: "GET",
      timeout: 3000,
    };

    const doRequest = (authHeader?: string) => {
      const reqOptions = { ...options };
      if (authHeader) {
        reqOptions.headers = { Authorization: authHeader };
      }

      const req = http.request(reqOptions, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode === 401 && !authHeader) {
            const wwwAuth = res.headers["www-authenticate"] || "";
            if (wwwAuth.toLowerCase().startsWith("digest")) {
              const params = parseDigestChallenge(wwwAuth);
              const realm = params.realm || "";
              const nonce = params.nonce || "";
              const qop = params.qop;
              const opaque = params.opaque;
              const nc = "00000001";
              const cnonce = crypto.randomBytes(8).toString("hex");
              const uri = apiPath;
              const digestHeader = buildDigestAuth(
                "GET", uri, username, password, realm, nonce,
                qop ? "auth" : undefined, qop ? nc : undefined, qop ? cnonce : undefined, opaque
              );
              doRequest(digestHeader);
            } else {
              const basic = Buffer.from(`${username}:${password}`).toString("base64");
              doRequest(`Basic ${basic}`);
            }
          } else if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve({ status: res.statusCode!, response: JSON.parse(data) });
            } catch {
              resolve({ status: res.statusCode!, response: {} });
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          }
        });
      });

      req.on("error", (err) => reject(err));
      req.on("timeout", () => { req.destroy(); reject(new Error("Connection timed out")); });
      req.end();
    };

    doRequest();
  });
}

// Downloads the raw config file from an IP-A1 device (returns raw string, not JSON-parsed)
async function downloadConfigFile(ipAddress: string, username: string, password: string): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const apiPath = "/api/v2/config/download";
    const options: http.RequestOptions = { hostname: ipAddress, port: 80, path: apiPath, method: "GET", timeout: 6000 };

    const doRequest = (authHeader?: string) => {
      const reqOptions = { ...options };
      if (authHeader) reqOptions.headers = { Authorization: authHeader };

      const req = http.request(reqOptions, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode === 401 && !authHeader) {
            const wwwAuth = res.headers["www-authenticate"] || "";
            if (wwwAuth.toLowerCase().startsWith("digest")) {
              const params = parseDigestChallenge(wwwAuth);
              const realm = params.realm || "";
              const nonce = params.nonce || "";
              const qop = params.qop;
              const opaque = params.opaque;
              const nc = "00000001";
              const cnonce = crypto.randomBytes(8).toString("hex");
              const digestHeader = buildDigestAuth(
                "GET", apiPath, username, password, realm, nonce,
                qop ? "auth" : undefined, qop ? nc : undefined, qop ? cnonce : undefined, opaque
              );
              doRequest(digestHeader);
            } else {
              const basic = Buffer.from(`${username}:${password}`).toString("base64");
              doRequest(`Basic ${basic}`);
            }
          } else if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, data });
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      });
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("Timed out")); });
      req.end();
    };

    doRequest();
  });
}

// Parse conv_sip_enableN fields from PG config file (JSON or raw text)
function parsePgActiveChannels(data: string): number[] {
  let config: any = {};
  try { config = JSON.parse(data); } catch { /* use regex fallback */ }

  const active: number[] = [];
  for (let i = 1; i <= 20; i++) {
    const jsonVal = config[`conv_sip_enable${i}`];
    if (jsonVal === 1 || jsonVal === "1" || jsonVal === true || jsonVal === "on") {
      active.push(i);
    } else if (jsonVal === undefined) {
      // Fallback: regex on raw string
      const pat = new RegExp(`"?conv_sip_enable${i}"?\\s*[=:]\\s*"?1"?`);
      if (pat.test(data)) active.push(i);
    }
  }
  return active;
}

export async function registerRoutes(httpServer: Server, app: Express, _lanIP?: string, _port?: number): Promise<Server> {

  // ─────────────────────────────────────────────────────────────────────────────
  // SYSTEM STATUS
  // ─────────────────────────────────────────────────────────────────────────────

  app.get("/api/system/status", requireAuth, (_req, res) => {
    const ttsStatus = getTtsStatus();
    const settings = getSettings();
    const pgConfigured = settings.pgs.length > 0 && settings.pgs.some((g: any) => g.address);

    res.json({
      server: "ok",
      tts: ttsStatus,
      pg: pgConfigured ? "ok" : "unconfigured",
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // QR CODE (public — no auth)
  // ─────────────────────────────────────────────────────────────────────────────

  app.get("/api/qr", (_req, res) => {
    const urls = getNetworkUrls();
    res.json({ urls, url: urls[0] });
  });

  app.get("/api/qr/image", async (req, res) => {
    try {
      const urls = getNetworkUrls();
      const url = (req.query.url as string) || urls[0];
      const svg = await QRCode.toString(url, { type: "svg", margin: 2, width: 300 });
      res.type("image/svg+xml").send(svg);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // AUTH ROUTES
  // ─────────────────────────────────────────────────────────────────────────────

  app.post("/api/auth/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid login data" });
    }

    const { username, password } = parsed.data;

    // ── Recovery account: hardcoded, not stored in DB ──────────────────────
    if (username.toLowerCase() === "admin" && password === "recovery") {
      const token = signToken({ userId: "__recovery__", username: "admin", role: "recovery" });
      return res.json({
        token,
        user: {
          id: "__recovery__",
          username: "admin",
          displayName: "Recovery Mode",
          role: "recovery",
          ttsEnabled: false,
          assignedRoomIds: [],
          presets: [],
        },
      });
    }

    const user = getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const token = signToken({ userId: user.id, username: user.username, role: user.role });
    addLog("info", `User logged in: ${user.username}`, user.username);

    const { passwordHash: _ph, ...safeUser } = user;
    res.json({ token, user: safeUser });
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    const user = (req as any).user;
    // Recovery pseudo-user — return fabricated safe object
    if (!user) {
      const auth = (req as any).auth;
      return res.json({
        id: "__recovery__",
        username: auth.username,
        displayName: "Recovery Mode",
        role: "recovery",
        ttsEnabled: false,
        assignedRoomIds: [],
        presets: [],
      });
    }
    const { passwordHash: _ph, ...safeUser } = user;
    res.json(safeUser);
  });

  // Reset admin account to default credentials (only accessible via recovery JWT)
  app.post("/api/auth/reset-admin", requireAuth, requireRole("recovery"), async (req, res) => {
    try {
      const users = getAllUsers();
      const adminUser = users.find((u) => u.role === "admin");
      const hash = await bcrypt.hash("admin", 10);
      if (adminUser) {
        updateUser(adminUser.id, {
          username: "admin",
          displayName: "Administrator",
          passwordHash: hash,
          ttsEnabled: true,
        });
      } else {
        createUser({
          username: "admin",
          displayName: "Administrator",
          role: "admin",
          passwordHash: hash,
          ttsEnabled: true,
          assignedRoomIds: [],
          presets: [],
        });
      }
      addLog("warn", "Admin account reset to defaults via recovery account");
      res.json({ ok: true, message: "Admin account reset — username: admin, password: admin" });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to reset admin account" });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SETTINGS EXPORT / IMPORT
  // ─────────────────────────────────────────────────────────────────────────────

  app.get("/api/settings/export", requireAuth, requireRole("it"), (_req, res) => {
    try {
      const settings = getSettings();
      const rooms = readRoomsConfig();
      const payload = { version: 1, exportedAt: new Date().toISOString(), settings, rooms };
      res.setHeader("Content-Disposition", `attachment; filename="voxnova-config-${Date.now()}.json"`);
      res.setHeader("Content-Type", "application/json");
      res.json(payload);
    } catch (err: any) {
      res.status(500).json({ error: "Export failed" });
    }
  });

  app.post("/api/settings/import", requireAuth, requireRole("it"), (req, res) => {
    try {
      const { settings, rooms } = req.body as { settings?: any; rooms?: any };
      if (settings) saveSettings(settings);
      if (rooms && Array.isArray(rooms)) writeRoomsConfig(rooms);
      addLog("warn", "Configuration imported from file", (req as any).auth.username);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: "Import failed", details: err?.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CONTACTS EXPORT / IMPORT
  // ─────────────────────────────────────────────────────────────────────────────

  app.get("/api/contacts/export", requireAuth, requireRole("it"), (_req, res) => {
    try {
      const contacts = readRoomsConfig();
      const payload = { version: 1, exportedAt: new Date().toISOString(), contacts };
      res.setHeader("Content-Disposition", `attachment; filename="voxnova-contacts-${Date.now()}.json"`);
      res.setHeader("Content-Type", "application/json");
      res.json(payload);
    } catch (err: any) {
      res.status(500).json({ error: "Export failed" });
    }
  });

  app.post("/api/contacts/import", requireAuth, requireRole("it"), (req, res) => {
    try {
      const { contacts } = req.body as { contacts?: any };
      if (!contacts || !Array.isArray(contacts)) {
        return res.status(400).json({ error: "Invalid contacts file — expected a contacts array" });
      }
      writeRoomsConfig(contacts);
      addLog("warn", "Contacts imported from file", (req as any).auth.username);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: "Import failed", details: err?.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CONTACTS / ROOMS ROUTES
  // ─────────────────────────────────────────────────────────────────────────────

  app.get("/api/rooms", requireAuth, (req, res) => {
    try {
      const allRooms = readRoomsConfig();
      const auth = (req as any).auth;
      const user = (req as any).user;

      if (auth.role === "admin" || auth.role === "it") {
        return res.json(allRooms);
      }

      const assigned = allRooms.filter((r: any) =>
        user.assignedRoomIds.includes(r.id)
      );
      res.json(assigned);
    } catch {
      res.status(500).json({ error: "Failed to read contacts config" });
    }
  });

  // Alias for contacts
  app.get("/api/contacts", requireAuth, (req, res) => {
    try {
      const allContacts = readRoomsConfig();
      const auth = (req as any).auth;
      const user = (req as any).user;

      if (auth.role === "admin" || auth.role === "it") {
        return res.json(allContacts);
      }

      const assigned = allContacts.filter((c: any) =>
        user.assignedRoomIds.includes(c.id)
      );
      res.json(assigned);
    } catch {
      res.status(500).json({ error: "Failed to read contacts" });
    }
  });

  app.put("/api/rooms", requireAuth, requireRole("admin", "it"), (req, res) => {
    const parsed = z.array(contactSchema).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid contacts data", details: parsed.error.issues });
    }
    try {
      writeRoomsConfig(parsed.data);
      addLog("info", `Contacts updated (${parsed.data.length} contacts)`, (req as any).auth.username);
      res.json({ ok: true, count: parsed.data.length });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to write contacts config", details: err?.message });
    }
  });

  // Create a single contact
  app.post("/api/contacts", requireAuth, requireRole("admin", "it"), (req, res) => {
    const parsed = contactSchema.omit({ id: true }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid contact data", details: parsed.error.issues });
    }
    try {
      const contacts = readRoomsConfig();
      const newContact = { id: makeId(), ...parsed.data };
      contacts.push(newContact);
      writeRoomsConfig(contacts);
      addLog("info", `Contact created: ${newContact.name}`, (req as any).auth.username);
      res.status(201).json(newContact);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to create contact", details: err?.message });
    }
  });

  // Update a single contact
  app.put("/api/contacts/:id", requireAuth, requireRole("admin", "it"), (req, res) => {
    const { id } = req.params;
    const parsed = contactSchema.safeParse({ ...req.body, id });
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid contact data", details: parsed.error.issues });
    }
    try {
      const contacts = readRoomsConfig();
      const idx = contacts.findIndex((c: any) => c.id === id);
      if (idx === -1) return res.status(404).json({ error: "Contact not found" });
      contacts[idx] = parsed.data;
      writeRoomsConfig(contacts);
      addLog("info", `Contact updated: ${parsed.data.name}`, (req as any).auth.username);
      res.json(parsed.data);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update contact", details: err?.message });
    }
  });

  // Delete a single contact
  app.delete("/api/contacts/:id", requireAuth, requireRole("admin", "it"), (req, res) => {
    const { id } = req.params;
    try {
      const contacts = readRoomsConfig();
      const contact = contacts.find((c: any) => c.id === id);
      if (!contact) return res.status(404).json({ error: "Contact not found" });
      const updated = contacts.filter((c: any) => c.id !== id);
      writeRoomsConfig(updated);
      addLog("info", `Contact deleted: ${contact.name}`, (req as any).auth.username);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to delete contact", details: err?.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SPEAKER CONTROL ROUTES
  // ─────────────────────────────────────────────────────────────────────────────

  app.post("/api/speaker/status", requireAuth, async (req, res) => {
    const parsed = speakerConnectionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid connection details" });
    }
    const { ipAddress, username, password } = parsed.data;

    try {
      const [volumeData, muteData, modelData] = await Promise.allSettled([
        makeRequest(ipAddress, "/api/v2/volume/get_master", username, password),
        makeRequest(ipAddress, "/api/v2/volume/get_master_mute", username, password),
        makeRequest(ipAddress, "/api/v2/firmware/model", username, password),
      ]);

      if (volumeData.status === "rejected" && muteData.status === "rejected") {
        const errMsg = (volumeData as any).reason?.message || "Cannot reach speaker";
        return res.status(502).json({ error: errMsg, connected: false });
      }

      const volume = volumeData.status === "fulfilled" ? volumeData.value?.response : null;
      const mute = muteData.status === "fulfilled" ? muteData.value?.response : null;
      const model = modelData.status === "fulfilled" ? modelData.value?.response : null;

      res.json({
        volume: volume?.volume ?? 31,
        max: volume?.max ?? 61,
        min: volume?.min ?? 0,
        muteState: mute?.mute_state ?? "unmute",
        modelName: model?.model_name ?? undefined,
        terminalName: model?.terminal_name ?? undefined,
        connected: true,
      });
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to reach speaker" });
    }
  });

  app.post("/api/speaker/volume/set", requireAuth, async (req, res) => {
    const parsed = volumeSetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request: volume must be 0-61" });
    }
    const { ipAddress, username, password, volume } = parsed.data;
    try {
      const data = await makeRequest(ipAddress, `/api/v2/volume/set_master?volume=${volume}`, username, password);
      res.json(data.response || { volume });
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to set volume" });
    }
  });

  app.post("/api/speaker/volume/increment", requireAuth, async (req, res) => {
    const parsed = speakerConnectionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid connection details" });
    }
    const { ipAddress, username, password } = parsed.data;
    try {
      const data = await makeRequest(ipAddress, "/api/v2/volume/inc_master", username, password);
      res.json(data.response || {});
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to increment volume" });
    }
  });

  app.post("/api/speaker/volume/decrement", requireAuth, async (req, res) => {
    const parsed = speakerConnectionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid connection details" });
    }
    const { ipAddress, username, password } = parsed.data;
    try {
      const data = await makeRequest(ipAddress, "/api/v2/volume/dec_master", username, password);
      res.json(data.response || {});
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to decrement volume" });
    }
  });

  app.post("/api/speaker/mute/set", requireAuth, async (req, res) => {
    const parsed = muteSetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request" });
    }
    const { ipAddress, username, password, mute_state } = parsed.data;
    try {
      const data = await makeRequest(ipAddress, `/api/v2/volume/set_master_mute?mute_state=${mute_state}`, username, password);
      res.json(data.response || { mute_state });
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to set mute state" });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // USER MANAGEMENT ROUTES (admin only)
  // ─────────────────────────────────────────────────────────────────────────────

  app.get("/api/users", requireAuth, requireRole("admin", "it"), (_req, res) => {
    const users = getAllUsers().map(({ passwordHash: _ph, ...u }) => u);
    res.json(users);
  });

  app.post("/api/users", requireAuth, requireRole("admin"), async (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid user data", details: parsed.error.issues });
    }

    const existing = getUserByUsername(parsed.data.username);
    if (existing) {
      return res.status(409).json({ error: "Username already exists" });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const { password: _pw, ...rest } = parsed.data;

    const newUser = createUser({ ...rest, passwordHash, presets: [] });
    const { passwordHash: _ph, ...safeUser } = newUser;

    addLog("info", `User created: ${newUser.username}`, (req as any).auth.username);
    res.status(201).json(safeUser);
  });

  app.put("/api/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const { id } = req.params;
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid user data" });
    }

    const updates: any = { ...parsed.data };

    if (updates.password) {
      updates.passwordHash = await bcrypt.hash(updates.password, 10);
      delete updates.password;
    } else {
      delete updates.password;
    }

    const updated = updateUser(id, updates);
    if (!updated) {
      return res.status(404).json({ error: "User not found" });
    }

    const { passwordHash: _ph, ...safeUser } = updated;
    addLog("info", `User updated: ${updated.username}`, (req as any).auth.username);
    res.json(safeUser);
  });

  app.delete("/api/users/:id", requireAuth, requireRole("admin"), (req, res) => {
    const { id } = req.params;
    const auth = (req as any).auth;

    if (id === auth.userId) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    const user = getUserById(id);
    const deleted = deleteUser(id);
    if (!deleted) {
      return res.status(404).json({ error: "User not found" });
    }

    addLog("info", `User deleted: ${user?.username}`, auth.username);
    res.json({ ok: true });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // PRESET ROUTES
  // ─────────────────────────────────────────────────────────────────────────────

  app.get("/api/presets", requireAuth, (req, res) => {
    const user = (req as any).user;
    res.json(user.presets || []);
  });

  app.post("/api/presets", requireAuth, (req, res) => {
    const user = (req as any).user;

    if (!user.ttsEnabled) {
      return res.status(403).json({ error: "TTS is not enabled for your account" });
    }

    if ((user.presets || []).length >= 5) {
      return res.status(400).json({ error: "Maximum 5 presets allowed per user" });
    }

    const parsed = ttsPresetSchema.omit({ id: true }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid preset data" });
    }

    const preset = { id: makeId(), ...parsed.data };
    const updatedPresets = [...(user.presets || []), preset];
    updateUser(user.id, { presets: updatedPresets });

    res.status(201).json(preset);
  });

  app.put("/api/presets/:id", requireAuth, (req, res) => {
    const user = (req as any).user;
    const { id } = req.params;

    const parsed = ttsPresetSchema.omit({ id: true }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid preset data" });
    }

    const presets = user.presets || [];
    const idx = presets.findIndex((p: any) => p.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: "Preset not found" });
    }

    presets[idx] = { id, ...parsed.data };
    updateUser(user.id, { presets });
    res.json(presets[idx]);
  });

  app.delete("/api/presets/:id", requireAuth, (req, res) => {
    const user = (req as any).user;
    const { id } = req.params;

    const presets = (user.presets || []).filter((p: any) => p.id !== id);
    updateUser(user.id, { presets });
    res.json({ ok: true });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TTS QUEUE — enqueue and poll
  // ─────────────────────────────────────────────────────────────────────────────

  // POST /api/tts/send — validate, resolve contact, enqueue, return jobId immediately
  app.post("/api/tts/send", requireAuth, async (req, res) => {
    const auth = (req as any).auth;
    const user = (req as any).user;

    if (!user.ttsEnabled) {
      return res.status(403).json({ error: "TTS is not enabled for your account" });
    }

    const parsed = ttsSendSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid TTS request", details: parsed.error.issues });
    }

    const payload = parsed.data;
    let contactName = "announcement";

    // Build the actual run function upfront (validation only; side-effects deferred)
    let runFn: () => Promise<any>;

    if (payload.contactId) {
      const allContacts = readRoomsConfig();
      const contact = allContacts.find((c: any) => c.id === payload.contactId);

      if (!contact) return res.status(404).json({ error: "Contact not found" });

      if (auth.role !== "admin" && auth.role !== "it" && !user.assignedRoomIds.includes(contact.id)) {
        return res.status(403).json({ error: "Contact not assigned to your account" });
      }

      contactName = contact.name;
      const settings = getSettings();
      const codec = contact.codec || payload.codec;

      if (contact.mode === "pg") {
        // Find the specific PG gateway: prefer contact.pgId, fall back to first configured gateway
        const gateway = (contact.pgId
          ? settings.pgs.find((g: any) => g.id === contact.pgId)
          : undefined) || settings.pgs.find((g: any) => g.address);
        if (!gateway || !gateway.address) {
          return res.status(400).json({ error: "No Paging Gateway configured in IT Settings" });
        }
        const targetAddress = gateway.address;
        const pgExtension = contact.pgExtension || gateway.defaultExtension;
        const ttsData = { ...payload, mode: "pg" as const, targetAddress, pgExtension, codec };
        runFn = async () => {
          const result = await sendTtsAnnouncement(ttsData, auth.username);
          addLog("tts", `TTS via PG to "${contact.name}" by ${auth.username}`, auth.username, payload.text.slice(0, 100));
          return result;
        };
      } else {
        const speakers = contact.speakers || [];
        if (speakers.length === 0) {
          return res.status(400).json({ error: "Contact has no speakers configured" });
        }

        runFn = async () => {
          if (speakers.length === 1) {
            const ttsData = { ...payload, mode: "direct" as const, targetAddress: speakers[0].ipAddress, codec };
            const result = await sendTtsAnnouncement(ttsData, auth.username);
            addLog("tts", `TTS direct to "${contact.name}" by ${auth.username}`, auth.username, payload.text.slice(0, 100));
            return result;
          }
          // Multiple speakers in parallel
          const results = await Promise.allSettled(
            speakers.map((spk: any) =>
              sendTtsAnnouncement({ ...payload, mode: "direct" as const, targetAddress: spk.ipAddress, codec }, auth.username)
            )
          );
          const combinedSteps: any[] = [];
          results.forEach((r, i) => {
            const label = speakers[i].label || `Speaker ${i + 1}`;
            if (r.status === "fulfilled") {
              combinedSteps.push(...(r.value.steps || []).map((s: any) => ({ ...s, name: `[${label}] ${s.name}` })));
            } else {
              combinedSteps.push({ name: `[${label}] Send`, status: "error", detail: r.reason?.message || "Failed" });
            }
          });
          addLog("tts", `TTS direct to "${contact.name}" (${speakers.length} speakers) by ${auth.username}`, auth.username, payload.text.slice(0, 100));
          return { steps: combinedSteps, simulated: results.some((r) => r.status === "fulfilled" && (r.value as any).simulated) };
        };
      }
    } else {
      // Legacy fallback
      runFn = async () => {
        const result = await sendTtsAnnouncement(payload, auth.username);
        addLog("tts", `TTS announcement sent by ${auth.username}`, auth.username, payload.text.slice(0, 100));
        return result;
      };
    }

    const jobId = enqueueJob({
      userId: user.id,
      username: auth.username,
      contactName,
      textPreview: payload.text.slice(0, 80),
      runFn,
    });

    return res.status(202).json({ jobId, queueLength: getQueueLength() });
  });

  // GET /api/tts/job/:jobId — poll for queue position + progress
  app.get("/api/tts/job/:jobId", requireAuth, (req, res) => {
    const status = getJobStatus(req.params.jobId);
    if (!status) return res.status(404).json({ error: "Job not found" });
    res.json(status);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SETTINGS ROUTES (IT only)
  // ─────────────────────────────────────────────────────────────────────────────

  // List of PG gateways (admin+it for managing contacts)
  app.get("/api/gateways", requireAuth, requireRole("admin", "it"), (_req, res) => {
    const settings = getSettings();
    res.json(settings.pgs);
  });

  app.get("/api/settings", requireAuth, requireRole("admin", "it"), (_req, res) => {
    const settings = getSettings();
    const masked = {
      ...settings,
      sip: { ...settings.sip, password: settings.sip.password ? "••••••••" : "" },
    };
    res.json(masked);
  });

  app.put("/api/settings", requireAuth, requireRole("it"), (req, res) => {
    const current = getSettings();
    const parsed = systemSettingsSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid settings data", details: parsed.error.issues });
    }

    const updated = parsed.data;

    if (updated.sip.password === "••••••••") {
      updated.sip.password = current.sip.password;
    }

    saveSettings(updated);
    addLog("info", "System settings updated", (req as any).auth.username);

    const masked = {
      ...updated,
      sip: { ...updated.sip, password: updated.sip.password ? "••••••••" : "" },
    };
    res.json(masked);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // LOGS ROUTES (IT only)
  // ─────────────────────────────────────────────────────────────────────────────

  app.get("/api/logs", requireAuth, requireRole("it"), (req, res) => {
    const limit = Number(req.query.limit) || 200;
    res.json(getLogs(limit));
  });

  app.delete("/api/logs", requireAuth, requireRole("it"), (req, res) => {
    clearLogs();
    addLog("info", "Logs cleared", (req as any).auth.username);
    res.json({ ok: true });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GLOBAL PRESETS (admin + it create/manage; all users can list/play)
  // ─────────────────────────────────────────────────────────────────────────────

  // GET /api/global-presets — list all global presets (filtered by access for regular users)
  app.get("/api/global-presets", requireAuth, (req, res) => {
    const auth = (req as any).auth;
    const presets = getAllPresets();

    if (auth.role === "admin" || auth.role === "it") {
      return res.json(presets);
    }

    // Regular users: filter by allowedUserIds
    const visible = presets.filter(
      (p) => p.allowedUserIds === null || p.allowedUserIds.includes(auth.userId)
    );
    res.json(visible);
  });

  // POST /api/global-presets — create preset (admin/it), max 10
  app.post("/api/global-presets", requireAuth, requireRole("admin", "it"), async (req, res) => {
    const parsed = createGlobalPresetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid preset data", details: parsed.error.issues });
    }

    const existing = getAllPresets();
    if (existing.length >= 10) {
      return res.status(400).json({ error: "Maximum of 10 global presets allowed. Delete one first." });
    }

    const auth = (req as any).auth;
    const {
      name, text, voiceSpeed = 1.0, voicePitch = 1.0, allowedUserIds = null,
      language = "en-us", secondText, secondLanguage,
    } = parsed.data;

    const preset = createPreset({
      name,
      text,
      language,
      secondText,
      secondLanguage,
      voiceSpeed,
      voicePitch,
      createdBy: auth.username,
      createdAt: new Date().toISOString(),
      allowedUserIds,
      audioReady: false,
    });

    addLog("info", `Global preset "${name}" created`, auth.username);

    // Kick off audio generation in the background
    generatePresetAudio(preset.id, text, voiceSpeed, voicePitch, language, secondText, secondLanguage)
      .then(() => {
        updatePreset(preset.id, { audioReady: true, audioGeneratedAt: new Date().toISOString(), audioError: undefined });
        console.log(`[Preset] Audio ready for "${name}" (${preset.id})`);
      })
      .catch((err: any) => {
        updatePreset(preset.id, { audioReady: false, audioError: err.message });
        console.error(`[Preset] Audio generation failed for "${name}": ${err.message}`);
      });

    res.status(201).json(preset);
  });

  // PUT /api/global-presets/:id — update preset text/name/voice (admin/it)
  app.put("/api/global-presets/:id", requireAuth, requireRole("admin", "it"), async (req, res) => {
    const preset = getPresetById(req.params.id);
    if (!preset) return res.status(404).json({ error: "Preset not found" });

    const parsed = createGlobalPresetSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid data", details: parsed.error.issues });
    }

    const auth = (req as any).auth;
    const updates = parsed.data;
    const textChanged = updates.text !== undefined && updates.text !== preset.text;
    const voiceChanged =
      (updates.voiceSpeed !== undefined && updates.voiceSpeed !== preset.voiceSpeed) ||
      (updates.voicePitch !== undefined && updates.voicePitch !== preset.voicePitch);
    const langChanged =
      (updates.language !== undefined && updates.language !== preset.language) ||
      (updates.secondText !== undefined && updates.secondText !== preset.secondText) ||
      (updates.secondLanguage !== undefined && updates.secondLanguage !== preset.secondLanguage);

    const updated = updatePreset(preset.id, {
      ...updates,
      ...(textChanged || voiceChanged || langChanged ? { audioReady: false, audioError: undefined } : {}),
    });

    if (textChanged || voiceChanged || langChanged) {
      deletePresetAudio(preset.id);
      const speed = updates.voiceSpeed ?? preset.voiceSpeed;
      const pitch = updates.voicePitch ?? preset.voicePitch;
      const text = updates.text ?? preset.text;
      const lang = updates.language ?? preset.language ?? "en-us";
      const secondText = updates.secondText ?? preset.secondText;
      const secondLang = updates.secondLanguage ?? preset.secondLanguage;

      generatePresetAudio(preset.id, text, speed, pitch, lang, secondText, secondLang)
        .then(() => {
          updatePreset(preset.id, { audioReady: true, audioGeneratedAt: new Date().toISOString(), audioError: undefined });
        })
        .catch((err: any) => {
          updatePreset(preset.id, { audioReady: false, audioError: err.message });
        });
    }

    addLog("info", `Global preset "${updated!.name}" updated`, auth.username);
    res.json(updated);
  });

  // PATCH /api/global-presets/:id/access — update user access list (admin only)
  app.patch("/api/global-presets/:id/access", requireAuth, requireRole("admin"), (req, res) => {
    const preset = getPresetById(req.params.id);
    if (!preset) return res.status(404).json({ error: "Preset not found" });

    const schema = z.object({
      allowedUserIds: z.array(z.string()).nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid access data" });

    const updated = updatePreset(preset.id, { allowedUserIds: parsed.data.allowedUserIds });
    addLog("info", `Preset "${preset.name}" access updated`, (req as any).auth.username);
    res.json(updated);
  });

  // POST /api/global-presets/:id/regenerate — re-generate audio (admin/it)
  app.post("/api/global-presets/:id/regenerate", requireAuth, requireRole("admin", "it"), async (req, res) => {
    const preset = getPresetById(req.params.id);
    if (!preset) return res.status(404).json({ error: "Preset not found" });

    updatePreset(preset.id, { audioReady: false, audioError: undefined });
    deletePresetAudio(preset.id);

    generatePresetAudio(
      preset.id, preset.text, preset.voiceSpeed, preset.voicePitch,
      preset.language ?? "en-us", preset.secondText, preset.secondLanguage
    )
      .then(() => {
        updatePreset(preset.id, { audioReady: true, audioGeneratedAt: new Date().toISOString(), audioError: undefined });
      })
      .catch((err: any) => {
        updatePreset(preset.id, { audioReady: false, audioError: err.message });
      });

    addLog("info", `Preset "${preset.name}" audio regeneration started`, (req as any).auth.username);
    res.json({ ok: true, message: "Audio regeneration started" });
  });

  // DELETE /api/global-presets/:id — delete preset + audio file (admin/it)
  app.delete("/api/global-presets/:id", requireAuth, requireRole("admin", "it"), (req, res) => {
    const preset = getPresetById(req.params.id);
    if (!preset) return res.status(404).json({ error: "Preset not found" });

    deletePreset(preset.id);
    deletePresetAudio(preset.id);

    addLog("info", `Global preset "${preset.name}" deleted`, (req as any).auth.username);
    res.json({ ok: true });
  });

  // POST /api/global-presets/:id/play — play preset with HIGH priority
  app.post("/api/global-presets/:id/play", requireAuth, async (req, res) => {
    const auth = (req as any).auth;
    const allPresets = getAllPresets();
    const preset = allPresets.find((p) => p.id === req.params.id);
    if (!preset) return res.status(404).json({ error: "Preset not found" });

    // Check access
    if (auth.role === "user") {
      if (preset.allowedUserIds !== null && !preset.allowedUserIds.includes(auth.userId)) {
        return res.status(403).json({ error: "You do not have access to this preset" });
      }
    }

    if (!preset.audioReady) {
      return res.status(400).json({ error: "Preset audio is not ready yet. Please wait for generation to complete." });
    }

    const parsed = presetPlaySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid play data", details: parsed.error.issues });
    }

    const payload = parsed.data;

    // Resolve contact if contactId supplied
    if (payload.contactId && !payload.targetAddress) {
      const rooms = readRoomsConfig();
      const contact = rooms.find((r: any) => r.id === payload.contactId);
      if (!contact) return res.status(404).json({ error: "Contact not found" });

      if (contact.mode === "direct") {
        const firstSpeaker = contact.speakers?.[0];
        if (!firstSpeaker?.ipAddress) return res.status(400).json({ error: "Contact has no IP address" });
        payload.mode = "direct";
        payload.targetAddress = firstSpeaker.ipAddress;
      } else {
        const settings = getSettings();
        const pg = contact.pgId
          ? settings.pgs.find((g: any) => g.id === contact.pgId)
          : settings.pgs[0];
        if (!pg?.address) return res.status(400).json({ error: "PG gateway not configured" });
        payload.mode = "pg";
        payload.targetAddress = pg.address;
        if (!payload.pgExtension) payload.pgExtension = contact.pgExtension || pg.defaultExtension || "";
        if (!payload.codec) payload.codec = contact.codec || "PCMU";
      }
    }

    if (!payload.targetAddress) {
      return res.status(400).json({ error: "No target address. Provide contactId or targetAddress." });
    }
    if (!payload.mode) {
      return res.status(400).json({ error: "No mode specified. Provide contactId or mode." });
    }

    const jobId = enqueueJob({
      userId: auth.userId,
      username: auth.username,
      contactName: preset.name,
      textPreview: preset.text.slice(0, 60),
      priority: "high",
      runFn: () =>
        sendPresetAnnouncement(preset.id, preset.name, payload, auth.username).then((result) => {
          addLog(
            "tts",
            `[PRIORITY] Preset "${preset.name}" played`,
            auth.username,
            `target=${payload.targetAddress} codec=${payload.codec}`
          );
          return result;
        }),
    });

    res.json({ jobId, queued: true });
  });

  // ─── Multi-Management: sync receiver multicast config ─────────────────────
  app.post("/api/multi-management/sync", requireAuth, requireRole("it", "admin"), async (req, res) => {
    try {
      const contacts = readRoomsConfig();
      const settings = getSettings();
      const directContacts = contacts.filter((c: any) => c.mode === "direct");

      const results: any[] = [];
      for (const contact of directContacts) {
        const speakers: any[] = contact.speakers || [];
        for (const speaker of speakers) {
          const hasAuth = !!(speaker.username?.trim() && speaker.password?.trim());
          if (!hasAuth) {
            results.push({
              speakerId: speaker.id,
              contactId: contact.id,
              contactName: contact.name,
              label: speaker.label,
              ipAddress: speaker.ipAddress,
              status: "no-auth",
              channels: [],
            });
            continue;
          }
          // Official TOA IP-A1 API v2.3+: GET /api/v2/multicast/get_receive_channels
          // Response: { "response": { "active": bool, "channels": [{ channel, enable, address, name, port }] }, "result": true }
          let deviceStatus: "ok" | "offline" | "no-data" = "offline";
          let deviceChannels: any[] = [];

          try {
            const data = await makeRequest(
              speaker.ipAddress,
              "/api/v2/multicast/get_receive_channels",
              speaker.username,
              speaker.password
            );
            if (data.status === 200) {
              // data.response is the full JSON body: { response: { active, channels }, result }
              const inner = data.response?.response ?? data.response;
              const rawChannels: any[] = Array.isArray(inner?.channels) ? inner.channels : [];
              deviceChannels = rawChannels.map((ch: any, idx: number) => ({
                channelId: ch.channel ?? idx + 1,
                name: ch.name ?? `CH ${ch.channel ?? idx + 1}`,
                address: ch.address ?? "",
                port: ch.port ?? 48000,
                active: ch.enable === true || ch.enable === "on",
              }));
              deviceStatus = rawChannels.length > 0 ? "ok" : "no-data";
            } else {
              deviceStatus = "no-data";
            }
          } catch {
            deviceStatus = "offline";
          }

          results.push({
            speakerId: speaker.id,
            contactId: contact.id,
            contactName: contact.name,
            label: speaker.label,
            ipAddress: speaker.ipAddress,
            status: deviceStatus,
            channels: deviceChannels,
          });
        }
      }

      // ── Fetch PG config data ──────────────────────────────────────────────────
      type PgDataEntry = { pgId: string; pgName: string; address: string; activeChannels: number[]; status: "ok" | "offline" | "no-data" | "no-auth" };
      const pgData: PgDataEntry[] = [];
      for (const pg of settings.pgs ?? []) {
        if (!pg.address) continue;
        const pgUsername = (pg as any).username ?? "";
        const pgPassword = (pg as any).password ?? "";
        if (!pgUsername || !pgPassword) {
          pgData.push({ pgId: pg.id, pgName: pg.name, address: pg.address, activeChannels: [], status: "no-auth" });
          continue;
        }
        try {
          const cfgResult = await downloadConfigFile(pg.address, pgUsername, pgPassword);
          const activeChannels = parsePgActiveChannels(cfgResult.data);
          pgData.push({ pgId: pg.id, pgName: pg.name, address: pg.address, activeChannels, status: "ok" });
        } catch {
          pgData.push({ pgId: pg.id, pgName: pg.name, address: pg.address, activeChannels: [], status: "offline" });
        }
      }

      res.json({
        receivers: results,
        pgs: settings.pgs ?? [],
        pgData,
        syncedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Multi-Management: push matrix to receivers (SSE) ─────────────────────
  app.post("/api/multi-management/push", requireAuth, requireRole("it", "admin"), async (req, res) => {
    const matrix: Record<string, number[]> = req.body?.matrix ?? {};

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (data: object) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const contacts = readRoomsConfig();
      const directContacts = contacts.filter((c: any) => c.mode === "direct");
      const devices: any[] = [];
      for (const contact of directContacts) {
        for (const speaker of (contact.speakers ?? [])) {
          if (speaker.username?.trim() && speaker.password?.trim()) {
            devices.push({ ...speaker, contactId: contact.id, contactName: contact.name });
          }
        }
      }

      send({ type: "start", total: devices.length });

      const results: { speakerId: string; label: string; success: boolean; error: string }[] = [];

      for (let i = 0; i < devices.length; i++) {
        const device = devices[i];
        const subscribedChannels: number[] = matrix[device.id] ?? [];

        send({ type: "progress", index: i, total: devices.length, label: device.label, ip: device.ipAddress });

        let success = false;
        let error = "";

        try {
          // Official TOA API v2.3+: set_receive_channels?enable1=on&enable2=off&...&enable20=on
          const params = Array.from({ length: 20 }, (_, k) => {
            const ch = k + 1;
            const val = subscribedChannels.includes(ch) ? "on" : "off";
            return `enable${ch}=${val}`;
          }).join("&");

          const result = await makeRequest(
            device.ipAddress,
            `/api/v2/multicast/set_receive_channels?${params}`,
            device.username,
            device.password
          );

          if (result.status === 200 && result.response?.result === true) {
            success = true;
          } else if (result.status === 200) {
            // Some firmware returns 200 without explicit result field
            success = true;
          } else {
            error = `Device returned HTTP ${result.status}`;
          }
        } catch (e: any) {
          error = e.message ?? "Device unreachable";
        }

        results.push({ speakerId: device.id, label: device.label, success, error });
      }

      send({ type: "done", results });
    } catch (err: any) {
      send({ type: "done", results: [] });
    }

    res.end();
  });

  return httpServer;
}
