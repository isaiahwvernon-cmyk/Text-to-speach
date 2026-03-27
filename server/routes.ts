import type { Express } from "express";
import { createServer, type Server } from "http";
import {
  speakerConnectionSchema,
  roomSchema,
  loginSchema,
  createUserSchema,
  updateUserSchema,
  systemSettingsSchema,
  ttsSendSchema,
  ttsPresetSchema,
} from "@shared/schema";
import { z } from "zod";
import http from "http";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
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
      if (r.ipAddress && !r.speakers) {
        return {
          id: r.id,
          name: r.name,
          syncMode: true,
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
      return r;
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

function createDigestHeader(
  method: string,
  uri: string,
  username: string,
  password: string,
  challenge: Record<string, string>,
  nc: number
): string {
  const realm = challenge.realm || "";
  const nonce = challenge.nonce || "";
  const qop = challenge.qop || "";
  const opaque = challenge.opaque || "";
  const cnonce = crypto.randomBytes(8).toString("hex");
  const ncStr = nc.toString(16).padStart(8, "0");

  const ha1 = crypto.createHash("md5").update(`${username}:${realm}:${password}`).digest("hex");
  const ha2 = crypto.createHash("md5").update(`${method}:${uri}`).digest("hex");

  let response: string;
  if (qop) {
    response = crypto
      .createHash("md5")
      .update(`${ha1}:${nonce}:${ncStr}:${cnonce}:${qop.split(",")[0].trim()}:${ha2}`)
      .digest("hex");
  } else {
    response = crypto
      .createHash("md5")
      .update(`${ha1}:${nonce}:${ha2}`)
      .digest("hex");
  }

  let header = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
  if (qop) {
    header += `, qop=${qop.split(",")[0].trim()}, nc=${ncStr}, cnonce="${cnonce}"`;
  }
  if (opaque) {
    header += `, opaque="${opaque}"`;
  }
  return header;
}

function makeRequest(
  ipAddress: string,
  reqPath: string,
  username: string,
  password: string,
  timeout: number = 8000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: ipAddress,
      port: 80,
      path: reqPath,
      method: "GET",
      timeout,
    };

    const req = http.request(options, (res) => {
      if (res.statusCode === 401) {
        const wwwAuth = res.headers["www-authenticate"];
        if (!wwwAuth) {
          reject(new Error("Authentication failed: no challenge received"));
          return;
        }

        const challenge = parseDigestChallenge(wwwAuth);
        const authHeader = createDigestHeader("GET", reqPath, username, password, challenge, 1);

        const authReq = http.request(
          { ...options, headers: { Authorization: authHeader } },
          (authRes) => {
            let body = "";
            authRes.on("data", (chunk) => (body += chunk));
            authRes.on("end", () => {
              if (authRes.statusCode === 200) {
                try {
                  resolve(JSON.parse(body));
                } catch {
                  resolve(body);
                }
              } else if (authRes.statusCode === 401) {
                reject(new Error("Invalid username or password"));
              } else {
                reject(new Error(`Speaker returned HTTP ${authRes.statusCode}`));
              }
            });
          }
        );
        authReq.on("error", (err) => reject(new Error(`Connection failed: ${err.message}`)));
        authReq.on("timeout", () => {
          authReq.destroy();
          reject(new Error("Request timed out"));
        });
        authReq.end();
      } else if (res.statusCode === 200) {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(body);
          }
        });
      } else {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          reject(new Error(`Speaker returned HTTP ${res.statusCode}`));
        });
      }
    });

    req.on("error", (err) => reject(new Error(`Connection failed: ${err.message}`)));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Cannot reach speaker — check the IP address and make sure this server is on the same network"));
    });
    req.end();
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
  lanIP: string,
  port: number
): Promise<Server> {
  // ── Server info ─────────────────────────────────────────────────────────────
  app.get("/api/info", (_req, res) => {
    res.json({ lanIP, port, url: `http://${lanIP}:${port}` });
  });

  // ── System status ────────────────────────────────────────────────────────────
  app.get("/api/system/status", (_req, res) => {
    const tts = getTtsStatus();
    const settings = getSettings();
    const sipConfigured = !!(settings.sip.serverAddress && settings.sip.username);
    const pgConfigured = !!settings.pg.address;

    res.json({
      server: "ok",
      tts: tts.status,
      ttsMessage: tts.message,
      sip: sipConfigured ? "ok" : "unconfigured",
      pg: pgConfigured ? "ok" : "unconfigured",
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // AUTH ROUTES
  // ─────────────────────────────────────────────────────────────────────────────

  app.post("/api/auth/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const { username, password } = parsed.data;
    const user = getUserByUsername(username);

    if (!user) {
      addLog("warn", `Failed login attempt for unknown user: ${username}`);
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      addLog("warn", `Failed login attempt for user: ${username}`);
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const token = signToken({ userId: user.id, username: user.username, role: user.role });
    addLog("info", `User logged in: ${username}`, username);

    const { passwordHash: _ph, ...safeUser } = user;
    res.json({ token, user: safeUser });
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    const user = (req as any).user;
    const { passwordHash: _ph, ...safeUser } = user;
    res.json(safeUser);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // ROOM ROUTES
  // ─────────────────────────────────────────────────────────────────────────────

  app.get("/api/rooms", requireAuth, (req, res) => {
    try {
      const allRooms = readRoomsConfig();
      const auth = (req as any).auth;
      const user = (req as any).user;

      // Admin/IT see all rooms; normal users see only assigned rooms
      if (auth.role === "admin" || auth.role === "it") {
        return res.json(allRooms);
      }

      const assigned = allRooms.filter((r: any) =>
        user.assignedRoomIds.includes(r.id)
      );
      res.json(assigned);
    } catch {
      res.status(500).json({ error: "Failed to read rooms config" });
    }
  });

  app.put("/api/rooms", requireAuth, requireRole("admin", "it"), (req, res) => {
    const parsed = z.array(roomSchema).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid rooms data", details: parsed.error.issues });
    }
    try {
      writeRoomsConfig(parsed.data);
      addLog("info", `Rooms config updated (${parsed.data.length} rooms)`, (req as any).auth.username);
      res.json({ ok: true, count: parsed.data.length });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to write rooms config", details: err?.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SPEAKER CONTROL ROUTES (all require auth now)
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
  // TTS SEND ROUTE
  // ─────────────────────────────────────────────────────────────────────────────

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

    try {
      const result = await sendTtsAnnouncement(parsed.data, auth.username);
      addLog("tts", `TTS announcement sent by ${auth.username}`, auth.username, parsed.data.text.slice(0, 100));
      res.json(result);
    } catch (err: any) {
      addLog("error", `TTS announcement failed: ${err.message}`, auth.username);
      res.status(500).json({ error: err.message || "TTS announcement failed" });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SETTINGS ROUTES (IT only)
  // ─────────────────────────────────────────────────────────────────────────────

  app.get("/api/settings", requireAuth, requireRole("admin", "it"), (_req, res) => {
    const settings = getSettings();
    // Mask SIP password in response for security
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

    // Preserve masked SIP password if not changed
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
