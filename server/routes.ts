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
} from "./db.js";
import { signToken, requireAuth, requireRole } from "./auth.js";
import { sendTtsAnnouncement, getTtsStatus } from "./tts-engine.js";
import { enqueueJob, getJobStatus, getQueueLength } from "./tts-queue.js";

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

  return httpServer;
}
