import { useState, useCallback, useRef } from "react";
import { useMixerWs } from "@/hooks/use-mixer";
import { faderPositionToDb, crosspointValueToDb, formatDb } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Settings, Save, FolderOpen, WifiOff, X } from "lucide-react";

async function api(path: string, body?: object) {
  const res = await fetch(path, {
    method: body !== undefined ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function LevelMeter({ level }: { level: number }) {
  const pct = Math.max(0, Math.min(100, (level / 72) * 100));
  const color =
    level >= 60 ? "#ef4444" : level >= 48 ? "#eab308" : "#22c55e";
  return (
    <div
      className="w-2 rounded-sm overflow-hidden flex flex-col justify-end"
      style={{ height: 140, background: "hsl(220 15% 12%)" }}
    >
      <div
        className="w-full transition-all duration-75 rounded-sm"
        style={{ height: `${pct}%`, background: color, minHeight: level > 0 ? 2 : 0 }}
      />
    </div>
  );
}

function ChannelStrip({
  label,
  position,
  on,
  level,
  onFaderChange,
  onToggle,
  color,
}: {
  label: string;
  position: number;
  on: boolean;
  level: number;
  onFaderChange: (pos: number) => void;
  onToggle: () => void;
  color: string;
}) {
  const db = faderPositionToDb(position);
  const dbStr = formatDb(db);

  return (
    <div
      className="flex flex-col items-center gap-1 rounded-xl p-2 shrink-0"
      style={{
        width: 68,
        background: on ? "hsl(220 15% 13%)" : "hsl(220 15% 10%)",
        border: `1px solid hsl(220 15% 20%)`,
        opacity: on ? 1 : 0.55,
      }}
      data-testid={`channel-strip-${label}`}
    >
      <div
        className="w-full text-center font-bold rounded-lg px-1 py-1 text-xs tracking-wider truncate"
        style={{ background: color, color: "#fff" }}
      >
        {label}
      </div>

      <LevelMeter level={level} />

      <div className="relative" style={{ width: 44, height: 160 }}>
        <div
          className="absolute rounded"
          style={{
            left: "50%",
            top: 0,
            bottom: 0,
            width: 4,
            transform: "translateX(-50%)",
            background: "hsl(220 15% 18%)",
            border: "1px solid hsl(220 15% 26%)",
          }}
        />
        <div
          className="absolute rounded-sm"
          style={{
            left: "50%",
            width: 2,
            height: 8,
            background: "hsl(30 100% 52%)",
            transform: "translateX(-50%)",
            top: "calc(100% * (1 - 53/63) - 4px)",
          }}
        />
        <input
          type="range"
          min={0}
          max={63}
          value={position}
          onChange={(e) => onFaderChange(parseInt(e.target.value))}
          className="mixer-fader"
          data-testid={`fader-${label}`}
        />
      </div>

      <div
        className="font-mono text-xs text-center rounded px-1 py-0.5"
        style={{
          color:
            db === 0
              ? "hsl(30 100% 60%)"
              : db > 0
              ? "#ef4444"
              : "#9ca3af",
          minWidth: 36,
        }}
      >
        {dbStr}
      </div>

      <button
        onClick={onToggle}
        className="w-full rounded-lg py-1.5 text-xs font-bold uppercase tracking-wide transition-all"
        style={{
          background: on ? "hsl(30 100% 52%)" : "hsl(220 15% 18%)",
          color: on ? "#fff" : "#6b7280",
          border: `1px solid ${on ? "hsl(30 100% 40%)" : "hsl(220 15% 26%)"}`,
        }}
        data-testid={`onoff-${label}`}
      >
        {on ? "ON" : "OFF"}
      </button>
    </div>
  );
}

type MatrixState = ReturnType<typeof useMixerWs>;

function MatrixGrid({
  state,
  onToggle,
  onGainChange,
}: {
  state: MatrixState;
  onToggle: (srcIdx: number, bus: number) => void;
  onGainChange: (srcIdx: number, bus: number, val: number) => void;
}) {
  const [selected, setSelected] = useState<{ src: number; bus: number } | null>(null);

  const sourceLabels = [
    "IN 1", "IN 2", "IN 3", "IN 4",
    "IN 5", "IN 6", "IN 7", "IN 8",
    "ST 1", "ST 2",
  ];
  const busLabels = ["Bus 1", "Bus 2", "Bus 3", "Bus 4"];

  const sel = selected;
  const selGain = sel != null ? (state.inputMatrixGain[sel.src]?.[sel.bus] ?? 0x46) : 0x46;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-3">
          Input Matrix — Sources → Buses
        </h3>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="text-left text-xs text-gray-500 pb-2 pr-4" style={{ minWidth: 56 }}>
                  Source
                </th>
                {busLabels.map((b, i) => (
                  <th
                    key={i}
                    className="text-center text-xs text-gray-400 pb-2 px-1"
                    style={{ minWidth: 66 }}
                  >
                    {b}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sourceLabels.map((src, srcIdx) => (
                <tr key={srcIdx}>
                  <td className="text-xs text-gray-300 pr-4 py-1 font-mono font-semibold">
                    {src}
                  </td>
                  {busLabels.map((_, bus) => {
                    const isOn = state.inputMatrix[srcIdx]?.[bus] ?? false;
                    const isSel = sel?.src === srcIdx && sel?.bus === bus;
                    const gainVal = state.inputMatrixGain[srcIdx]?.[bus] ?? 0x46;
                    const gainDb = crosspointValueToDb(gainVal);
                    return (
                      <td key={bus} className="px-1 py-1 text-center">
                        <button
                          onClick={() => {
                            onToggle(srcIdx, bus);
                            setSelected(isSel ? null : { src: srcIdx, bus });
                          }}
                          className="rounded-lg flex flex-col items-center justify-center gap-1 transition-all"
                          style={{
                            width: 60,
                            height: 52,
                            background: isOn
                              ? "hsl(30 100% 16%)"
                              : "hsl(220 15% 15%)",
                            border: `2px solid ${
                              isSel
                                ? "hsl(30 100% 52%)"
                                : isOn
                                ? "hsl(30 100% 38%)"
                                : "hsl(220 15% 24%)"
                            }`,
                          }}
                          data-testid={`matrix-in-${srcIdx}-${bus}`}
                        >
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{
                              background: isOn
                                ? "hsl(30 100% 55%)"
                                : "hsl(220 15% 30%)",
                              boxShadow: isOn
                                ? "0 0 6px hsl(30 100% 55%)"
                                : "none",
                            }}
                          />
                          <span
                            className="text-[9px] font-mono"
                            style={{ color: isOn ? "#e2a430" : "#4b5563" }}
                          >
                            {formatDb(gainDb)}
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {sel != null && (
          <div
            className="mt-3 p-3 rounded-xl flex items-center gap-3"
            style={{
              background: "hsl(220 15% 14%)",
              border: "1px solid hsl(220 15% 22%)",
            }}
          >
            <span className="text-sm text-gray-300 shrink-0">
              {sourceLabels[sel.src]} → {busLabels[sel.bus]} Gain:
            </span>
            <input
              type="range"
              min={0}
              max={70}
              value={selGain}
              onChange={(e) =>
                onGainChange(sel.src, sel.bus, parseInt(e.target.value))
              }
              className="flex-1"
              data-testid="matrix-gain-slider"
            />
            <span className="text-sm font-mono text-amber-400 w-14 text-right">
              {formatDb(crosspointValueToDb(selGain))}dB
            </span>
            <button
              onClick={() => setSelected(null)}
              className="text-gray-500 hover:text-white ml-1 p-1"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xs uppercase tracking-widest text-gray-500 mb-3">
          Output Matrix — Buses → Rec Out
        </h3>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <thead>
              <tr>
                <th
                  className="text-left text-xs text-gray-500 pb-2 pr-4"
                  style={{ minWidth: 56 }}
                >
                  Bus
                </th>
                {["Rec L", "Rec R"].map((r, i) => (
                  <th
                    key={i}
                    className="text-center text-xs text-gray-400 pb-2 px-1"
                    style={{ minWidth: 66 }}
                  >
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3].map((bus) => (
                <tr key={bus}>
                  <td className="text-xs text-gray-300 pr-4 py-1 font-mono font-semibold">
                    Bus {bus + 1}
                  </td>
                  {[0, 1].map((dst) => {
                    const isOn = state.outputMatrix[bus]?.[dst] ?? false;
                    return (
                      <td key={dst} className="px-1 py-1 text-center">
                        <button
                          onClick={() => {
                            api("/api/matrix/output", {
                              bus,
                              dstCh: dst,
                              on: !isOn,
                            }).catch(() => {});
                          }}
                          className="rounded-lg flex items-center justify-center transition-all"
                          style={{
                            width: 60,
                            height: 52,
                            background: isOn
                              ? "hsl(200 70% 18%)"
                              : "hsl(220 15% 15%)",
                            border: `2px solid ${
                              isOn ? "hsl(200 70% 42%)" : "hsl(220 15% 24%)"
                            }`,
                          }}
                          data-testid={`matrix-out-${bus}-${dst}`}
                        >
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{
                              background: isOn
                                ? "hsl(200 70% 55%)"
                                : "hsl(220 15% 28%)",
                              boxShadow: isOn
                                ? "0 0 8px hsl(200 70% 55%)"
                                : "none",
                            }}
                          />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PresetsPanel({ currentPreset }: { currentPreset: number }) {
  const { toast } = useToast();
  const [storing, setStoring] = useState<number | null>(null);

  const loadPreset = async (p: number) => {
    try {
      await api("/api/preset/load", { preset: p });
      toast({ title: `Preset ${p + 1} loaded` });
    } catch {
      toast({ title: "Failed to load preset", variant: "destructive" });
    }
  };

  const storePreset = async (p: number) => {
    setStoring(p);
    try {
      await api("/api/preset/store", { preset: p });
      toast({ title: `Preset ${p + 1} saved` });
    } catch {
      toast({ title: "Failed to save preset", variant: "destructive" });
    } finally {
      setStoring(null);
    }
  };

  return (
    <div
      className="grid grid-cols-4 gap-3"
      data-testid="presets-panel"
    >
      {Array.from({ length: 16 }, (_, i) => {
        const isActive = i === currentPreset;
        return (
          <div
            key={i}
            className="rounded-xl flex flex-col items-center gap-2 p-3"
            style={{
              background: isActive
                ? "hsl(30 100% 14%)"
                : "hsl(220 15% 13%)",
              border: `2px solid ${
                isActive
                  ? "hsl(30 100% 42%)"
                  : "hsl(220 15% 22%)"
              }`,
            }}
            data-testid={`preset-slot-${i}`}
          >
            <div
              className="font-bold text-base"
              style={{
                color: isActive ? "hsl(30 100% 65%)" : "#9ca3af",
              }}
            >
              P{i + 1}
            </div>
            {isActive && (
              <div className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "hsl(30 100% 20%)", color: "hsl(30 100% 65%)" }}>
                Active
              </div>
            )}
            <div className="flex gap-1 w-full mt-1">
              <button
                onClick={() => loadPreset(i)}
                className="flex-1 flex items-center justify-center rounded-lg py-2 transition-all text-xs gap-1"
                style={{
                  background: "hsl(220 15% 20%)",
                  color: "#9ca3af",
                  border: "1px solid hsl(220 15% 28%)",
                }}
                data-testid={`load-preset-${i}`}
              >
                <FolderOpen size={11} />
                Load
              </button>
              <button
                onClick={() => storePreset(i)}
                disabled={storing === i}
                className="flex-1 flex items-center justify-center rounded-lg py-2 transition-all text-xs gap-1"
                style={{
                  background: "hsl(220 15% 20%)",
                  color: "#9ca3af",
                  border: "1px solid hsl(220 15% 28%)",
                }}
                data-testid={`store-preset-${i}`}
              >
                <Save size={11} />
                {storing === i ? "..." : "Save"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ConnectForm({
  initialIp,
  initialPort,
  onDone,
}: {
  initialIp?: string;
  initialPort?: number;
  onDone?: () => void;
}) {
  const [ip, setIp] = useState(initialIp || "");
  const [port, setPort] = useState(String(initialPort || 3000));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  const handleConnect = async () => {
    if (!ip.trim()) {
      setError("Enter the mixer IP address");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/api/connect", {
        ip: ip.trim(),
        port: parseInt(port) || 3000,
      });
      toast({ title: "Connecting to mixer..." });
      onDone?.();
    } catch (e: any) {
      setError(e.message || "Connection failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">
          Mixer IP Address
        </label>
        <input
          type="text"
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          placeholder="192.168.1.100"
          className="w-full rounded-xl px-4 py-3 text-base"
          style={{
            background: "hsl(220 15% 16%)",
            border: "1px solid hsl(220 15% 26%)",
            color: "#fff",
            outline: "none",
          }}
          data-testid="input-mixer-ip"
          onKeyDown={(e) => e.key === "Enter" && handleConnect()}
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 uppercase tracking-wider mb-1.5">
          TCP Port
        </label>
        <input
          type="number"
          value={port}
          onChange={(e) => setPort(e.target.value)}
          className="w-full rounded-xl px-4 py-3 text-base"
          style={{
            background: "hsl(220 15% 16%)",
            border: "1px solid hsl(220 15% 26%)",
            color: "#fff",
            outline: "none",
          }}
          data-testid="input-mixer-port"
          onKeyDown={(e) => e.key === "Enter" && handleConnect()}
        />
      </div>
      {error && (
        <div
          className="text-sm rounded-xl px-4 py-3"
          style={{
            background: "hsl(0 60% 12%)",
            color: "#f87171",
            border: "1px solid hsl(0 60% 24%)",
          }}
        >
          {error}
        </div>
      )}
      <button
        onClick={handleConnect}
        disabled={busy}
        className="w-full rounded-xl py-4 font-bold text-white text-base tracking-wide transition-all"
        style={{
          background: busy ? "hsl(30 100% 35%)" : "hsl(30 100% 52%)",
        }}
        data-testid="button-connect"
      >
        {busy ? "Connecting..." : "Connect to Mixer"}
      </button>
    </div>
  );
}

type Tab = "channels" | "matrix" | "presets";

const MONO_IN_COLOR = "hsl(220 70% 42%)";
const STEREO_IN_COLOR = "hsl(270 60% 48%)";
const MONO_OUT_COLOR = "hsl(140 55% 33%)";
const REC_OUT_COLOR = "hsl(0 65% 42%)";

export default function Home() {
  const state = useMixerWs();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("channels");
  const [showSettings, setShowSettings] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [serverInfo, setServerInfo] = useState<{
    lanIP?: string;
    port?: number;
  } | null>(null);

  const serverInfoFetchedRef = useRef(false);
  if (!serverInfoFetchedRef.current) {
    serverInfoFetchedRef.current = true;
    fetch("/api/info")
      .then((r) => r.json())
      .then((d) => setServerInfo(d))
      .catch(() => {});
  }

  const setFader = useCallback(
    (attr: number, ch: number, pos: number) => {
      api("/api/fader", { attr, ch, position: pos }).catch(() => {});
    },
    []
  );

  const toggleOnOff = useCallback(
    (attr: number, ch: number, currentOn: boolean) => {
      api("/api/onoff", { attr, ch, on: !currentOn }).catch(() => {});
    },
    []
  );

  const toggleInputMatrix = useCallback(
    (srcIdx: number, bus: number) => {
      const srcAttr = srcIdx < 8 ? 0 : 1;
      const srcCh = srcIdx < 8 ? srcIdx : srcIdx - 8;
      const currentOn = state.inputMatrix[srcIdx]?.[bus] ?? false;
      api("/api/matrix/input", {
        srcAttr,
        srcCh,
        bus,
        on: !currentOn,
      }).catch(() => {});
    },
    [state.inputMatrix]
  );

  const setInputGain = useCallback(
    (srcIdx: number, bus: number, val: number) => {
      const srcAttr = srcIdx < 8 ? 0 : 1;
      const srcCh = srcIdx < 8 ? srcIdx : srcIdx - 8;
      api("/api/matrix/input-gain", {
        srcAttr,
        srcCh,
        bus,
        value: val,
      }).catch(() => {});
    },
    []
  );

  const disconnectMixer = async () => {
    await api("/api/disconnect", {});
    toast({ title: "Disconnected from mixer" });
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "hsl(220 20% 7%)", color: "#e2e8f0" }}
    >
      <header
        className="flex items-center px-4 py-3 gap-3 shrink-0"
        style={{
          background: "hsl(220 20% 10%)",
          borderBottom: "1px solid hsl(220 15% 18%)",
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm"
            style={{ background: "hsl(30 100% 52%)" }}
          >
            M
          </div>
          <div>
            <div className="font-bold text-sm tracking-wide leading-none">
              M-864D
            </div>
            <div className="text-[9px] uppercase tracking-widest text-gray-500 mt-0.5">
              Mixer Controller
            </div>
          </div>
        </div>

        <div className="flex-1" />

        {state.connected ? (
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
            style={{
              background: "hsl(140 60% 8%)",
              border: "1px solid hsl(140 60% 22%)",
              color: "hsl(140 60% 55%)",
            }}
            data-testid="status-connected"
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{
                background: "hsl(140 60% 55%)",
                boxShadow: "0 0 6px hsl(140 60% 55%)",
                animation: "pulse 2s infinite",
              }}
            />
            {state.ip}:{state.port}
          </div>
        ) : (
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
            style={{
              background: "hsl(0 60% 8%)",
              border: "1px solid hsl(0 60% 22%)",
              color: "hsl(0 60% 55%)",
            }}
            data-testid="status-disconnected"
          >
            <WifiOff size={12} />
            Not connected
          </div>
        )}

        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 rounded-xl transition-all"
          style={{
            background: showSettings
              ? "hsl(30 100% 18%)"
              : "hsl(220 15% 16%)",
            color: showSettings ? "hsl(30 100% 60%)" : "#9ca3af",
          }}
          data-testid="button-settings"
        >
          <Settings size={18} />
        </button>
      </header>

      {showSettings && (
        <div
          className="shrink-0 p-4"
          style={{
            background: "hsl(220 20% 9%)",
            borderBottom: "1px solid hsl(220 15% 18%)",
          }}
        >
          <div className="max-w-sm mx-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold text-gray-300">
                Mixer Connection
              </span>
              {state.connected && (
                <button
                  onClick={disconnectMixer}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{
                    color: "#f87171",
                    border: "1px solid hsl(0 60% 24%)",
                    background: "hsl(0 60% 10%)",
                  }}
                  data-testid="button-disconnect"
                >
                  Disconnect
                </button>
              )}
            </div>
            <ConnectForm
              initialIp={state.ip}
              initialPort={state.port}
              onDone={() => setShowSettings(false)}
            />
            {serverInfo?.lanIP && (
              <div
                className="mt-4 p-3 rounded-xl"
                style={{
                  background: "hsl(220 15% 14%)",
                  border: "1px solid hsl(220 15% 22%)",
                }}
              >
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                  Network address for tablets
                </div>
                <div className="font-mono text-sm text-amber-400">
                  http://{serverInfo.lanIP}:{serverInfo.port}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!state.connected && !showSettings && !demoMode && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div
            className="w-full max-w-sm rounded-2xl p-8"
            style={{
              background: "hsl(220 20% 10%)",
              border: "1px solid hsl(220 15% 20%)",
            }}
          >
            <div className="text-center mb-6">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center font-black text-2xl mx-auto mb-4"
                style={{ background: "hsl(30 100% 52%)" }}
              >
                M
              </div>
              <h1 className="text-xl font-bold">M-864D Controller</h1>
              <p className="text-sm text-gray-400 mt-1">
                Enter the mixer's IP address to connect
              </p>
            </div>
            <ConnectForm />
            <div className="mt-4 flex items-center gap-3">
              <div className="h-px flex-1" style={{ background: "hsl(220 15% 22%)" }} />
              <span className="text-xs text-gray-600 uppercase tracking-wider">or</span>
              <div className="h-px flex-1" style={{ background: "hsl(220 15% 22%)" }} />
            </div>
            <button
              onClick={() => setDemoMode(true)}
              className="w-full mt-4 rounded-xl py-3 text-sm font-semibold transition-all"
              style={{
                background: "hsl(220 15% 16%)",
                color: "#9ca3af",
                border: "1px solid hsl(220 15% 26%)",
              }}
              data-testid="button-demo-mode"
            >
              Preview interface (no mixer)
            </button>
          </div>
        </div>
      )}

      {(state.connected || demoMode) && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {demoMode && !state.connected && (
            <div
              className="flex items-center justify-between px-4 py-2 text-xs shrink-0"
              style={{ background: "hsl(40 80% 12%)", borderBottom: "1px solid hsl(40 80% 22%)", color: "hsl(40 90% 65%)" }}
            >
              <span>Preview mode — controls are not connected to a real mixer</span>
              <button
                onClick={() => setDemoMode(false)}
                className="flex items-center gap-1 px-2 py-1 rounded hover:opacity-70"
                style={{ background: "hsl(40 80% 18%)", border: "1px solid hsl(40 80% 28%)" }}
              >
                <X size={11} /> Exit preview
              </button>
            </div>
          )}
          <div
            className="flex gap-1 px-4 pt-3 shrink-0"
            style={{ borderBottom: "1px solid hsl(220 15% 18%)" }}
          >
            {(["channels", "matrix", "presets"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-5 py-2 rounded-t-lg text-sm font-medium capitalize transition-all"
                style={{
                  background:
                    tab === t ? "hsl(220 15% 14%)" : "transparent",
                  color: tab === t ? "#e2e8f0" : "#6b7280",
                  borderBottom:
                    tab === t
                      ? "2px solid hsl(30 100% 52%)"
                      : "2px solid transparent",
                }}
                data-testid={`tab-${t}`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <div
            className="flex-1 overflow-auto p-4"
            style={{ background: "hsl(220 15% 10%)" }}
          >
            {tab === "channels" && (
              <div className="flex flex-col gap-6">
                <section>
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="h-px flex-1"
                      style={{ background: "hsl(220 15% 22%)" }}
                    />
                    <span
                      className="text-[10px] uppercase tracking-widest font-semibold px-2"
                      style={{ color: MONO_IN_COLOR }}
                    >
                      Mono Inputs 1–8
                    </span>
                    <div
                      className="h-px flex-1"
                      style={{ background: "hsl(220 15% 22%)" }}
                    />
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {Array.from({ length: 8 }, (_, i) => (
                      <ChannelStrip
                        key={i}
                        label={`IN ${i + 1}`}
                        position={state.monoInFader[i] ?? 0x35}
                        on={state.monoInOn[i] ?? true}
                        level={state.monoInLevel[i] ?? 0}
                        onFaderChange={(pos) => setFader(0, i, pos)}
                        onToggle={() =>
                          toggleOnOff(0, i, state.monoInOn[i] ?? true)
                        }
                        color={MONO_IN_COLOR}
                      />
                    ))}
                  </div>
                </section>

                <section>
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="h-px flex-1"
                      style={{ background: "hsl(220 15% 22%)" }}
                    />
                    <span
                      className="text-[10px] uppercase tracking-widest font-semibold px-2"
                      style={{ color: STEREO_IN_COLOR }}
                    >
                      Stereo Inputs 1–2
                    </span>
                    <div
                      className="h-px flex-1"
                      style={{ background: "hsl(220 15% 22%)" }}
                    />
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {Array.from({ length: 2 }, (_, i) => (
                      <ChannelStrip
                        key={i}
                        label={`ST ${i + 1}`}
                        position={state.stereoInFader[i] ?? 0x35}
                        on={state.stereoInOn[i] ?? true}
                        level={Math.max(
                          state.stereoInLevel[i * 2] ?? 0,
                          state.stereoInLevel[i * 2 + 1] ?? 0
                        )}
                        onFaderChange={(pos) => setFader(1, i, pos)}
                        onToggle={() =>
                          toggleOnOff(1, i, state.stereoInOn[i] ?? true)
                        }
                        color={STEREO_IN_COLOR}
                      />
                    ))}
                  </div>
                </section>

                <section>
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="h-px flex-1"
                      style={{ background: "hsl(220 15% 22%)" }}
                    />
                    <span
                      className="text-[10px] uppercase tracking-widest font-semibold px-2"
                      style={{ color: MONO_OUT_COLOR }}
                    >
                      Mono Outputs 1–4
                    </span>
                    <div
                      className="h-px flex-1"
                      style={{ background: "hsl(220 15% 22%)" }}
                    />
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {Array.from({ length: 4 }, (_, i) => (
                      <ChannelStrip
                        key={i}
                        label={`OUT ${i + 1}`}
                        position={state.monoOutFader[i] ?? 0x35}
                        on={state.monoOutOn[i] ?? true}
                        level={state.monoOutLevel[i] ?? 0}
                        onFaderChange={(pos) => setFader(2, i, pos)}
                        onToggle={() =>
                          toggleOnOff(2, i, state.monoOutOn[i] ?? true)
                        }
                        color={MONO_OUT_COLOR}
                      />
                    ))}
                  </div>
                </section>

                <section>
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="h-px flex-1"
                      style={{ background: "hsl(220 15% 22%)" }}
                    />
                    <span
                      className="text-[10px] uppercase tracking-widest font-semibold px-2"
                      style={{ color: REC_OUT_COLOR }}
                    >
                      Rec Out L/R
                    </span>
                    <div
                      className="h-px flex-1"
                      style={{ background: "hsl(220 15% 22%)" }}
                    />
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {[
                      { label: "REC L", i: 0 },
                      { label: "REC R", i: 1 },
                    ].map(({ label, i }) => (
                      <ChannelStrip
                        key={i}
                        label={label}
                        position={state.recOutFader[i] ?? 0x35}
                        on={state.recOutOn[i] ?? true}
                        level={0}
                        onFaderChange={(pos) => setFader(3, i, pos)}
                        onToggle={() =>
                          toggleOnOff(3, i, state.recOutOn[i] ?? true)
                        }
                        color={REC_OUT_COLOR}
                      />
                    ))}
                  </div>
                </section>
              </div>
            )}

            {tab === "matrix" && (
              <MatrixGrid
                state={state}
                onToggle={toggleInputMatrix}
                onGainChange={setInputGain}
              />
            )}

            {tab === "presets" && (
              <PresetsPanel currentPreset={state.currentPreset} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
