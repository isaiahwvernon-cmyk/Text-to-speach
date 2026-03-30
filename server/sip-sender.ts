/**
 * sip-sender.ts
 * Minimal SIP UA + ffmpeg RTP streamer for delivering TTS audio to TOA IP-A1 speakers.
 *
 * Flow (Direct mode):
 *   SIP INVITE → 100 Trying → 200 OK (speaker's RTP port from SDP) → ACK
 *   → ffmpeg streams WAV as RTP → BYE → 200 OK
 *
 * Flow (PG mode):
 *   SIP INVITE to PG gateway → ACK → wait dtmfDelay → SIP INFO DTMF digits
 *   → wait chimeDelay → ffmpeg stream RTP → BYE
 */

import * as dgram from "dgram";
import * as os from "os";
import { spawn } from "child_process";

// ── Helpers ─────────────────────────────────────────────────────────────────

function randomHex(len: number): string {
  let s = "";
  while (s.length < len) s += Math.random().toString(16).slice(2);
  return s.slice(0, len);
}

/**
 * Find the best local IPv4 address for reaching targetIp.
 * Prefers an address on the same /24 subnet.
 */
export function getLocalIp(targetIp: string): string {
  const prefix3 = targetIp.split(".").slice(0, 3).join(".");
  const prefix2 = targetIp.split(".").slice(0, 2).join(".");
  const addrs: string[] = [];

  for (const iface of Object.values(os.networkInterfaces())) {
    for (const addr of iface ?? []) {
      if (addr.family === "IPv4" && !addr.internal) {
        addrs.push(addr.address);
      }
    }
  }

  return (
    addrs.find((a) => a.startsWith(prefix3)) ??
    addrs.find((a) => a.startsWith(prefix2)) ??
    addrs[0] ??
    "127.0.0.1"
  );
}

/** Extract the audio port from an SDP block embedded in a SIP message. */
function parseSdpPort(msg: string): number | null {
  const m = msg.match(/m=audio\s+(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/** Extract the To-tag from a SIP message. */
function parseToTag(msg: string): string {
  const m = msg.match(/^To:.*?;tag=([^\s;,\r\n]+)/im);
  return m ? m[1] : "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Codec table ──────────────────────────────────────────────────────────────

const CODECS = {
  PCMU: { pt: 0,  name: "PCMU", sipRate: 8000, ffCodec: "pcm_mulaw", ffRate: "8000" },
  PCMA: { pt: 8,  name: "PCMA", sipRate: 8000, ffCodec: "pcm_alaw",  ffRate: "8000" },
  G722: { pt: 9,  name: "G722", sipRate: 8000, ffCodec: "g722",       ffRate: "16000" },
} as const;

export type CodecName = keyof typeof CODECS;

// ── Types ────────────────────────────────────────────────────────────────────

export interface SipSendOptions {
  targetIp: string;
  targetPort?: number;
  wavFile: string;
  codec: CodecName;
  /** Milliseconds to wait after call setup before streaming audio (chime gap) */
  chimeDelayMs?: number;
  /** For PG mode: DTMF digits to send after call is up */
  dtmfDigits?: string;
  /** Milliseconds to wait after DTMF before streaming audio */
  dtmfDelayMs?: number;
  /** ffmpeg binary name / path (default: "ffmpeg") */
  ffmpegCmd?: string;
}

export interface SipSendResult {
  success: boolean;
  detail: string;
}

// ── SIP / RTP sender ─────────────────────────────────────────────────────────

export async function sendViaSip(opts: SipSendOptions): Promise<SipSendResult> {
  const {
    targetIp,
    targetPort = 5060,
    wavFile,
    codec,
    chimeDelayMs = 1200,
    dtmfDigits,
    dtmfDelayMs = 500,
    ffmpegCmd = "ffmpeg",
  } = opts;

  const codecInfo = CODECS[codec];
  const localIp = getLocalIp(targetIp);

  // RTP port we advertise in our SDP (we won't actually receive on it for sendonly)
  const localRtpPort = 20000 + Math.floor(Math.random() * 5000);

  const callId = `${randomHex(16)}@${localIp}`;
  const fromTag = randomHex(8);
  let cseqNum = 1;

  // ── Build SDP offer ───────────────────────────────────────────────────────
  const sdp =
    "v=0\r\n" +
    `o=repit 1 1 IN IP4 ${localIp}\r\n` +
    "s=REPIT Paging\r\n" +
    `c=IN IP4 ${localIp}\r\n` +
    "t=0 0\r\n" +
    `m=audio ${localRtpPort} RTP/AVP ${codecInfo.pt}\r\n` +
    `a=rtpmap:${codecInfo.pt} ${codecInfo.name}/${codecInfo.sipRate}\r\n` +
    "a=ptime:20\r\n" +
    "a=sendonly\r\n";

  // ── Build a SIP message ──────────────────────────────────────────────────
  function buildRequest(
    method: string,
    toTag: string,
    body: string = "",
    contentType: string = ""
  ): string {
    const lines: string[] = [
      `${method} sip:${targetIp}:${targetPort} SIP/2.0`,
      `Via: SIP/2.0/UDP ${localIp}:${localSipPort};branch=z9hG4bK${randomHex(8)};rport`,
      `From: "REPIT" <sip:repit@${localIp}>;tag=${fromTag}`,
      `To: <sip:${targetIp}>${toTag ? `;tag=${toTag}` : ""}`,
      `Call-ID: ${callId}`,
      `CSeq: ${cseqNum} ${method}`,
      "Max-Forwards: 70",
      "User-Agent: REPIT/1.0",
      `Contact: <sip:repit@${localIp}:${localSipPort}>`,
    ];
    if (body && contentType) {
      lines.push(`Content-Type: ${contentType}`);
      lines.push(`Content-Length: ${Buffer.byteLength(body)}`);
      lines.push("", body);
    } else {
      lines.push("Content-Length: 0", "", "");
    }
    return lines.join("\r\n");
  }

  // ── ffmpeg RTP stream ─────────────────────────────────────────────────────
  function streamAudio(destIp: string, destPort: number): Promise<string | null> {
    return new Promise((resolve) => {
      const args = [
        "-y",
        "-re",           // read input at real-time rate — critical for RTP pacing
        "-i", wavFile,
        "-ar", codecInfo.ffRate,
        "-ac", "1",
        "-acodec", codecInfo.ffCodec,
        "-f", "rtp",
        `rtp://${destIp}:${destPort}`,
      ];

      console.log(`[SIP] ffmpeg stream: ${ffmpegCmd} ${args.join(" ")}`);

      let stderr = "";
      const proc = spawn(ffmpegCmd, args, { stdio: ["ignore", "ignore", "pipe"] });
      proc.stderr.on("data", (d: Buffer) => {
        const chunk = d.toString();
        stderr += chunk;
        // Log progress lines (size= ... time= ...) so operator can see streaming
        if (chunk.includes("time=") || chunk.includes("Error") || chunk.includes("error")) {
          process.stdout.write(`[SIP/ffmpeg] ${chunk}`);
        }
      });
      proc.on("close", (code) => {
        if (code !== 0) {
          console.error(`[SIP] ffmpeg exited ${code}: ${stderr.slice(-400)}`);
          resolve(`ffmpeg exited with code ${code}: ${stderr.slice(-300)}`);
        } else {
          console.log(`[SIP] ffmpeg finished — audio delivered to ${destIp}:${destPort}`);
          resolve(null);
        }
      });
      proc.on("error", (err) => {
        console.error(`[SIP] ffmpeg spawn error: ${err.message}`);
        resolve(`ffmpeg error: ${err.message}`);
      });
    });
  }

  // ── Main SIP flow ─────────────────────────────────────────────────────────
  let localSipPort = 0; // filled after socket.bind()

  return new Promise<SipSendResult>((resolve) => {
    const socket = dgram.createSocket("udp4");
    let done = false;
    let toTag = "";

    const finish = (success: boolean, detail: string) => {
      if (done) return;
      done = true;
      try { socket.close(); } catch {}
      resolve({ success, detail });
    };

    const send = (msg: string) => {
      const buf = Buffer.from(msg);
      socket.send(buf, 0, buf.length, targetPort, targetIp, (err) => {
        if (err) finish(false, `UDP send error: ${err.message}`);
      });
    };

    // Overall timeout — 60 s covers TTS + chime + audio streaming
    const globalTimeout = setTimeout(() => {
      finish(false, `SIP session timed out after 60s — speaker at ${targetIp} did not respond or complete`);
    }, 60000);

    socket.bind(0, () => {
      localSipPort = (socket.address() as dgram.AddressInfo).port;

      // Send INVITE
      const inviteMsg = buildRequest("INVITE", "", sdp, "application/sdp");
      send(inviteMsg);
    });

    socket.on("message", async (msg) => {
      if (done) return;
      const text = msg.toString("utf8");

      // 1xx provisional — ignore, keep waiting
      if (/^SIP\/2\.0 1\d\d/.test(text)) return;

      // 200 OK to INVITE (CSeq header is case-insensitive in SIP)
      if (/^SIP\/2\.0 200/.test(text) && /cseq:/i.test(text) && /\bINVITE\b/i.test(text)) {
        toTag = parseToTag(text);
        const remoteRtpPort = parseSdpPort(text);

        console.log(`[SIP] 200 OK from ${targetIp} | RTP port: ${remoteRtpPort ?? "not found"} | codec: ${codec}`);
        // Log the SDP section for debugging
        const sdpSection = text.split(/\r?\n\r?\n/).slice(1).join("\n\n").trim();
        if (sdpSection) console.log(`[SIP] Speaker SDP:\n${sdpSection}`);

        // ACK (CSeq stays at 1 for INVITE dialog)
        const ackMsg = buildRequest("ACK", toTag);
        send(ackMsg);

        if (!remoteRtpPort) {
          finish(false, `Speaker responded but SDP had no audio port — response:\n${text.slice(0, 400)}`);
          clearTimeout(globalTimeout);
          return;
        }

        // ── Chime / DTMF gap ──────────────────────────────────────────────
        if (dtmfDigits) {
          // PG mode: wait dtmfDelayMs then send DTMF via SIP INFO
          await sleep(dtmfDelayMs);
          for (const digit of dtmfDigits) {
            if (done) return;
            cseqNum++;
            const infoBody =
              `Signal=${digit}\r\nDuration=250\r\n`;
            const infoMsg = buildRequest("INFO", toTag, infoBody, "application/dtmf-relay");
            send(infoMsg);
            await sleep(200);
          }
        }

        if (chimeDelayMs > 0) await sleep(chimeDelayMs);

        // ── Stream audio ──────────────────────────────────────────────────
        const ffErr = await streamAudio(targetIp, remoteRtpPort);
        clearTimeout(globalTimeout);
        if (done) return;

        // ── BYE ───────────────────────────────────────────────────────────
        cseqNum++;
        const byeMsg = buildRequest("BYE", toTag);
        send(byeMsg);

        // Give BYE 1 s to transit then resolve
        setTimeout(() => {
          if (ffErr) {
            finish(false, `Audio stream error: ${ffErr}`);
          } else {
            const dtmfNote = dtmfDigits ? ` | DTMF: ${dtmfDigits}` : "";
            finish(true, `Delivered to ${targetIp}:${remoteRtpPort} via SIP/RTP (${codec})${dtmfNote}`);
          }
        }, 1000);
        return;
      }

      // 200 OK to BYE — call cleanly ended, already resolved
      if (/^SIP\/2\.0 200/.test(text) && /\bBYE\b/.test(text)) return;

      // Non-200 final response to INVITE
      if (/^SIP\/2\.0 [3-9]\d\d/.test(text)) {
        const status = text.match(/^SIP\/2\.0 (\d+ .+)/)?.[1] ?? "Unknown error";
        clearTimeout(globalTimeout);
        finish(false, `Speaker rejected call: ${status}`);
        return;
      }

      // Speaker-initiated BYE (it hung up on us)
      if (/^BYE /.test(text)) {
        clearTimeout(globalTimeout);
        finish(false, `Speaker sent BYE before audio finished — check SIP credentials or speaker config`);
      }
    });

    socket.on("error", (err) => {
      clearTimeout(globalTimeout);
      finish(false, `UDP error: ${err.message}`);
    });
  });
}
