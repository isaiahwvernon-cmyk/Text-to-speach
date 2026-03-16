import type { Express } from "express";
import { createServer, type Server } from "http";
import { speakerConnectionSchema, roomSchema } from "@shared/schema";
import { z } from "zod";
import http from "http";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const ROOMS_CONFIG_PATH = path.resolve(process.cwd(), "rooms.json");
const ADMIN_PASSWORD = "IPA1";

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

    // Migrate old flat-format rooms (ipAddress/username/password at root level)
    // to the new speakers[] format
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

    // Write back if migration happened
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
  path: string,
  username: string,
  password: string,
  timeout: number = 8000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: ipAddress,
      port: 80,
      path,
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
        const authHeader = createDigestHeader("GET", path, username, password, challenge, 1);

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
  app.get("/api/info", (_req, res) => {
    res.json({
      lanIP,
      port,
      url: `http://${lanIP}:${port}`,
    });
  });

  app.get("/api/rooms", (_req, res) => {
    try {
      const rooms = readRoomsConfig();
      res.json(rooms);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to read rooms config" });
    }
  });

  app.put("/api/rooms", (req, res) => {
    const adminPw = (req.headers["x-admin-password"] as string) || (req.query.pw as string);
    console.log("[PUT /api/rooms] admin pw present:", !!adminPw, "body type:", typeof req.body, "body:", JSON.stringify(req.body));
    if (adminPw !== ADMIN_PASSWORD) {
      console.log("[PUT /api/rooms] Unauthorized — password mismatch, got:", JSON.stringify(adminPw));
      return res.status(401).json({ error: "Unauthorized" });
    }
    const parsed = z.array(roomSchema).safeParse(req.body);
    if (!parsed.success) {
      console.log("[PUT /api/rooms] Validation failed:", JSON.stringify(parsed.error));
      return res.status(400).json({ error: "Invalid rooms data", details: parsed.error.issues });
    }
    try {
      writeRoomsConfig(parsed.data);
      console.log("[PUT /api/rooms] Saved", parsed.data.length, "rooms to", ROOMS_CONFIG_PATH);
      res.json({ ok: true, count: parsed.data.length });
    } catch (err: any) {
      console.error("[PUT /api/rooms] Write failed:", err?.message);
      res.status(500).json({ error: "Failed to write rooms config", details: err?.message });
    }
  });

  app.post("/api/speaker/status", async (req, res) => {
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
        const errMsg = volumeData.reason?.message || "Cannot reach speaker";
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

  app.post("/api/speaker/volume/set", async (req, res) => {
    const parsed = volumeSetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request: volume must be 0-61" });
    }
    const { ipAddress, username, password, volume } = parsed.data;

    try {
      const data = await makeRequest(
        ipAddress,
        `/api/v2/volume/set_master?volume=${volume}`,
        username,
        password
      );
      res.json(data.response || { volume });
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to set volume" });
    }
  });

  app.post("/api/speaker/volume/increment", async (req, res) => {
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

  app.post("/api/speaker/volume/decrement", async (req, res) => {
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

  app.post("/api/speaker/mute/set", async (req, res) => {
    const parsed = muteSetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request: mute_state must be 'mute' or 'unmute'" });
    }
    const { ipAddress, username, password, mute_state } = parsed.data;

    try {
      const data = await makeRequest(
        ipAddress,
        `/api/v2/volume/set_master_mute?mute_state=${mute_state}`,
        username,
        password
      );
      res.json(data.response || { mute_state });
    } catch (err: any) {
      res.status(502).json({ error: err.message || "Failed to set mute state" });
    }
  });

  return httpServer;
}
