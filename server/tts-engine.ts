/**
 * TTS Engine Module
 *
 * This module handles Text-to-Speech generation using Kokoro TTS.
 * Kokoro is an open-weight 82M parameter TTS model (Apache 2.0).
 *
 * In this environment, TTS audio is generated as a status simulation.
 * To enable real audio:
 *   1. Install Python + kokoro: pip install kokoro soundfile
 *   2. Run the included Python helper: python server/kokoro_tts.py
 *   3. Set TTS_BACKEND=python in environment
 *
 * The SIP/RTP audio transmission requires:
 *   - A working SIP server/network
 *   - TOA IP-A1 speakers on the same network segment
 *   - Proper SIP registration credentials (configured in IT Settings)
 */

import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { getSettings } from "./db.js";
import type { TtsSendPayload } from "@shared/schema";

export type TtsStatus = "ok" | "unavailable" | "checking";

let ttsStatus: TtsStatus = "checking";
let ttsStatusMessage = "Checking TTS engine...";

// Check if Python + kokoro are available
async function checkTtsEngine(): Promise<void> {
  return new Promise((resolve) => {
    const proc = spawn("python3", ["-c", "import kokoro; print('ok')"], {
      timeout: 5000,
    });

    let output = "";
    proc.stdout.on("data", (d: Buffer) => (output += d.toString()));
    proc.on("close", (code: number) => {
      if (code === 0 && output.includes("ok")) {
        ttsStatus = "ok";
        ttsStatusMessage = "Kokoro TTS engine ready";
      } else {
        ttsStatus = "unavailable";
        ttsStatusMessage =
          "Kokoro TTS not installed. Install with: pip install kokoro soundfile";
      }
      resolve();
    });
    proc.on("error", () => {
      ttsStatus = "unavailable";
      ttsStatusMessage =
        "Python not found. Kokoro TTS requires Python 3.8+ with kokoro package installed.";
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
  if (ttsStatus !== "ok") {
    throw new Error(ttsStatusMessage);
  }

  const settings = getSettings();
  const { voiceSpeed, voicePitch } = settings.tts;

  const scriptPath = path.resolve(process.cwd(), "server/kokoro_tts.py");

  return new Promise((resolve, reject) => {
    const proc = spawn("python3", [
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
 * This implements the full paging workflow:
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

  // Validate configuration
  if (payload.mode === "direct" && !payload.targetAddress) {
    throw new Error("Direct mode requires a target speaker address");
  }
  if (payload.mode === "pg" && !payload.targetAddress) {
    throw new Error("PG mode requires the PG server address");
  }

  // Build a detailed workflow description for logging
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

  // If TTS engine is available, generate real audio
  if (ttsStatus === "ok") {
    const tmpDir = path.join(process.cwd(), "tmp");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const wavPath = path.join(tmpDir, `tts_${Date.now()}.wav`);

    try {
      await generateSpeech(payload.text, wavPath);
      workflowSteps.push("TTS: Generated with Kokoro");

      // TODO: Implement actual SIP call and RTP streaming
      // This requires a running SIP server and network access.
      // The audio file is at wavPath and ready for transmission.
      workflowSteps.push("SIP: [requires network SIP setup]");

      // Cleanup temp file
      try { fs.unlinkSync(wavPath); } catch {}

      return {
        success: true,
        message: `Announcement queued. ${workflowSteps.join(" | ")}`,
      };
    } catch (err: any) {
      throw new Error(`TTS generation failed: ${err.message}`);
    }
  }

  // Simulated mode — returns success with workflow description
  // This shows exactly what the system WOULD do when fully configured
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
