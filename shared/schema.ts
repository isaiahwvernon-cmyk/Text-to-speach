import { z } from "zod";

export const speakerConnectionSchema = z.object({
  ipAddress: z.string().min(1, "IP address is required"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type SpeakerConnection = z.infer<typeof speakerConnectionSchema>;

export const speakerSchema = z.object({
  id: z.string(),
  label: z.string(),
  ipAddress: z.string().min(1, "IP address is required"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type Speaker = z.infer<typeof speakerSchema>;

export const roomSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  speakers: z.array(speakerSchema).min(1),
  syncMode: z.boolean().default(true),
});

export type Room = z.infer<typeof roomSchema>;

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
