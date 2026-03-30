import { z } from "zod";

// ─── Speaker / Room (existing) ────────────────────────────────────────────────
export const speakerConnectionSchema = z.object({
  ipAddress: z.string().min(1, "IP address is required"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});
export type SpeakerConnection = z.infer<typeof speakerConnectionSchema>;

export const speakerSchema = z.object({
  id: z.string(),
  label: z.string(),
  ipAddress: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
});
export type Speaker = z.infer<typeof speakerSchema>;

// ─── Contact (unified paging target + volume control group) ──────────────────
export const contactSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  mode: z.enum(["direct", "pg"]).default("direct"),
  speakers: z.array(speakerSchema).default([]),
  pgExtension: z.string().default(""),
  codec: z.enum(["PCMU", "PCMA", "G722"]).optional(),
  syncMode: z.boolean().default(true),
});
export type Contact = z.infer<typeof contactSchema>;

// Keep Room as alias for backward compatibility
export const roomSchema = contactSchema;
export type Room = Contact;

export const volumeResponseSchema = z.object({
  volume: z.number(),
  max: z.number().optional(),
  min: z.number().optional(),
});
export type VolumeResponse = z.infer<typeof volumeResponseSchema>;

export const muteResponseSchema = z.object({
  mute_state: z.enum(["mute", "unmute"]),
});
export type MuteResponse = z.infer<typeof muteResponseSchema>;

export const speakerStatusSchema = z.object({
  volume: z.number(),
  max: z.number(),
  min: z.number(),
  muteState: z.enum(["mute", "unmute"]),
  modelName: z.string().optional(),
  terminalName: z.string().optional(),
  connected: z.boolean(),
});
export type SpeakerStatus = z.infer<typeof speakerStatusSchema>;

// ─── Auth / Users ─────────────────────────────────────────────────────────────
export const userRoleSchema = z.enum(["user", "admin", "it"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const ttsPresetSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  text: z.string().min(1),
});
export type TtsPreset = z.infer<typeof ttsPresetSchema>;

export const userSchema = z.object({
  id: z.string(),
  username: z.string().min(1),
  displayName: z.string().min(1),
  role: userRoleSchema,
  ttsEnabled: z.boolean().default(true),
  assignedRoomIds: z.array(z.string()).default([]),
  presets: z.array(ttsPresetSchema).default([]),
});
export type User = z.infer<typeof userSchema>;

export const userWithPasswordSchema = userSchema.extend({
  passwordHash: z.string(),
});
export type UserWithPassword = z.infer<typeof userWithPasswordSchema>;

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});
export type LoginPayload = z.infer<typeof loginSchema>;

export const createUserSchema = z.object({
  username: z.string().min(1),
  displayName: z.string().min(1),
  password: z.string().min(4),
  role: userRoleSchema,
  ttsEnabled: z.boolean().default(true),
  assignedRoomIds: z.array(z.string()).default([]),
});
export type CreateUserPayload = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema.partial().extend({
  password: z.string().min(4).optional(),
});
export type UpdateUserPayload = z.infer<typeof updateUserSchema>;

// ─── TTS / SIP Settings ───────────────────────────────────────────────────────
export const codecSchema = z.enum(["PCMU", "PCMA", "G722"]);
export type Codec = z.infer<typeof codecSchema>;

export const ttsRoutingModeSchema = z.enum(["direct", "pg"]);
export type TtsRoutingMode = z.infer<typeof ttsRoutingModeSchema>;

export const sipSettingsSchema = z.object({
  serverAddress: z.string().default(""),
  serverPort: z.number().int().min(1).max(65535).default(5060),
  username: z.string().default(""),
  password: z.string().default(""),
  fromExtension: z.string().default(""),
  realm: z.string().default(""),
});
export type SipSettings = z.infer<typeof sipSettingsSchema>;

export const pgSettingsSchema = z.object({
  address: z.string().default(""),
  port: z.number().int().min(1).max(65535).default(5060),
  defaultExtension: z.string().default(""),
});
export type PgSettings = z.infer<typeof pgSettingsSchema>;

export const ttsSettingsSchema = z.object({
  defaultCodec: codecSchema.default("PCMU"),
  defaultMode: ttsRoutingModeSchema.default("direct"),
  dtmfDelayMs: z.number().int().min(200).max(2000).default(600),
  chimeEnabled: z.boolean().default(false),
  chimeDelayMs: z.number().int().min(300).max(10000).default(750),
  voiceSpeed: z.number().min(0.5).max(2.0).default(1.0),
  voicePitch: z.number().min(0.5).max(2.0).default(1.0),
});
export type TtsSettings = z.infer<typeof ttsSettingsSchema>;

export const loggingSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  retainDays: z.number().int().min(1).max(365).default(30),
});
export type LoggingSettings = z.infer<typeof loggingSettingsSchema>;

export const systemSettingsSchema = z.object({
  sip: sipSettingsSchema.default({}),
  pg: pgSettingsSchema.default({}),
  tts: ttsSettingsSchema.default({}),
  logging: loggingSettingsSchema.default({}),
});
export type SystemSettings = z.infer<typeof systemSettingsSchema>;

// ─── TTS Send Request ─────────────────────────────────────────────────────────
export const ttsSendSchema = z.object({
  text: z.string().min(1, "Text is required").max(2000),
  contactId: z.string().optional(),
  mode: ttsRoutingModeSchema.optional(),
  targetAddress: z.string().optional(),
  pgExtension: z.string().optional(),
  codec: codecSchema,
  dtmfDelayMs: z.number().int().min(200).max(2000).optional(),
  chimeEnabled: z.boolean().optional(),
  chimeDelayMs: z.number().int().min(300).max(10000).optional(),
});
export type TtsSendPayload = z.infer<typeof ttsSendSchema>;

// ─── Logs ─────────────────────────────────────────────────────────────────────
export const logLevelSchema = z.enum(["info", "warn", "error", "tts", "sip"]);
export type LogLevel = z.infer<typeof logLevelSchema>;

export const logEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  level: logLevelSchema,
  message: z.string(),
  user: z.string().optional(),
  details: z.string().optional(),
});
export type LogEntry = z.infer<typeof logEntrySchema>;

// ─── System Status ────────────────────────────────────────────────────────────
export const systemStatusSchema = z.object({
  server: z.enum(["ok", "error"]),
  tts: z.enum(["ok", "unavailable", "checking"]),
  sip: z.enum(["ok", "unconfigured", "error", "checking"]),
  pg: z.enum(["ok", "unconfigured", "error", "checking"]),
});
export type SystemStatus = z.infer<typeof systemStatusSchema>;
