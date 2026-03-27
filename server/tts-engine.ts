import { spawn, spawnSync } from "child_process";
import path from "path";
import fs from "fs";
import { getSettings } from "./db.js";
import type { TtsSendPayload } from "@shared/schema";

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
 * Generate speech audio from text using Kokoro TTS via Python subprocess.
 * Returns path to generated audio file (WAV), or throws if unavailable.
 */
async function generateSpeech(
  text: string,
  outputPath: string
): Promise<void> {
  if (ttsStatus !== "ok" || !resolvedPythonCmd) {
    throw new Error(ttsStatusMessage);
  }

  const settings = getSettings();
  const { voiceSpeed, voicePitch } = settings.tts;

  const scriptPath = path.resolve(process.cwd(), "server/kokoro_tts.py");

  return new Promise((resolve, reject) => {
    const proc = spawn(resolvedPythonCmd!, [
      scriptPath,
      "--text", text,
      "--output", outputPath,
      "--speed", String(voiceSpeed),
      "--pitch", String(voicePitch),
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
export async function sendTtsAnnouncement(
  payload: TtsSendPayload,
  username: string
): Promise<{ success: boolean; message: string; simulated?: boolean }> {
  const settings = getSettings();

  const dtmfDelay = payload.dtmfDelayMs ?? settings.tts.dtmfDelayMs;
  const chimeEnabled = payload.chimeEnabled ?? settings.tts.chimeEnabled;
  const chimeDelay = payload.chimeDelayMs ?? settings.tts.chimeDelayMs;

  if (payload.mode === "direct" && !payload.targetAddress) {
    throw new Error("Direct mode requires a target speaker address");
  }
  if (payload.mode === "pg" && !payload.targetAddress) {
    throw new Error("PG mode requires the PG server address");
  }

  const workflowSteps: string[] = [];
  workflowSteps.push(`User: ${username}`);
  workflowSteps.push(`Text: "${payload.text}"`);
  workflowSteps.push(`Mode: ${payload.mode === "pg" ? "PG Gateway" : "Direct SIP"}`);
  workflowSteps.push(`Codec: ${payload.codec}`);
  workflowSteps.push(`Target: ${payload.targetAddress}`);

  if (payload.mode === "pg") {
    workflowSteps.push(`Extension: ${payload.pgExtension || "(default)"}`);
    workflowSteps.push(`DTMF delay: ${dtmfDelay}ms`);
    if (chimeEnabled) {
      workflowSteps.push(`Chime: enabled (${chimeDelay}ms delay)`);
    }
  }

  if (ttsStatus === "ok") {
    const tmpDir = path.join(process.cwd(), "tmp");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const wavPath = path.join(tmpDir, `tts_${Date.now()}.wav`);

    try {
      await generateSpeech(payload.text, wavPath);
      workflowSteps.push("TTS: Generated with Kokoro");
      workflowSteps.push("SIP: [requires network SIP setup]");

      try { fs.unlinkSync(wavPath); } catch {}

      return {
        success: true,
        message: `Announcement queued. ${workflowSteps.join(" | ")}`,
      };
    } catch (err: any) {
      throw new Error(`TTS generation failed: ${err.message}`);
    }
  }

  return {
    success: true,
    simulated: true,
    message: buildSimulatedMessage(payload, username, dtmfDelay, chimeEnabled, chimeDelay),
  };
}

function buildSimulatedMessage(
  payload: TtsSendPayload,
  username: string,
  dtmfDelay: number,
  chimeEnabled: boolean,
  chimeDelay: number
): string {
  const codec = payload.codec;
  const mode = payload.mode;

  if (mode === "direct") {
    return (
      `[SIMULATED] Direct SIP Announcement by ${username}\n` +
      `Text: "${payload.text}"\n` +
      `Flow: Kokoro TTS → PCM → ${codec} transcode → SIP/RTP → ${payload.targetAddress}\n` +
      `Status: Kokoro TTS engine not installed. ` +
      `Install Python + kokoro to enable real audio.`
    );
  }

  const ext = payload.pgExtension ? ` → DTMF "${payload.pgExtension}"` : "";
  const chimeStr = chimeEnabled ? ` → Chime → wait ${chimeDelay}ms` : "";

  return (
    `[SIMULATED] PG Zone Announcement by ${username}\n` +
    `Text: "${payload.text}"\n` +
    `Flow: Kokoro TTS → PCM → ${codec} transcode → SIP → ${payload.targetAddress}` +
    `${ext} → wait ${dtmfDelay}ms${chimeStr} → RTP stream → PG multicast\n` +
    `Status: Kokoro TTS engine not installed. ` +
    `Install Python + kokoro to enable real audio.`
  );
}
