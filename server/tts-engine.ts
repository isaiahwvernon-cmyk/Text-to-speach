import { spawn, spawnSync } from "child_process";
import path from "path";
import fs from "fs";
import { getSettings, PRESETS_AUDIO_DIR } from "./db.js";
import type { TtsSendPayload, PresetPlayPayload } from "@shared/schema";
import { sendViaSip, type CodecName } from "./sip-sender.js";

export type TtsStatus = "ok" | "unavailable" | "checking";

let ttsStatus: TtsStatus = "checking";
let ttsStatusMessage = "Checking TTS engine...";
let resolvedPythonCmd: string | null = null;

/**
 * Find the absolute path to a working Python 3 executable.
 * Returns the real filesystem path (e.g. C:\Python312\python.exe) so that
 * subprocess spawns always resolve to the same interpreter regardless of
 * PATH differences between environments.
 */
function findPythonCmd(): string | null {
  const candidates =
    process.platform === "win32"
      ? ["py", "python", "python3"]
      : ["python3", "python"];

  for (const cmd of candidates) {
    try {
      // First verify this command runs Python 3
      const verResult = spawnSync(cmd, ["--version"], { timeout: 4000 });
      if (verResult.status !== 0) continue;
      const ver =
        (verResult.stdout?.toString() ?? "") +
        (verResult.stderr?.toString() ?? "");
      if (!ver.includes("Python 3")) continue;

      // Resolve the absolute path of this interpreter via sys.executable
      const pathResult = spawnSync(
        cmd,
        ["-c", "import sys; print(sys.executable)"],
        { timeout: 4000 }
      );
      if (pathResult.status === 0) {
        const absPath = pathResult.stdout?.toString().trim();
        if (absPath && absPath.length > 0) {
          return absPath; // e.g. C:\Python312\python.exe
        }
      }

      // Fallback: return the command name if we can't get the abs path
      return cmd;
    } catch {
      // not found, try next
    }
  }
  return null;
}

// Check if Python + kokoro are available
async function checkTtsEngine(): Promise<void> {
  resolvedPythonCmd = findPythonCmd();

  if (resolvedPythonCmd) {
    console.log(`[TTS] Python resolved to: ${resolvedPythonCmd}`);
  }

  if (!resolvedPythonCmd) {
    ttsStatus = "unavailable";
    ttsStatusMessage =
      "Python 3 not found. Kokoro TTS requires Python 3.8+ with kokoro package installed.";
    return;
  }

  // Use find_spec to check package presence WITHOUT importing (avoids loading
  // PyTorch / Kokoro model which can be very slow or fail on some platforms).
  const checkCmd = [
    "-c",
    "import importlib.util, sys; " +
    "k=importlib.util.find_spec('kokoro'); " +
    "s=importlib.util.find_spec('soundfile'); " +
    "print('ok' if (k and s) else 'missing')",
  ];

  return new Promise((resolve) => {
    const proc = spawn(resolvedPythonCmd!, checkCmd);

    let output = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => (output += d.toString()));
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

    // Manual timeout — spawn() does not honour the timeout option
    const timer = setTimeout(() => {
      proc.kill();
      ttsStatus = "unavailable";
      ttsStatusMessage =
        "TTS check timed out. Try: pip install kokoro soundfile";
      resolve();
    }, 10000);

    proc.on("close", (code: number) => {
      clearTimeout(timer);
      if (code === 0 && output.trim().includes("ok")) {
        ttsStatus = "ok";
        ttsStatusMessage = "Kokoro TTS engine ready";
        console.log(`[TTS] Kokoro ready (Python: ${resolvedPythonCmd})`);
      } else {
        ttsStatus = "unavailable";
        ttsStatusMessage =
          "Kokoro TTS not installed. Install with: pip install kokoro soundfile";
        console.warn(
          `[TTS] Kokoro check failed (exit ${code}). output="${output.trim()}" stderr="${stderr.trim()}"`
        );
      }
      resolve();
    });
    proc.on("error", () => {
      clearTimeout(timer);
      ttsStatus = "unavailable";
      ttsStatusMessage =
        "Kokoro TTS not installed. Install with: pip install kokoro soundfile";
      resolve();
    });
  });
}

checkTtsEngine().catch(() => {
  ttsStatus = "unavailable";
  ttsStatusMessage = "TTS engine check failed";
});

export function getTtsStatus(): { status: TtsStatus; message: string } {
  return { status: ttsStatus, message: ttsStatusMessage };
}

/**
 * Core TTS generation — accepts explicit speed/pitch overrides.
 */
async function generateSpeechToFile(
  text: string,
  outputPath: string,
  speed: number,
  pitch: number
): Promise<void> {
  if (ttsStatus !== "ok" || !resolvedPythonCmd) {
    throw new Error(ttsStatusMessage);
  }

  const scriptPath = path.resolve(process.cwd(), "server/kokoro_tts.py");

  return new Promise((resolve, reject) => {
    const proc = spawn(resolvedPythonCmd!, [
      scriptPath,
      "--text", text,
      "--output", outputPath,
      "--speed", String(speed),
      "--pitch", String(pitch),
    ]);

    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    proc.on("close", (code: number) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve();
      } else {
        reject(new Error(`TTS generation failed: ${stderr || "unknown error"}`));
      }
    });
    proc.on("error", (err: Error) => reject(err));
  });
}

/**
 * Generate speech using settings from the system config.
 */
async function generateSpeech(text: string, outputPath: string): Promise<void> {
  const settings = getSettings();
  return generateSpeechToFile(text, outputPath, settings.tts.voiceSpeed, settings.tts.voicePitch);
}

/**
 * Send a TTS announcement via SIP to the target endpoint.
 *
 * Direct mode:
 *   text → Kokoro → PCM → transcode to codec → SIP/RTP to target speaker
 *
 * PG mode:
 *   text → Kokoro → PCM → transcode to codec → SIP call to PG →
 *   send DTMF extension → wait dtmfDelayMs → [optional chime + chimeDelayMs] →
 *   stream audio → PG routes to multicast channel
 */
export type AnnouncementStep = {
  name: string;
  status: "ok" | "warning" | "error" | "skipped";
  detail: string;
};

export async function sendTtsAnnouncement(
  payload: TtsSendPayload,
  username: string
): Promise<{ success: boolean; steps: AnnouncementStep[]; simulated?: boolean }> {
  const settings = getSettings();
  const dtmfDelay = payload.dtmfDelayMs ?? settings.tts.dtmfDelayMs;
  const chimeEnabled = payload.chimeEnabled ?? settings.tts.chimeEnabled;
  const chimeDelay = payload.chimeDelayMs ?? settings.tts.chimeDelayMs;

  if (payload.mode === "direct" && !payload.targetAddress) {
    throw new Error("Direct mode requires a target speaker IP address");
  }
  if (payload.mode === "pg" && !payload.targetAddress) {
    throw new Error("PG mode requires the PG gateway IP address");
  }

  const steps: AnnouncementStep[] = [];

  // ── Step 1: TTS Engine ───────────────────────────────────────────────────
  if (ttsStatus !== "ok") {
    steps.push({
      name: "TTS Generation",
      status: "error",
      detail: ttsStatusMessage,
    });
    steps.push({
      name: "Audio Delivery",
      status: "skipped",
      detail: "Skipped — TTS engine not ready",
    });
    return { success: true, simulated: true, steps };
  }

  const tmpDir = path.join(process.cwd(), "tmp");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const wavPath = path.join(tmpDir, `tts_${Date.now()}.wav`);

  const ttsStart = Date.now();
  let audioDurationSecs = 0;
  try {
    await generateSpeech(payload.text, wavPath);
    const elapsed = ((Date.now() - ttsStart) / 1000).toFixed(1);

    // Get duration of generated audio (WAV PCM 24 kHz mono)
    let durationStr = "";
    try {
      const stat = fs.statSync(wavPath);
      const secs = (stat.size - 44) / (24000 * 2);
      if (secs > 0) {
        audioDurationSecs = secs;
        durationStr = ` (${secs.toFixed(1)}s audio)`;
      }
    } catch {}

    steps.push({
      name: "TTS Generation",
      status: "ok",
      detail: `Kokoro generated${durationStr} in ${elapsed}s — codec: ${payload.codec}`,
    });
  } catch (err: any) {
    steps.push({
      name: "TTS Generation",
      status: "error",
      detail: err.message || "Kokoro script failed",
    });
    steps.push({
      name: "Audio Delivery",
      status: "skipped",
      detail: "Skipped — TTS generation failed",
    });
    try { fs.unlinkSync(wavPath); } catch {}
    throw new Error(`TTS generation failed: ${err.message}`);
  }

  // SIP session timeout = audio duration + 60 s overhead (connect + BYE + margin)
  // Minimum 90 s so very short clips still get a reasonable window.
  const sessionTimeoutMs = Math.max(90_000, Math.ceil(audioDurationSecs + 60) * 1000);

  // ── Step 2: Audio Delivery via SIP/RTP ──────────────────────────────────
  try {
    let sipResult;
    if (payload.mode === "direct") {
      sipResult = await sendViaSip({
        targetIp: payload.targetAddress,
        wavFile: wavPath,
        codec: payload.codec as CodecName,
        chimeDelayMs: chimeEnabled ? chimeDelay : 1200,
        sessionTimeoutMs,
      });
    } else {
      // PG mode — send DTMF extension digits after the call is up
      const ext = payload.pgExtension || settings.pg?.defaultExtension || "";
      sipResult = await sendViaSip({
        targetIp: payload.targetAddress,
        wavFile: wavPath,
        codec: payload.codec as CodecName,
        dtmfDigits: ext,
        dtmfDelayMs: dtmfDelay,
        chimeDelayMs: chimeEnabled ? chimeDelay : 0,
        sessionTimeoutMs,
      });
    }

    steps.push({
      name: "Audio Delivery",
      status: sipResult.success ? "ok" : "error",
      detail: sipResult.detail,
    });
  } catch (err: any) {
    steps.push({
      name: "Audio Delivery",
      status: "error",
      detail: `SIP delivery error: ${err.message}`,
    });
  } finally {
    try { fs.unlinkSync(wavPath); } catch {}
  }

  console.log(
    `[TTS] Announcement by ${username}: "${payload.text.slice(0, 50)}${payload.text.length > 50 ? "…" : ""}" | ` +
    `mode=${payload.mode} target=${payload.targetAddress} codec=${payload.codec}`
  );

  return { success: true, steps };
}

// ─── Global Preset Audio ──────────────────────────────────────────────────────

export function getPresetWavPath(presetId: string): string {
  return path.join(PRESETS_AUDIO_DIR, `${presetId}.wav`);
}

export function deletePresetAudio(presetId: string): void {
  const wavPath = getPresetWavPath(presetId);
  try {
    if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
  } catch {}
}

/**
 * Pre-generate Kokoro TTS audio for a global preset.
 * Saves a WAV file to PRESETS_AUDIO_DIR/{presetId}.wav.
 */
export async function generatePresetAudio(
  presetId: string,
  text: string,
  voiceSpeed: number,
  voicePitch: number
): Promise<void> {
  if (!fs.existsSync(PRESETS_AUDIO_DIR)) {
    fs.mkdirSync(PRESETS_AUDIO_DIR, { recursive: true });
  }
  const outputPath = getPresetWavPath(presetId);
  await generateSpeechToFile(text, outputPath, voiceSpeed, voicePitch);
}

/**
 * Play a global preset using its pre-generated WAV file.
 * Skips the Kokoro TTS step entirely — only SIP/RTP streaming.
 */
export async function sendPresetAnnouncement(
  presetId: string,
  presetName: string,
  payload: PresetPlayPayload,
  username: string
): Promise<{ success: boolean; steps: AnnouncementStep[] }> {
  const wavPath = getPresetWavPath(presetId);
  const steps: AnnouncementStep[] = [];

  if (!fs.existsSync(wavPath)) {
    throw new Error(`Preset audio not found. Please regenerate "${presetName}".`);
  }

  steps.push({
    name: "TTS Generation",
    status: "ok",
    detail: `Using pre-generated audio for "${presetName}"`,
  });

  const settings = getSettings();
  const dtmfDelay = payload.dtmfDelayMs ?? settings.tts.dtmfDelayMs;
  const chimeEnabled = payload.chimeEnabled ?? settings.tts.chimeEnabled;
  const chimeDelay = payload.chimeDelayMs ?? settings.tts.chimeDelayMs;

  let audioDurationSecs = 0;
  try {
    const stat = fs.statSync(wavPath);
    const secs = (stat.size - 44) / (24000 * 2);
    if (secs > 0) audioDurationSecs = secs;
  } catch {}
  const sessionTimeoutMs = Math.max(90_000, Math.ceil(audioDurationSecs + 60) * 1000);

  try {
    let sipResult;
    if (payload.mode === "direct") {
      sipResult = await sendViaSip({
        targetIp: payload.targetAddress!,
        wavFile: wavPath,
        codec: payload.codec as CodecName,
        chimeDelayMs: chimeEnabled ? chimeDelay : 1200,
        sessionTimeoutMs,
      });
    } else {
      const ext = payload.pgExtension || "";
      sipResult = await sendViaSip({
        targetIp: payload.targetAddress!,
        wavFile: wavPath,
        codec: payload.codec as CodecName,
        dtmfDigits: ext,
        dtmfDelayMs: dtmfDelay,
        chimeDelayMs: chimeEnabled ? chimeDelay : 0,
        sessionTimeoutMs,
      });
    }

    steps.push({
      name: "Audio Delivery",
      status: sipResult.success ? "ok" : "error",
      detail: sipResult.detail,
    });
  } catch (err: any) {
    steps.push({
      name: "Audio Delivery",
      status: "error",
      detail: `SIP delivery error: ${err.message}`,
    });
  }

  console.log(
    `[TTS] Preset "${presetName}" by ${username} | ` +
    `mode=${payload.mode} target=${payload.targetAddress} codec=${payload.codec}`
  );

  return { success: true, steps };
}
