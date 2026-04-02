import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  Volume2, VolumeX, Volume1, Minus, Plus, Speaker as SpeakerIcon,
  AlertCircle, ArrowLeft, Trash2, PlusCircle, Pencil, X, Search, RefreshCw,
  CloudOff, Mic, Send, Radio, Settings, Users, ChevronDown, ChevronUp,
  Bookmark, LogOut, CheckCircle2, AlertTriangle, Wifi, WifiOff, Loader2,
  Bell, BellOff, Zap, Globe, PhoneCall, Phone, Clock, ListOrdered, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/auth";
import type { Room, Contact, Speaker as SpeakerType, SpeakerStatus, TtsPreset, Codec, TtsRoutingMode } from "@shared/schema";
import { SUPPORTED_LANGUAGES } from "@shared/schema";

const INPUT_CLS = "w-full px-4 py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FF8200] focus:border-transparent transition-all text-base";
const SELECT_CLS = "w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF8200] focus:border-transparent transition-all text-sm";

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function blankSpeaker(index: number): SpeakerType {
  return { id: generateId(), label: `Speaker ${index + 1}`, ipAddress: "", username: "", password: "" };
}

// ─── System Status Badge ──────────────────────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  if (status === "ok") return <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />;
  if (status === "checking") return <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block animate-pulse" />;
  if (status === "unconfigured") return <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />;
  return <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />;
}

function SystemStatusBar() {
  const [status, setStatus] = useState<any>(null);
  useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch("/api/system/status");
        if (res.ok) setStatus(await res.json());
      } catch {}
    }
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);
  if (!status) return null;
  const items = [
    { label: "Server", key: "server" },
    { label: "TTS", key: "tts" },
    { label: "PG", key: "pg" },
  ];
  function resolveStatus(val: any): string {
    if (val && typeof val === "object") return val.status ?? "unknown";
    return val as string;
  }
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {items.map(({ label, key }) => (
        <span key={key} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <StatusDot status={resolveStatus(status[key])} />
          {label}
        </span>
      ))}
    </div>
  );
}

// ─── AddContactDialog ─────────────────────────────────────────────────────────
function AddContactDialog({ onAdd, onCancel, editContact }: {
  onAdd: (contact: Contact) => void;
  onCancel: () => void;
  editContact?: Contact | null;
}) {
  const [name, setName] = useState(editContact?.name || "");
  const [mode, setMode] = useState<"direct" | "pg">(editContact?.mode || "direct");
  const [pgExtension, setPgExtension] = useState(editContact?.pgExtension || "");
  const [pgId, setPgId] = useState((editContact as any)?.pgId || "");
  const [codec, setCodec] = useState<string>(editContact?.codec || "");
  const [speakers, setSpeakers] = useState<SpeakerType[]>(
    editContact?.speakers?.length ? editContact.speakers : [blankSpeaker(0)]
  );
  const [gateways, setGateways] = useState<any[]>([]);

  useEffect(() => {
    apiFetch("/api/gateways").then((r) => r.ok ? r.json() : []).then(setGateways).catch(() => {});
  }, []);

  const updateSpeaker = (index: number, field: keyof SpeakerType, value: string) => {
    setSpeakers((prev) => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (mode === "direct") {
      const validSpeakers = speakers.filter((s) => s.ipAddress.trim());
      if (validSpeakers.length === 0) return;
      onAdd({
        id: editContact?.id || generateId(),
        name: name.trim(),
        mode: "direct",
        speakers: validSpeakers,
        pgExtension: "",
        codec: codec as Codec || undefined,
        syncMode: editContact?.syncMode ?? true,
      });
    } else {
      onAdd({
        id: editContact?.id || generateId(),
        name: name.trim(),
        mode: "pg",
        speakers: [],
        pgExtension: pgExtension.trim(),
        pgId: pgId || undefined,
        codec: codec as Codec || undefined,
        syncMode: false,
      } as Contact);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {editContact ? "Edit Contact" : "Add Contact"}
          </h2>
          <button onClick={onCancel} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Contact Name</label>
            <input
              data-testid="input-room-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Reception, Zone A, Lobby…"
              className={INPUT_CLS}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Mode</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "direct", label: "Direct SIP", desc: "Send to speaker IP", icon: Wifi },
                { value: "pg", label: "PG Gateway", desc: "Route via Paging Gateway", icon: PhoneCall },
              ].map(({ value, label, desc, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value as "direct" | "pg")}
                  className={`flex flex-col items-start gap-1 p-3 rounded-xl border-2 transition-all text-left ${mode === value
                    ? "border-[#FF8200] bg-[#FF8200]/5"
                    : "border-slate-200 dark:border-slate-600 hover:border-slate-300"}`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${mode === value ? "text-[#FF8200]" : "text-slate-400"}`} />
                    <span className={`text-sm font-semibold ${mode === value ? "text-[#FF8200]" : "text-slate-700 dark:text-slate-200"}`}>{label}</span>
                  </div>
                  <span className="text-xs text-slate-400">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {mode === "direct" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Speakers</label>
                {speakers.length < 8 && (
                  <button
                    type="button"
                    onClick={() => setSpeakers((prev) => [...prev, blankSpeaker(prev.length)])}
                    className="text-xs text-[#FF8200] font-semibold hover:text-[#e07200] flex items-center gap-1"
                  >
                    <PlusCircle className="w-3.5 h-3.5" /> Add Speaker
                  </button>
                )}
              </div>
              {speakers.map((spk, i) => (
                <div key={spk.id} className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 space-y-3 border border-slate-200 dark:border-slate-600">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Speaker {i + 1}</span>
                    {speakers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setSpeakers((prev) => prev.filter((_, idx) => idx !== i))}
                        className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <input
                    data-testid={`input-speaker-label-${i}`}
                    value={spk.label}
                    onChange={(e) => updateSpeaker(i, "label", e.target.value)}
                    placeholder="Label (e.g. Main Speaker)"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF8200]"
                  />
                  <input
                    data-testid={`input-speaker-ip-${i}`}
                    value={spk.ipAddress}
                    onChange={(e) => updateSpeaker(i, "ipAddress", e.target.value)}
                    placeholder="IP Address (e.g. 192.168.1.100)"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF8200]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      data-testid={`input-speaker-username-${i}`}
                      value={spk.username}
                      onChange={(e) => updateSpeaker(i, "username", e.target.value)}
                      placeholder="Username (optional)"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF8200]"
                    />
                    <input
                      data-testid={`input-speaker-password-${i}`}
                      type="password"
                      value={spk.password}
                      onChange={(e) => updateSpeaker(i, "password", e.target.value)}
                      placeholder="Password (optional)"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF8200]"
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {gateways.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Paging Gateway</label>
                  <select
                    value={pgId}
                    onChange={(e) => setPgId(e.target.value)}
                    className={SELECT_CLS}
                  >
                    <option value="">Auto (first configured)</option>
                    {gateways.map((gw) => (
                      <option key={gw.id} value={gw.id}>{gw.name} — {gw.address}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">PG Extension / Zone</label>
                <input
                  data-testid="input-pg-extension"
                  value={pgExtension}
                  onChange={(e) => setPgExtension(e.target.value)}
                  placeholder="e.g. 100, 200, zone-a"
                  className={INPUT_CLS}
                />
                <p className="text-xs text-slate-400 mt-1.5">Paging Gateways are configured in IT Settings</p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Codec Override <span className="text-slate-400 font-normal">(optional)</span></label>
            <select
              value={codec}
              onChange={(e) => setCodec(e.target.value)}
              className={SELECT_CLS}
            >
              <option value="">Use global default</option>
              <option value="PCMU">G.711u (PCMU)</option>
              <option value="PCMA">G.711a (PCMA)</option>
              <option value="G722">G.722 wideband</option>
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
            <Button
              type="submit"
              data-testid="button-save-room"
              className="flex-1 bg-[#FF8200] hover:bg-[#e07200] text-white"
            >
              {editContact ? "Save Changes" : "Add Contact"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Speaker Card ─────────────────────────────────────────────────────────────
function SpeakerCard({ speaker, status, pending, onVolumeSet, onVolumeInc, onVolumeDec, onMuteToggle }: {
  speaker: SpeakerType;
  status: SpeakerStatus | null;
  pending?: boolean;
  onVolumeSet: (v: number) => void;
  onVolumeInc: () => void;
  onVolumeDec: () => void;
  onMuteToggle: () => void;
}) {
  const [inputVol, setInputVol] = useState<string | null>(null);

  const hasAuth = !!speaker.username?.trim() && !!speaker.password?.trim();
  const connected = status?.connected !== false;
  const volume = status?.volume ?? null;
  const muted = status?.muteState === "mute";
  const maxVol = status?.max ?? 61;

  return (
    <div className={`bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3 space-y-2 relative ${pending ? "opacity-75" : ""}`}>
      {pending && (
        <div className="absolute inset-0 rounded-xl flex items-center justify-center bg-white/40 dark:bg-slate-800/40 z-10">
          <Loader2 className="w-5 h-5 animate-spin text-[#FF8200]" />
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{speaker.label}</div>
          <div className="text-xs text-slate-400">{speaker.ipAddress}</div>
          {status?.modelName && (
            <div className="text-xs text-slate-400">{status.modelName}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!hasAuth ? (
            <span className="text-xs text-amber-500 flex items-center gap-1">
              <VolumeX className="w-3 h-3" />TTS only
            </span>
          ) : !status ? (
            <span className="text-xs text-slate-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Connecting…</span>
          ) : !connected ? (
            <span className="text-xs text-red-500 flex items-center gap-1"><CloudOff className="w-3 h-3" />Offline</span>
          ) : (
            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />Online
            </span>
          )}
          {hasAuth && (
            <button
              onClick={onMuteToggle}
              disabled={!connected || !status}
              className={`p-1.5 rounded-lg transition-colors ${muted
                ? "bg-red-100 dark:bg-red-900/30 text-red-500"
                : "bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-500"}`}
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {hasAuth && connected && status && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <button onClick={onVolumeDec} className="p-1.5 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-lg hover:bg-slate-50">
              <Minus className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
            </button>
            <div className="flex-1 relative px-1">
              <input
                type="range"
                min={0}
                max={maxVol}
                value={inputVol !== null ? parseInt(inputVol) : (volume ?? 31)}
                onChange={(e) => setInputVol(e.target.value)}
                onMouseUp={() => { if (inputVol !== null) { onVolumeSet(parseInt(inputVol)); setInputVol(null); } }}
                onTouchEnd={() => { if (inputVol !== null) { onVolumeSet(parseInt(inputVol)); setInputVol(null); } }}
                className="w-full accent-[#FF8200]"
              />
            </div>
            <button onClick={onVolumeInc} className="p-1.5 bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-lg hover:bg-slate-50">
              <Plus className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
            </button>
            <span className="text-xs font-bold text-[#FF8200] w-7 text-right">{inputVol !== null ? inputVol : (volume ?? "–")}</span>
          </div>
          <div className="flex gap-1.5">
            {[{ label: "Low", value: 15 }, { label: "Mid", value: 31 }, { label: "High", value: 48 }].map((p) => (
              <button
                key={p.label}
                onClick={() => onVolumeSet(p.value)}
                className="flex-1 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 text-slate-600 dark:text-slate-200 hover:bg-[#FF8200]/10 hover:text-[#FF8200] hover:border-[#FF8200]/30 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Contact Panel (Volume Control) ──────────────────────────────────────────
function RoomPanel({ room, isAdmin, onEdit, onDelete }: {
  room: Contact;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { toast } = useToast();
  const [statuses, setStatuses] = useState<Record<string, SpeakerStatus>>({});
  const [syncMode, setSyncMode] = useState(room.syncMode ?? true);
  const [expanded, setExpanded] = useState(true);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  // Track optimistically-set values so status polls don't overwrite them
  // (IP-A1 status endpoint returns stale data after set commands)
  const optimisticOverrides = useRef<Record<string, Partial<SpeakerStatus>>>({});

  const fetchStatus = useCallback(async () => {
    if (!room.speakers?.length) return;
    const results = await Promise.allSettled(
      room.speakers.map((s) => {
        if (!s.username?.trim() || !s.password?.trim()) {
          return Promise.resolve({ connected: true, noAuth: true, volume: null, muteState: "unmute" });
        }
        return apiFetch("/api/speaker/status", {
          method: "POST",
          body: JSON.stringify({ ipAddress: s.ipAddress, username: s.username, password: s.password }),
        }).then((r) => r.json());
      })
    );
    const newStatuses: Record<string, SpeakerStatus> = {};
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        const spkId = room.speakers[i].id;
        const overrides = optimisticOverrides.current[spkId] ?? {};
        // Merge: use real status for connected/model info, preserve optimistic volume/mute
        newStatuses[spkId] = { ...r.value, ...overrides };
      }
    });
    setStatuses(newStatuses);
  }, [room.speakers]);

  useEffect(() => {
    if (room.mode !== "pg" && room.speakers?.length) {
      fetchStatus();
      const interval = setInterval(fetchStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [fetchStatus, room.mode]);

  function applyOptimistic(spkId: string, patch: Partial<SpeakerStatus>) {
    // Persist overrides so fetchStatus polls don't clobber them
    optimisticOverrides.current[spkId] = {
      ...(optimisticOverrides.current[spkId] ?? {}),
      ...patch,
    };
    setStatuses((prev) => ({
      ...prev,
      [spkId]: { ...(prev[spkId] ?? {}), ...patch } as SpeakerStatus,
    }));
  }

  async function callSpeaker(spk: SpeakerType, endpoint: string, extra: Record<string, any>) {
    if (!spk.username?.trim() || !spk.password?.trim()) return;
    setPendingIds((prev) => new Set(prev).add(spk.id));
    let failed = false;
    try {
      const res = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({ ipAddress: spk.ipAddress, username: spk.username, password: spk.password, ...extra }),
      });
      if (!res.ok) {
        failed = true;
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        toast({ title: "Speaker error", description: err.error || "Failed to contact speaker", variant: "destructive" });
      }
    } catch (err: any) {
      failed = true;
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setPendingIds((prev) => { const s = new Set(prev); s.delete(spk.id); return s; });
      // Only refresh status on failure — the IP-A1 status endpoint returns stale
      // data immediately after a set, so on success we keep the optimistic value
      if (failed) fetchStatus();
    }
  }

  function setVolumeOptimistic(spk: SpeakerType, volume: number) {
    applyOptimistic(spk.id, { volume });
    callSpeaker(spk, "/api/speaker/volume/set", { volume });
  }

  function incVolumeOptimistic(spk: SpeakerType) {
    const cur = statuses[spk.id]?.volume ?? 31;
    const max = statuses[spk.id]?.max ?? 61;
    applyOptimistic(spk.id, { volume: Math.min(cur + 1, max) });
    callSpeaker(spk, "/api/speaker/volume/increment", {});
  }

  function decVolumeOptimistic(spk: SpeakerType) {
    const cur = statuses[spk.id]?.volume ?? 31;
    applyOptimistic(spk.id, { volume: Math.max(cur - 1, 0) });
    callSpeaker(spk, "/api/speaker/volume/decrement", {});
  }

  async function callAll(endpoint: string, extra: Record<string, any>) {
    await Promise.allSettled(room.speakers.map((s) => callSpeaker(s, endpoint, extra)));
  }

  function setAllVolumeOptimistic(volume: number) {
    room.speakers.forEach((s) => applyOptimistic(s.id, { volume }));
    callAll("/api/speaker/volume/set", { volume });
  }

  function incAllVolumeOptimistic() {
    room.speakers.forEach((s) => {
      const cur = statuses[s.id]?.volume ?? 31;
      const max = statuses[s.id]?.max ?? 61;
      applyOptimistic(s.id, { volume: Math.min(cur + 1, max) });
    });
    callAll("/api/speaker/volume/increment", {});
  }

  function decAllVolumeOptimistic() {
    room.speakers.forEach((s) => {
      const cur = statuses[s.id]?.volume ?? 31;
      applyOptimistic(s.id, { volume: Math.max(cur - 1, 0) });
    });
    callAll("/api/speaker/volume/decrement", {});
  }

  function setAllMuteOptimistic(state: "mute" | "unmute") {
    room.speakers.forEach((s) => applyOptimistic(s.id, { muteState: state }));
    callAll("/api/speaker/mute/set", { mute_state: state });
  }

  // PG contact: just show a card with extension info
  if (room.mode === "pg") {
    return (
      <Card className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-2xl overflow-hidden" data-testid={`card-room-${room.id}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
              <PhoneCall className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="font-semibold text-slate-900 dark:text-white text-sm">{room.name}</div>
              <div className="text-xs text-slate-400">PG Gateway • Ext: {room.pgExtension || "—"}</div>
            </div>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-1">
              <button data-testid={`button-edit-${room.id}`} onClick={onEdit} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400">
                <Pencil className="w-4 h-4" />
              </button>
              <button data-testid={`button-delete-${room.id}`} onClick={onDelete} className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        <CardContent className="p-4">
          <p className="text-xs text-slate-400 text-center py-2">PG contacts route through the gateway — no direct volume control.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-2xl overflow-hidden" data-testid={`card-room-${room.id}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
          <div className="w-8 h-8 bg-[#FF8200]/10 rounded-xl flex items-center justify-center">
            <SpeakerIcon className="w-4 h-4 text-[#FF8200]" />
          </div>
          <div>
            <div className="font-semibold text-slate-900 dark:text-white text-sm">{room.name}</div>
            <div className="text-xs text-slate-400">{room.speakers.length} speaker{room.speakers.length !== 1 ? "s" : ""}</div>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
        <div className="flex items-center gap-1">
          {room.speakers.length > 1 && (
            <button
              data-testid={`button-sync-${room.id}`}
              onClick={() => setSyncMode((v) => !v)}
              className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-colors ${syncMode ? "bg-[#FF8200]/10 text-[#FF8200]" : "bg-slate-100 dark:bg-slate-700 text-slate-500"}`}
            >
              {syncMode ? "Sync ON" : "Sync OFF"}
            </button>
          )}
          <button data-testid={`button-refresh-${room.id}`} onClick={fetchStatus} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400">
            <RefreshCw className="w-4 h-4" />
          </button>
          {isAdmin && (
            <>
              <button data-testid={`button-edit-${room.id}`} onClick={onEdit} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400">
                <Pencil className="w-4 h-4" />
              </button>
              <button data-testid={`button-delete-${room.id}`} onClick={onDelete} className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400">
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {expanded && (
        <CardContent className="p-4 space-y-3">
          {syncMode && room.speakers.length > 1 && (
            <div className="bg-[#FF8200]/5 border border-[#FF8200]/20 rounded-xl p-3 mb-1">
              <div className="text-xs font-semibold text-[#FF8200] mb-2">All Speakers (Sync Mode)</div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={decAllVolumeOptimistic} className="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl"><Minus className="w-4 h-4 text-slate-600 dark:text-slate-300" /></button>
                <button onClick={incAllVolumeOptimistic} className="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl"><Plus className="w-4 h-4 text-slate-600 dark:text-slate-300" /></button>
                {[{ label: "Low", value: 15 }, { label: "Normal", value: 31 }, { label: "Loud", value: 48 }].map((p) => (
                  <button key={p.label} onClick={() => setAllVolumeOptimistic(p.value)} className="flex-1 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-[#FF8200]/10 hover:text-[#FF8200] hover:border-[#FF8200]/30 transition-colors">
                    {p.label}
                  </button>
                ))}
                <button onClick={() => setAllMuteOptimistic("mute")} className="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-500"><VolumeX className="w-4 h-4" /></button>
                <button onClick={() => setAllMuteOptimistic("unmute")} className="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-500"><Volume2 className="w-4 h-4" /></button>
              </div>
            </div>
          )}

          {room.speakers.map((speaker) => (
            <SpeakerCard
              key={speaker.id}
              speaker={speaker}
              status={statuses[speaker.id] ?? null}
              pending={pendingIds.has(speaker.id)}
              onVolumeSet={(v) => setVolumeOptimistic(speaker, v)}
              onVolumeInc={() => incVolumeOptimistic(speaker)}
              onVolumeDec={() => decVolumeOptimistic(speaker)}
              onMuteToggle={() => {
                const current = statuses[speaker.id]?.muteState;
                const next = current === "mute" ? "unmute" : "mute";
                applyOptimistic(speaker.id, { muteState: next });
                callSpeaker(speaker, "/api/speaker/mute/set", { mute_state: next });
              }}
            />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

type ResultStep = { name: string; status: "ok" | "warning" | "error" | "skipped"; detail: string };

// ─── TTS Panel ────────────────────────────────────────────────────────────────
type JobState = {
  id: string;
  status: "queued" | "processing" | "done" | "error";
  progress: number;
  progressLabel: string;
  queuePosition: number;
  totalInQueue: number;
  result?: any;
  error?: string;
};

function TtsPanel({ contacts }: { contacts: Contact[] }) {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [primaryLang, setPrimaryLang] = useState("en-us");
  const [secondLangEnabled, setSecondLangEnabled] = useState(false);
  const [secondText, setSecondText] = useState("");
  const [secondLang, setSecondLang] = useState("fr");
  const [selectedContactId, setSelectedContactId] = useState("");
  const [codec, setCodec] = useState<Codec>("PCMU");
  const [dtmfDelay, setDtmfDelay] = useState(600);
  const [chimeEnabled, setChimeEnabled] = useState(false);
  const [chimeDelay, setChimeDelay] = useState(750);
  const [sending, setSending] = useState(false);
  const [jobState, setJobState] = useState<JobState | null>(null);
  const [lastResult, setLastResult] = useState<{ steps: ResultStep[]; simulated?: boolean } | null>(null);

  const [lastSentText, setLastSentText] = useState<string>(() => localStorage.getItem("voxnova_last_sent") || "");
  const [presets, setPresets] = useState<TtsPreset[]>(user?.presets || []);
  const [addingPreset, setAddingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [editPresetId, setEditPresetId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setPresets(user?.presets || []);
  }, [user?.presets]);

  useEffect(() => {
    if (contacts.length > 0 && !selectedContactId) {
      setSelectedContactId(contacts[0].id);
    }
  }, [contacts]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const selectedContact = contacts.find((c) => c.id === selectedContactId);

  async function handleSend(presetText?: string) {
    const finalText = presetText ?? text;
    if (!finalText.trim()) return;

    if (!selectedContactId) {
      toast({ title: "Select a contact", description: "Choose a contact to page", variant: "destructive" });
      return;
    }

    if (pollRef.current) clearInterval(pollRef.current);
    setSending(true);
    setLastResult(null);
    setJobState(null);

    try {
      const res = await apiFetch("/api/tts/send", {
        method: "POST",
        body: JSON.stringify({
          text: finalText.trim(),
          language: primaryLang,
          secondText: secondLangEnabled && secondText.trim() ? secondText.trim() : undefined,
          secondLanguage: secondLangEnabled && secondText.trim() ? secondLang : undefined,
          contactId: selectedContactId,
          codec,
          dtmfDelayMs: selectedContact?.mode === "pg" ? dtmfDelay : undefined,
          chimeEnabled: selectedContact?.mode === "pg" ? chimeEnabled : undefined,
          chimeDelayMs: selectedContact?.mode === "pg" && chimeEnabled ? chimeDelay : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Announcement failed", description: data.error, variant: "destructive" });
        setSending(false);
        return;
      }

      const { jobId } = data;

      // Poll for status every 400ms
      await new Promise<void>((resolve) => {
        pollRef.current = setInterval(async () => {
          try {
            const statusRes = await apiFetch(`/api/tts/job/${jobId}`);
            if (!statusRes.ok) { clearInterval(pollRef.current!); setSending(false); resolve(); return; }
            const status: JobState = await statusRes.json();
            setJobState(status);

            if (status.status === "done") {
              clearInterval(pollRef.current!);
              setLastResult({ steps: status.result?.steps || [], simulated: status.result?.simulated });
              if (!presetText) {
                setLastSentText(finalText);
                localStorage.setItem("voxnova_last_sent", finalText);
                setText("");
              }
              setSending(false);
              resolve();
            } else if (status.status === "error") {
              clearInterval(pollRef.current!);
              toast({ title: "Announcement failed", description: status.error, variant: "destructive" });
              setSending(false);
              resolve();
            }
          } catch {
            clearInterval(pollRef.current!);
            setSending(false);
            resolve();
          }
        }, 400);
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setSending(false);
    } finally {
      setJobState(null);
    }
  }

  async function savePreset() {
    if (!newPresetName.trim() || !text.trim()) return;
    try {
      const res = await apiFetch("/api/presets", {
        method: "POST",
        body: JSON.stringify({ name: newPresetName.trim(), text: text.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast({ title: "Error", description: err.error, variant: "destructive" });
        return;
      }
      await refreshUser();
      setNewPresetName("");
      setAddingPreset(false);
      toast({ title: "Preset saved" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function deletePreset(id: string) {
    try {
      await apiFetch(`/api/presets/${id}`, { method: "DELETE" });
      await refreshUser();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function updatePreset(id: string, name: string, presetText: string) {
    try {
      await apiFetch(`/api/presets/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name, text: presetText }),
      });
      await refreshUser();
      setEditPresetId(null);
      toast({ title: "Preset updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  return (
    <Card className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-700">
        <div className="w-9 h-9 bg-[#FF8200]/10 rounded-xl flex items-center justify-center">
          <Mic className="w-5 h-5 text-[#FF8200]" />
        </div>
        <div>
          <div className="font-bold text-slate-900 dark:text-white">TTS Paging</div>
          <div className="text-xs text-slate-400">Text-to-Speech announcement</div>
        </div>
      </div>

      <CardContent className="p-5 space-y-5">
        {/* Announcement text */}
        <div>
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Announcement Text</label>
          <textarea
            data-testid="input-tts-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type your announcement here…"
            rows={3}
            className={INPUT_CLS + " resize-none"}
            maxLength={2000}
          />
          <div className="flex items-center justify-between mt-1">
            {lastSentText && lastSentText !== text ? (
              <button
                data-testid="button-use-last-sent"
                onClick={() => setText(lastSentText)}
                className="flex items-center gap-1.5 max-w-[80%] text-left px-2.5 py-1 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 text-xs text-[#FF8200] font-medium hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors group"
                title="Click to re-use this message"
              >
                <RotateCcw className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{lastSentText}</span>
              </button>
            ) : (
              <span />
            )}
            <span className="text-xs text-slate-400 ml-auto pl-2">{text.length}/2000</span>
          </div>
        </div>

        {/* Second language block */}
        <div className="border border-dashed border-slate-200 dark:border-slate-600 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              <Globe className="w-4 h-4 text-slate-400" />
              Second Language
            </span>
            <button
              data-testid="button-second-lang-toggle"
              type="button"
              onClick={() => setSecondLangEnabled((v) => !v)}
              className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors relative ${secondLangEnabled ? "bg-[#FF8200]" : "bg-slate-200 dark:bg-slate-600"}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-[left] duration-150 ${secondLangEnabled ? "left-[22px]" : "left-[2px]"}`} />
            </button>
          </div>

          {!secondLangEnabled && (
            <p className="text-xs text-slate-400">Enable to play a second announcement in a different language immediately after the first.</p>
          )}

          {secondLangEnabled && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">First language</label>
                  <select
                    data-testid="select-primary-lang"
                    value={primaryLang}
                    onChange={(e) => setPrimaryLang(e.target.value)}
                    className={SELECT_CLS}
                  >
                    {SUPPORTED_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>{l.label}{l.extraPkg ? " ⚠" : ""}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Second language</label>
                  <select
                    data-testid="select-second-lang"
                    value={secondLang}
                    onChange={(e) => setSecondLang(e.target.value)}
                    className={SELECT_CLS}
                  >
                    {SUPPORTED_LANGUAGES.filter((l) => l.code !== primaryLang).map((l) => (
                      <option key={l.code} value={l.code}>{l.label}{l.extraPkg ? " ⚠" : ""}</option>
                    ))}
                  </select>
                </div>
              </div>
              {(() => {
                const pkgNeeded = [
                  SUPPORTED_LANGUAGES.find((l) => l.code === primaryLang)?.extraPkg,
                  SUPPORTED_LANGUAGES.find((l) => l.code === secondLang)?.extraPkg,
                ].filter(Boolean);
                return pkgNeeded.length > 0 ? (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>
                      One or more selected languages require extra Python packages:{" "}
                      <span className="font-mono font-semibold">{pkgNeeded.join(", ")}</span>.{" "}
                      Install with <span className="font-mono">pip install {pkgNeeded.join(" ")}</span> if the announcement fails.
                    </span>
                  </div>
                ) : null;
              })()}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Second announcement text <span className="text-slate-400 font-normal">({secondLang})</span>
                </label>
                <textarea
                  data-testid="input-second-text"
                  value={secondText}
                  onChange={(e) => setSecondText(e.target.value)}
                  placeholder={`Type the ${SUPPORTED_LANGUAGES.find((l) => l.code === secondLang)?.label ?? "second language"} announcement here…`}
                  rows={4}
                  className={INPUT_CLS + " resize-none"}
                  maxLength={2000}
                />
                <div className="text-right mt-0.5">
                  <span className="text-xs text-slate-400">{secondText.length}/2000</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Contact selector */}
        <div>
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Page To</label>
          {contacts.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 text-sm text-slate-400">
              <Radio className="w-4 h-4" />
              No contacts available — ask IT/Admin to set up contacts
            </div>
          ) : (
            <select
              data-testid="select-contact"
              value={selectedContactId}
              onChange={(e) => setSelectedContactId(e.target.value)}
              className={SELECT_CLS}
            >
              <option value="" disabled>Select a contact…</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.mode === "pg" ? `PG Ext: ${c.pgExtension || "—"}` : `${c.speakers?.length || 0} speaker${(c.speakers?.length || 0) !== 1 ? "s" : ""}`}
                </option>
              ))}
            </select>
          )}

          {selectedContact && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${selectedContact.mode === "pg"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"}`}>
                {selectedContact.mode === "pg" ? <PhoneCall className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
                {selectedContact.mode === "pg" ? "PG Gateway" : "Direct SIP"}
              </span>
              {selectedContact.codec && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  Codec: {selectedContact.codec}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Codec */}
        <div>
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">
            Audio Codec {selectedContact?.codec && <span className="text-xs text-slate-400 font-normal">(contact has override)</span>}
          </label>
          <div className="flex gap-2">
            {(["PCMU", "PCMA", "G722"] as Codec[]).map((c) => (
              <button
                key={c}
                data-testid={`button-codec-${c}`}
                onClick={() => setCodec(c)}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${codec === c
                  ? "border-[#FF8200] bg-[#FF8200]/10 text-[#FF8200]"
                  : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-slate-300"}`}
              >
                {c === "PCMU" ? "G.711u" : c === "PCMA" ? "G.711a" : "G.722"}
              </button>
            ))}
          </div>
        </div>

        {/* PG timing options — only shown for PG contacts */}
        {selectedContact?.mode === "pg" && (
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 space-y-4 border border-slate-200 dark:border-slate-600">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">PG Timing</div>

            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-sm font-medium text-slate-600 dark:text-slate-300">DTMF Delay</label>
                <span className="text-sm font-bold text-[#FF8200]">{dtmfDelay}ms</span>
              </div>
              <div className="px-1">
                <input
                  data-testid="input-dtmf-delay"
                  type="range"
                  min={200}
                  max={2000}
                  step={50}
                  value={dtmfDelay}
                  onChange={(e) => setDtmfDelay(Number(e.target.value))}
                  className="w-full accent-[#FF8200]"
                />
              </div>
              <div className="flex justify-between text-xs text-slate-400 mt-0.5"><span>200ms</span><span>2000ms</span></div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-600 dark:text-slate-300">Enable Chime</div>
                <div className="text-xs text-slate-400">Play tone before announcement</div>
              </div>
              <button
                data-testid="button-chime-toggle"
                type="button"
                onClick={() => setChimeEnabled((v) => !v)}
                className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors relative ${chimeEnabled ? "bg-[#FF8200]" : "bg-slate-200 dark:bg-slate-600"}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-[left] duration-150 ${chimeEnabled ? "left-[22px]" : "left-[2px]"}`} />
              </button>
            </div>

            {chimeEnabled && (
              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Post-Chime Delay</label>
                  <span className="text-sm font-bold text-[#FF8200]">{chimeDelay}ms</span>
                </div>
                <div className="px-1">
                  <input
                    data-testid="input-chime-delay"
                    type="range"
                    min={300}
                    max={10000}
                    step={50}
                    value={chimeDelay}
                    onChange={(e) => setChimeDelay(Number(e.target.value))}
                    className="w-full accent-[#FF8200]"
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-400 mt-0.5"><span>300ms</span><span>10000ms</span></div>
              </div>
            )}
          </div>
        )}

        {/* Queue / progress panel — shown while sending */}
        {sending && jobState && (
          <div className="rounded-2xl border-2 overflow-hidden"
            data-testid="tts-queue-panel"
            style={{ borderColor: jobState.status === "queued" ? "#94a3b8" : "#FF8200" }}>

            {/* Queue waiting state */}
            {jobState.status === "queued" && (
              <div className="bg-slate-50 dark:bg-slate-700/60 px-4 py-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 flex-shrink-0 bg-slate-200 dark:bg-slate-600 rounded-xl flex items-center justify-center">
                    <Clock className="w-5 h-5 text-slate-500 dark:text-slate-300" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-800 dark:text-white text-sm">
                      {jobState.queuePosition === 1 ? "Starting shortly…" : `You are #${jobState.queuePosition} in the queue`}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {jobState.totalInQueue > 1
                        ? `${jobState.totalInQueue - 1} announcement${jobState.totalInQueue - 1 !== 1 ? "s" : ""} ahead of you — your message will play automatically`
                        : "Waiting for the system to be ready…"}
                    </div>
                  </div>
                </div>
                {/* Queue position pips */}
                {jobState.totalInQueue > 1 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {Array.from({ length: Math.min(jobState.totalInQueue, 8) }).map((_, i) => (
                      <div key={i} className={`h-2 flex-1 min-w-[16px] rounded-full transition-colors ${i < jobState.queuePosition - 1 ? "bg-slate-300 dark:bg-slate-500" : i === jobState.queuePosition - 1 ? "bg-[#FF8200] animate-pulse" : "bg-slate-200 dark:bg-slate-600"}`} />
                    ))}
                    {jobState.totalInQueue > 8 && <span className="text-xs text-slate-400">+{jobState.totalInQueue - 8}</span>}
                  </div>
                )}
              </div>
            )}

            {/* Processing progress state */}
            {jobState.status === "processing" && (
              <div className="bg-[#FF8200]/5 dark:bg-[#FF8200]/10 px-4 py-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 flex-shrink-0 bg-[#FF8200]/10 rounded-xl flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-[#FF8200] animate-spin" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-800 dark:text-white text-sm">Sending Announcement</div>
                    <div className="text-xs text-[#FF8200] font-medium mt-0.5 truncate">{jobState.progressLabel}</div>
                  </div>
                  <div className="text-sm font-bold text-[#FF8200] flex-shrink-0">{jobState.progress}%</div>
                </div>
                {/* Progress bar */}
                <div className="h-2.5 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#FF8200] to-[#ffb347] rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${jobState.progress}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>Generating audio</span>
                  <span>Sending</span>
                  <span>Done</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Send button */}
        <Button
          data-testid="button-send-tts"
          onClick={() => handleSend()}
          disabled={sending || !text.trim() || !selectedContactId}
          className="w-full bg-[#FF8200] hover:bg-[#e07200] text-white rounded-xl py-3.5 text-base font-semibold shadow-md shadow-orange-100 disabled:opacity-60"
        >
          {sending
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {jobState?.status === "queued" ? `Queued (#${jobState.queuePosition})…` : "Sending…"}</>
            : <><Send className="w-4 h-4 mr-2" />Send Announcement</>}
        </Button>

        {/* Step-by-step result panel */}
        {lastResult && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-600 overflow-hidden" data-testid="tts-result-panel">
            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-600 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Announcement Result</span>
              </div>
              <button onClick={() => setLastResult(null)} className="text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {lastResult.steps.map((step, i) => {
                const dotCls =
                  step.status === "ok"      ? "bg-green-500" :
                  step.status === "warning" ? "bg-amber-400" :
                  step.status === "error"   ? "bg-red-500"   : "bg-slate-300";
                const labelCls =
                  step.status === "ok"      ? "text-green-600 dark:text-green-400" :
                  step.status === "warning" ? "text-amber-600 dark:text-amber-400" :
                  step.status === "error"   ? "text-red-600 dark:text-red-400"     : "text-slate-400";
                const statusLabel =
                  step.status === "ok"      ? "OK" :
                  step.status === "warning" ? "Pending" :
                  step.status === "error"   ? "Failed"  : "Skipped";
                return (
                  <div key={i} className="flex items-start gap-3 px-4 py-3">
                    <div className="flex-shrink-0 mt-1.5">
                      <span className={`block w-2.5 h-2.5 rounded-full ${dotCls}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{step.name}</span>
                        <span className={`text-xs font-bold ${labelCls}`}>{statusLabel}</span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{step.detail}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {lastResult.simulated && (
              <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-700">
                <span className="text-xs text-amber-600 dark:text-amber-400">Simulation mode — no real audio was sent</span>
              </div>
            )}
          </div>
        )}

        {/* Presets */}
        <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <Bookmark className="w-3.5 h-3.5" /> Presets ({presets.length}/5)
            </span>
            {presets.length < 5 && text.trim() && (
              <button
                data-testid="button-add-preset"
                onClick={() => setAddingPreset(true)}
                className="text-xs text-[#FF8200] font-semibold hover:text-[#e07200] flex items-center gap-1"
              >
                <PlusCircle className="w-3.5 h-3.5" /> Save as preset
              </button>
            )}
          </div>

          {addingPreset && (
            <div className="flex gap-2 mb-3">
              <input
                data-testid="input-preset-name"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="Preset name"
                className={INPUT_CLS + " text-sm py-2"}
              />
              <button onClick={savePreset} className="px-4 py-2 bg-[#FF8200] text-white rounded-xl text-sm font-semibold">Save</button>
              <button onClick={() => { setAddingPreset(false); setNewPresetName(""); }} className="px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-xl text-sm">Cancel</button>
            </div>
          )}

          {presets.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-3">No presets saved yet. Type a message and save it as a preset for quick access.</p>
          )}

          <div className="space-y-2">
            {presets.map((preset) => (
              <PresetRow
                key={preset.id}
                preset={preset}
                onSend={() => handleSend(preset.text)}
                onDelete={() => deletePreset(preset.id)}
                onUpdate={(name, t) => updatePreset(preset.id, name, t)}
                isEditing={editPresetId === preset.id}
                onEditStart={() => setEditPresetId(preset.id)}
                onEditCancel={() => setEditPresetId(null)}
                sending={sending}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PresetRow({ preset, onSend, onDelete, onUpdate, isEditing, onEditStart, onEditCancel, sending }: {
  preset: TtsPreset;
  onSend: () => void;
  onDelete: () => void;
  onUpdate: (name: string, text: string) => void;
  isEditing: boolean;
  onEditStart: () => void;
  onEditCancel: () => void;
  sending: boolean;
}) {
  const [name, setName] = useState(preset.name);
  const [text, setText] = useState(preset.text);

  if (isEditing) {
    return (
      <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3 space-y-2 border border-slate-200 dark:border-slate-600">
        <input data-testid={`input-edit-preset-name-${preset.id}`} value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF8200]" />
        <textarea data-testid={`input-edit-preset-text-${preset.id}`} value={text} onChange={(e) => setText(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF8200] resize-none" />
        <div className="flex gap-2">
          <button onClick={() => onUpdate(name, text)} className="px-3 py-1.5 bg-[#FF8200] text-white rounded-lg text-xs font-semibold">Save</button>
          <button onClick={onEditCancel} className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg text-xs">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700/50 rounded-xl px-3 py-2.5 border border-slate-100 dark:border-slate-600">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{preset.name}</div>
        <div className="text-xs text-slate-400 truncate">{preset.text}</div>
      </div>
      <button data-testid={`button-send-preset-${preset.id}`} onClick={onSend} disabled={sending} className="p-1.5 rounded-lg bg-[#FF8200]/10 text-[#FF8200] hover:bg-[#FF8200]/20 transition-colors">
        <Send className="w-3.5 h-3.5" />
      </button>
      <button data-testid={`button-edit-preset-${preset.id}`} onClick={onEditStart} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-400">
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button data-testid={`button-delete-preset-${preset.id}`} onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Global Presets Panel ─────────────────────────────────────────────────────
function GlobalPresetsPanel({ contacts }: { contacts: Contact[] }) {
  const { toast } = useToast();
  const [presets, setPresets] = useState<any[]>([]);
  const [playingPreset, setPlayingPreset] = useState<any>(null);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [selectedCodec, setSelectedCodec] = useState<"PCMU" | "PCMA" | "G722">("PCMU");
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadPresets() {
    try {
      const res = await apiFetch("/api/global-presets");
      if (res.ok) setPresets(await res.json());
    } catch {}
  }

  useEffect(() => { loadPresets(); }, []);

  const presetPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const hasGenerating = presets.some((p) => !p.audioReady && !p.audioError);
    if (hasGenerating) {
      if (!presetPollRef.current) presetPollRef.current = setInterval(loadPresets, 4000);
    } else {
      if (presetPollRef.current) { clearInterval(presetPollRef.current); presetPollRef.current = null; }
    }
    return () => { if (presetPollRef.current) { clearInterval(presetPollRef.current); presetPollRef.current = null; } };
  }, [presets]);

  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch(`/api/tts/job/${jobId}`);
        if (res.ok) {
          const s = await res.json();
          setJobStatus(s);
          if (s.status === "done" || s.status === "error") {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            if (s.status === "done") {
              toast({ title: "Priority announcement delivered!" });
            } else {
              toast({ title: "Playback failed", description: s.error, variant: "destructive" });
            }
            setTimeout(() => { setJobId(null); setJobStatus(null); }, 3000);
          }
        }
      } catch {}
    }, 800);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId]);

  async function handlePlay() {
    if (!playingPreset || !selectedContactId) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/global-presets/${playingPreset.id}/play`, {
        method: "POST",
        body: JSON.stringify({ contactId: selectedContactId, codec: selectedCodec }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast({ title: "Error", description: err.error, variant: "destructive" });
        return;
      }
      const data = await res.json();
      setJobId(data.jobId);
      setPlayingPreset(null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  if (presets.length === 0) return null;

  return (
    <>
      <Card className="border-2 border-[#FF8200]/30 bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
        <div className="bg-[#FF8200] px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-white" />
            <span className="font-bold text-white text-sm tracking-wide">GLOBAL PRIORITY PRESETS</span>
          </div>
          {jobId && jobStatus && (
            <span className="flex items-center gap-1.5 text-xs text-white/80">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {jobStatus.progressLabel}
            </span>
          )}
        </div>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => {
              const isReady = p.audioReady;
              const isGenerating = !p.audioReady && !p.audioError;
              return (
                <button
                  key={p.id}
                  data-testid={`button-play-global-preset-${p.id}`}
                  disabled={!isReady}
                  onClick={() => { setPlayingPreset(p); setSelectedContactId(contacts[0]?.id || ""); setSelectedCodec("PCMU"); }}
                  title={isGenerating ? "Audio is being generated…" : p.audioError ? p.audioError : p.name}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 font-semibold text-sm transition-colors ${
                    isReady
                      ? "border-[#FF8200]/40 bg-[#FF8200]/5 hover:bg-[#FF8200]/15 text-slate-800 dark:text-white"
                      : "border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-60"
                  }`}
                >
                  {isGenerating
                    ? <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                    : p.audioError
                      ? <AlertCircle className="w-4 h-4 text-red-400" />
                      : <Zap className="w-4 h-4 text-[#FF8200]" />}
                  {p.name}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
            Priority presets skip the generation queue and play immediately. Grayed-out presets are still generating.
          </p>
        </CardContent>
      </Card>

      {/* Play dialog */}
      {playingPreset && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-[#FF8200] rounded-2xl flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="font-bold text-slate-900 dark:text-white">{playingPreset.name}</div>
                <div className="text-xs text-[#FF8200] font-semibold uppercase tracking-wide">Priority Announcement</div>
              </div>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 bg-slate-50 dark:bg-slate-700 rounded-xl px-4 py-3 line-clamp-3">{playingPreset.text}</p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Send to</label>
                <select
                  value={selectedContactId}
                  onChange={(e) => setSelectedContactId(e.target.value)}
                  className={SELECT_CLS}
                >
                  <option value="">Select contact…</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Codec</label>
                <select
                  value={selectedCodec}
                  onChange={(e) => setSelectedCodec(e.target.value as any)}
                  className={SELECT_CLS}
                >
                  <option value="PCMU">PCMU (G.711 μ-law)</option>
                  <option value="PCMA">PCMA (G.711 A-law)</option>
                  <option value="G722">G.722</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setPlayingPreset(null)} className="flex-1 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
                Cancel
              </button>
              <button
                onClick={handlePlay}
                disabled={submitting || !selectedContactId}
                className="flex-1 px-4 py-3 rounded-xl bg-[#FF8200] hover:bg-[#e07200] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Play Now
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main Home Page ───────────────────────────────────────────────────────────
export default function Home() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showUserMenu, setShowUserMenu] = useState(false);

  const isAdmin = user?.role === "admin";
  const isIt = user?.role === "it";

  async function loadContacts() {
    try {
      const res = await apiFetch("/api/rooms");
      if (res.ok) setContacts(await res.json());
    } catch {}
  }

  useEffect(() => {
    loadContacts();
  }, []);

  async function saveContacts(updatedContacts: Contact[]) {
    try {
      const res = await apiFetch("/api/rooms", {
        method: "PUT",
        body: JSON.stringify(updatedContacts),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Save failed" }));
        toast({ title: "Save failed", description: err.error, variant: "destructive" });
        return;
      }
      setContacts(updatedContacts);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  function handleAddContact(contact: Contact) {
    const updated = editingContact
      ? contacts.map((c) => c.id === contact.id ? contact : c)
      : [...contacts, contact];
    saveContacts(updated);
    setShowAddContact(false);
    setEditingContact(null);
  }

  function handleDeleteContact(id: string) {
    if (!confirm("Delete this contact?")) return;
    saveContacts(contacts.filter((c) => c.id !== id));
  }

  const filteredContacts = contacts.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Navbar */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-8 h-8 bg-[#FF8200] rounded-xl flex items-center justify-center flex-shrink-0">
              <Radio className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-900 dark:text-white text-base sm:text-lg">IV VoxNova</span>
          </div>

          <div className="hidden sm:flex flex-1 justify-center">
            <SystemStatusBar />
          </div>

          <div className="flex items-center gap-1 sm:gap-2 relative">
            {(isAdmin || isIt) && (
              <>
                {isAdmin && (
                  <button
                    data-testid="button-admin-panel"
                    onClick={() => navigate("/admin")}
                    className="flex items-center gap-1.5 px-2.5 py-2 sm:px-3 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    <Users className="w-4 h-4" />
                    <span className="hidden sm:inline">Admin</span>
                  </button>
                )}
                {isIt && (
                  <button
                    data-testid="button-it-settings"
                    onClick={() => navigate("/it-settings")}
                    className="flex items-center gap-1.5 px-2.5 py-2 sm:px-3 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    <Settings className="w-4 h-4" />
                    <span className="hidden sm:inline">IT Settings</span>
                  </button>
                )}
              </>
            )}

            <button
              data-testid="button-user-menu"
              onClick={() => setShowUserMenu((v) => !v)}
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              <div className="w-7 h-7 bg-[#FF8200]/10 rounded-full flex items-center justify-center text-[#FF8200] font-bold text-xs flex-shrink-0">
                {user?.displayName?.[0]?.toUpperCase() || "U"}
              </div>
              <span className="hidden sm:inline truncate max-w-[100px]">{user?.displayName}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 top-12 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl w-52 py-1 z-50">
                <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-700">
                  <div className="text-sm font-semibold text-slate-800 dark:text-white">{user?.displayName}</div>
                  <div className="text-xs text-slate-400 capitalize">{user?.role}</div>
                </div>
                <div className="sm:hidden px-4 py-2 border-b border-slate-100 dark:border-slate-700">
                  <SystemStatusBar />
                </div>
                <button
                  data-testid="button-logout"
                  onClick={() => { logout(); navigate("/login"); }}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <LogOut className="w-4 h-4" /> Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {user?.ttsEnabled && <TtsPanel contacts={contacts} />}

        <GlobalPresetsPanel contacts={contacts} />

        {/* Volume / Contacts section */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <SpeakerIcon className="w-5 h-5 text-[#FF8200]" /> Volume Control
            </h2>
            <div className="flex items-center gap-2 flex-1 justify-end">
              <div className="relative flex-1 sm:flex-none">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  data-testid="input-search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search…"
                  className="pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF8200] w-full sm:w-40"
                />
              </div>
              {(isAdmin || isIt) && (
                <Button
                  data-testid="button-add-room"
                  onClick={() => { setEditingContact(null); setShowAddContact(true); }}
                  className="bg-[#FF8200] hover:bg-[#e07200] text-white rounded-xl text-sm font-semibold px-3 sm:px-4 py-2 flex-shrink-0"
                >
                  <PlusCircle className="w-4 h-4 sm:mr-1.5" /><span className="hidden sm:inline">Add Contact</span>
                </Button>
              )}
            </div>
          </div>

          {filteredContacts.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Radio className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No contacts yet</p>
              <p className="text-sm mt-1">{isAdmin || isIt ? "Add a contact to get started." : "No contacts have been assigned to your account."}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredContacts.map((contact) => (
                <RoomPanel
                  key={contact.id}
                  room={contact}
                  isAdmin={isAdmin || isIt}
                  onEdit={() => { setEditingContact(contact); setShowAddContact(true); }}
                  onDelete={() => handleDeleteContact(contact.id)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {showAddContact && (
        <AddContactDialog
          onAdd={handleAddContact}
          onCancel={() => { setShowAddContact(false); setEditingContact(null); }}
          editContact={editingContact}
        />
      )}

      {showUserMenu && (
        <div className="fixed inset-0 z-30" onClick={() => setShowUserMenu(false)} />
      )}
    </div>
  );
}
