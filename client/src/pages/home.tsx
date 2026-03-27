import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  Volume2, VolumeX, Volume1, Minus, Plus, Speaker as SpeakerIcon,
  AlertCircle, ArrowLeft, Trash2, PlusCircle, Pencil, X, Search, RefreshCw,
  CloudOff, Mic, Send, Radio, Settings, Users, ChevronDown, ChevronUp,
  Bookmark, LogOut, CheckCircle2, AlertTriangle, Wifi, WifiOff, Loader2,
  Bell, BellOff, Zap, Globe, Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/auth";
import type { Room, Speaker as SpeakerType, SpeakerStatus, TtsPreset, Codec, TtsRoutingMode } from "@shared/schema";

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
    { label: "SIP", key: "sip" },
    { label: "PG", key: "pg" },
  ];
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {items.map(({ label, key }) => (
        <span key={key} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <StatusDot status={status[key]} />
          {label}
        </span>
      ))}
    </div>
  );
}

// ─── AddRoomDialog ────────────────────────────────────────────────────────────
function AddRoomDialog({ onAdd, onCancel, editRoom }: {
  onAdd: (room: Room) => void;
  onCancel: () => void;
  editRoom?: Room | null;
}) {
  const [name, setName] = useState(editRoom?.name || "");
  const [speakers, setSpeakers] = useState<SpeakerType[]>(
    editRoom?.speakers?.length ? editRoom.speakers : [blankSpeaker(0)]
  );

  const updateSpeaker = (index: number, field: keyof SpeakerType, value: string) => {
    setSpeakers((prev) => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const validSpeakers = speakers.filter((s) => s.ipAddress.trim() && s.username.trim() && s.password.trim());
    if (validSpeakers.length === 0) return;
    onAdd({
      id: editRoom?.id || generateId(),
      name: name.trim(),
      speakers: validSpeakers,
      syncMode: editRoom?.syncMode ?? true,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {editRoom ? "Edit Room" : "Add Room"}
          </h2>
          <button onClick={onCancel} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Room Name</label>
            <input data-testid="input-room-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Main Office" className={INPUT_CLS} />
          </div>

          {speakers.map((speaker, idx) => (
            <div key={speaker.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Speaker {idx + 1}</span>
                {speakers.length > 1 && (
                  <button type="button" onClick={() => setSpeakers((prev) => prev.filter((_, i) => i !== idx))} className="p-1 rounded-lg hover:bg-red-50 text-red-400">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <input data-testid={`input-speaker-label-${idx}`} value={speaker.label} onChange={(e) => updateSpeaker(idx, "label", e.target.value)} placeholder="Label" className={INPUT_CLS} />
              <input data-testid={`input-speaker-ip-${idx}`} value={speaker.ipAddress} onChange={(e) => updateSpeaker(idx, "ipAddress", e.target.value)} placeholder="IP Address" className={INPUT_CLS} />
              <div className="grid grid-cols-2 gap-2">
                <input data-testid={`input-speaker-user-${idx}`} value={speaker.username} onChange={(e) => updateSpeaker(idx, "username", e.target.value)} placeholder="Username" className={INPUT_CLS} />
                <input data-testid={`input-speaker-pass-${idx}`} type="password" value={speaker.password} onChange={(e) => updateSpeaker(idx, "password", e.target.value)} placeholder="Password" className={INPUT_CLS} />
              </div>
            </div>
          ))}

          <button type="button" onClick={() => setSpeakers((prev) => [...prev, blankSpeaker(prev.length)])} className="flex items-center gap-2 text-sm text-[#FF8200] hover:text-[#e07200] font-medium">
            <PlusCircle className="w-4 h-4" /> Add Speaker
          </button>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
            <Button type="submit" className="flex-1 bg-[#FF8200] hover:bg-[#e07200] text-white" data-testid="button-save-room">
              {editRoom ? "Save Changes" : "Add Room"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── SpeakerCard ──────────────────────────────────────────────────────────────
function SpeakerCard({ speaker, status, onVolumeSet, onVolumeInc, onVolumeDec, onMuteToggle }: {
  speaker: SpeakerType;
  status: SpeakerStatus | null;
  onVolumeSet: (v: number) => void;
  onVolumeInc: () => void;
  onVolumeDec: () => void;
  onMuteToggle: () => void;
}) {
  const isMuted = status?.muteState === "mute";
  const volume = status?.volume ?? 31;
  const isConnected = status?.connected ?? false;

  return (
    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 space-y-3 border border-slate-200 dark:border-slate-600">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-sm text-slate-800 dark:text-white">{speaker.label}</div>
          <div className="text-xs text-slate-400">{speaker.ipAddress}</div>
        </div>
        <div className="flex items-center gap-1.5">
          {isConnected
            ? <Wifi className="w-3.5 h-3.5 text-green-500" />
            : <WifiOff className="w-3.5 h-3.5 text-red-400" />}
          <button
            data-testid={`button-mute-${speaker.id}`}
            onClick={onMuteToggle}
            className={`p-2 rounded-xl transition-colors ${isMuted
              ? "bg-red-100 dark:bg-red-900/30 text-red-500"
              : "bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300"}`}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isConnected && (
        <>
          <div className="flex items-center gap-3">
            <button data-testid={`button-vol-dec-${speaker.id}`} onClick={onVolumeDec} className="p-2 bg-slate-200 dark:bg-slate-600 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-500">
              <Minus className="w-4 h-4" />
            </button>
            <Slider
              value={[volume]}
              min={0}
              max={61}
              step={1}
              onValueChange={(v) => onVolumeSet(v[0])}
              className="flex-1"
              data-testid={`slider-volume-${speaker.id}`}
            />
            <button data-testid={`button-vol-inc-${speaker.id}`} onClick={onVolumeInc} className="p-2 bg-slate-200 dark:bg-slate-600 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-500">
              <Plus className="w-4 h-4" />
            </button>
            <span className="w-8 text-right text-sm font-bold text-slate-700 dark:text-slate-200 tabular-nums">{volume}</span>
          </div>

          <div className="flex gap-2">
            {[{ label: "Low", value: 15 }, { label: "Normal", value: 31 }, { label: "Loud", value: 48 }].map((p) => (
              <button
                key={p.label}
                data-testid={`button-preset-vol-${p.label.toLowerCase()}-${speaker.id}`}
                onClick={() => onVolumeSet(p.value)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${volume === p.value
                  ? "bg-[#FF8200] text-white"
                  : "bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-300"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}

      {!isConnected && status !== null && (
        <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
          <CloudOff className="w-3.5 h-3.5" /> Unreachable
        </div>
      )}
    </div>
  );
}

// ─── RoomPanel ────────────────────────────────────────────────────────────────
function RoomPanel({ room, onEdit, onDelete, isAdmin }: {
  room: Room;
  onEdit: () => void;
  onDelete: () => void;
  isAdmin: boolean;
}) {
  const { toast } = useToast();
  const [statuses, setStatuses] = useState<Record<string, SpeakerStatus | null>>({});
  const [syncMode, setSyncMode] = useState(room.syncMode);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    const results = await Promise.all(
      room.speakers.map(async (s) => {
        try {
          const res = await apiFetch("/api/speaker/status", {
            method: "POST",
            body: JSON.stringify({ ipAddress: s.ipAddress, username: s.username, password: s.password }),
          });
          if (!res.ok) return [s.id, null];
          return [s.id, await res.json()];
        } catch {
          return [s.id, null];
        }
      })
    );
    setStatuses(Object.fromEntries(results));
  }, [room.speakers]);

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 30000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchStatus]);

  const callSpeaker = async (speaker: SpeakerType, endpoint: string, body: object) => {
    try {
      const res = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({ ipAddress: speaker.ipAddress, username: speaker.username, password: speaker.password, ...body }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast({ title: "Error", description: err.error, variant: "destructive" });
        return;
      }
      await fetchStatus();
    } catch (e: any) {
      toast({ title: "Network error", description: e.message, variant: "destructive" });
    }
  };

  const callAll = async (endpoint: string, body: object) => {
    await Promise.all(room.speakers.map((s) => callSpeaker(s, endpoint, body)));
  };

  return (
    <Card className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#FF8200]/10 rounded-xl flex items-center justify-center">
            <SpeakerIcon className="w-5 h-5 text-[#FF8200]" />
          </div>
          <div>
            <div className="font-bold text-slate-900 dark:text-white">{room.name}</div>
            <div className="text-xs text-slate-400">{room.speakers.length} speaker{room.speakers.length > 1 ? "s" : ""}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {room.speakers.length > 1 && (
            <button
              data-testid={`button-sync-${room.id}`}
              onClick={() => setSyncMode((v) => !v)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${syncMode ? "bg-[#FF8200]/10 text-[#FF8200]" : "bg-slate-100 dark:bg-slate-700 text-slate-500"}`}
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

      <CardContent className="p-4 space-y-3">
        {syncMode && room.speakers.length > 1 && (
          <div className="bg-[#FF8200]/5 border border-[#FF8200]/20 rounded-xl p-3 mb-1">
            <div className="text-xs font-semibold text-[#FF8200] mb-2">All Speakers (Sync Mode)</div>
            <div className="flex gap-2">
              <button onClick={() => callAll("/api/speaker/volume/decrement", {})} className="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl"><Minus className="w-4 h-4 text-slate-600 dark:text-slate-300" /></button>
              <button onClick={() => callAll("/api/speaker/volume/increment", {})} className="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl"><Plus className="w-4 h-4 text-slate-600 dark:text-slate-300" /></button>
              {[{ label: "Low", value: 15 }, { label: "Normal", value: 31 }, { label: "Loud", value: 48 }].map((p) => (
                <button key={p.label} onClick={() => callAll("/api/speaker/volume/set", { volume: p.value })} className="flex-1 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-[#FF8200]/10 hover:text-[#FF8200] hover:border-[#FF8200]/30 transition-colors">
                  {p.label}
                </button>
              ))}
              <button onClick={() => callAll("/api/speaker/mute/set", { mute_state: "mute" })} className="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-500"><VolumeX className="w-4 h-4" /></button>
              <button onClick={() => callAll("/api/speaker/mute/set", { mute_state: "unmute" })} className="p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-500"><Volume2 className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {room.speakers.map((speaker) => (
          <SpeakerCard
            key={speaker.id}
            speaker={speaker}
            status={statuses[speaker.id] ?? null}
            onVolumeSet={(v) => callSpeaker(speaker, "/api/speaker/volume/set", { volume: v })}
            onVolumeInc={() => callSpeaker(speaker, "/api/speaker/volume/increment", {})}
            onVolumeDec={() => callSpeaker(speaker, "/api/speaker/volume/decrement", {})}
            onMuteToggle={() => {
              const current = statuses[speaker.id]?.muteState;
              callSpeaker(speaker, "/api/speaker/mute/set", { mute_state: current === "mute" ? "unmute" : "mute" });
            }}
          />
        ))}
      </CardContent>
    </Card>
  );
}

// ─── TTS Panel ────────────────────────────────────────────────────────────────
function TtsPanel() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<TtsRoutingMode>("direct");
  const [targetAddress, setTargetAddress] = useState("");
  const [pgExtension, setPgExtension] = useState("");
  const [codec, setCodec] = useState<Codec>("PCMU");
  const [dtmfDelay, setDtmfDelay] = useState(600);
  const [chimeEnabled, setChimeEnabled] = useState(false);
  const [chimeDelay, setChimeDelay] = useState(750);
  const [sending, setSending] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [presets, setPresets] = useState<TtsPreset[]>(user?.presets || []);
  const [addingPreset, setAddingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [editPresetId, setEditPresetId] = useState<string | null>(null);

  useEffect(() => {
    setPresets(user?.presets || []);
  }, [user?.presets]);

  async function handleSend(presetText?: string) {
    const finalText = presetText ?? text;
    if (!finalText.trim()) return;
    if (!targetAddress.trim()) {
      toast({ title: "Target required", description: "Enter a speaker IP or PG address", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const res = await apiFetch("/api/tts/send", {
        method: "POST",
        body: JSON.stringify({
          text: finalText.trim(),
          mode,
          targetAddress: targetAddress.trim(),
          pgExtension: mode === "pg" ? pgExtension.trim() : undefined,
          codec,
          dtmfDelayMs: mode === "pg" ? dtmfDelay : undefined,
          chimeEnabled: mode === "pg" ? chimeEnabled : undefined,
          chimeDelayMs: mode === "pg" && chimeEnabled ? chimeDelay : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Announcement failed", description: data.error, variant: "destructive" });
        return;
      }

      toast({
        title: data.simulated ? "Simulated (TTS not installed)" : "Announcement sent",
        description: data.simulated
          ? "Kokoro TTS not installed — see IT Settings for setup instructions."
          : "Your message was transmitted.",
      });
      if (!presetText) setText("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
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
        {/* Text input */}
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
          <div className="text-right text-xs text-slate-400 mt-1">{text.length}/2000</div>
        </div>

        {/* Routing mode */}
        <div>
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Routing Mode</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: "direct", label: "Direct SIP", icon: Wifi, desc: "Peer-to-peer to speaker" },
              { value: "pg", label: "PG Gateway", icon: Radio, desc: "Via IP-A1PG multicast" },
            ].map(({ value, label, icon: Icon, desc }) => (
              <button
                key={value}
                data-testid={`button-mode-${value}`}
                onClick={() => setMode(value as TtsRoutingMode)}
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

        {/* Target address */}
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              {mode === "direct" ? "Speaker IP Address" : "PG Server Address"}
            </label>
            <input
              data-testid="input-target-address"
              value={targetAddress}
              onChange={(e) => setTargetAddress(e.target.value)}
              placeholder={mode === "direct" ? "192.168.1.100" : "192.168.1.50"}
              className={INPUT_CLS}
            />
          </div>
          {mode === "pg" && (
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                <Hash className="w-3.5 h-3.5 inline mr-1" />Zone Extension / DTMF
              </label>
              <input
                data-testid="input-pg-extension"
                value={pgExtension}
                onChange={(e) => setPgExtension(e.target.value)}
                placeholder="e.g., 1 for Zone 1"
                className={INPUT_CLS}
              />
            </div>
          )}
        </div>

        {/* Codec */}
        <div>
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Audio Codec</label>
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

        {/* PG delays */}
        {mode === "pg" && (
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 space-y-4 border border-slate-200 dark:border-slate-600">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">PG Timing</div>

            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-sm font-medium text-slate-600 dark:text-slate-300">DTMF Delay</label>
                <span className="text-sm font-bold text-[#FF8200]">{dtmfDelay}ms</span>
              </div>
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
              <div className="flex justify-between text-xs text-slate-400 mt-0.5"><span>200ms</span><span>2000ms</span></div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-600 dark:text-slate-300">Enable Chime</div>
                <div className="text-xs text-slate-400">Play tone before announcement</div>
              </div>
              <button
                data-testid="button-chime-toggle"
                onClick={() => setChimeEnabled((v) => !v)}
                className={`w-12 h-6 rounded-full transition-colors relative ${chimeEnabled ? "bg-[#FF8200]" : "bg-slate-200 dark:bg-slate-600"}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${chimeEnabled ? "translate-x-6" : "translate-x-0.5"}`} />
              </button>
            </div>

            {chimeEnabled && (
              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Post-Chime Delay</label>
                  <span className="text-sm font-bold text-[#FF8200]">{chimeDelay}ms</span>
                </div>
                <input
                  data-testid="input-chime-delay"
                  type="range"
                  min={300}
                  max={3000}
                  step={50}
                  value={chimeDelay}
                  onChange={(e) => setChimeDelay(Number(e.target.value))}
                  className="w-full accent-[#FF8200]"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-0.5"><span>300ms</span><span>3000ms</span></div>
              </div>
            )}
          </div>
        )}

        {/* Send button */}
        <Button
          data-testid="button-send-tts"
          onClick={() => handleSend()}
          disabled={sending || !text.trim()}
          className="w-full bg-[#FF8200] hover:bg-[#e07200] text-white rounded-xl py-3 text-base font-semibold shadow-md shadow-orange-100"
        >
          {sending
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending…</>
            : <><Send className="w-4 h-4 mr-2" />Send Announcement</>}
        </Button>

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

// ─── Main Home Page ───────────────────────────────────────────────────────────
export default function Home() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showUserMenu, setShowUserMenu] = useState(false);

  const isAdmin = user?.role === "admin";
  const isIt = user?.role === "it";

  async function loadRooms() {
    try {
      const res = await apiFetch("/api/rooms");
      if (res.ok) setRooms(await res.json());
    } catch {}
  }

  useEffect(() => {
    loadRooms();
  }, []);

  async function saveRooms(updatedRooms: Room[]) {
    try {
      const res = await apiFetch("/api/rooms", {
        method: "PUT",
        body: JSON.stringify(updatedRooms),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Save failed" }));
        toast({ title: "Save failed", description: err.error, variant: "destructive" });
        return;
      }
      setRooms(updatedRooms);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  function handleAddRoom(room: Room) {
    const updated = editingRoom
      ? rooms.map((r) => r.id === room.id ? room : r)
      : [...rooms, room];
    saveRooms(updated);
    setShowAddRoom(false);
    setEditingRoom(null);
  }

  function handleDeleteRoom(id: string) {
    if (!confirm("Delete this room?")) return;
    saveRooms(rooms.filter((r) => r.id !== id));
  }

  const filteredRooms = rooms.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Navbar */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#FF8200] rounded-xl flex items-center justify-center">
              <Radio className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="font-bold text-slate-900 dark:text-white text-lg">REPIT</span>
          </div>

          <SystemStatusBar />

          <div className="flex items-center gap-2 relative">
            {(isAdmin || isIt) && (
              <>
                {isAdmin && (
                  <button
                    data-testid="button-admin-panel"
                    onClick={() => navigate("/admin")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    <Users className="w-4 h-4" />
                    <span className="hidden sm:inline">Admin</span>
                  </button>
                )}
                {isIt && (
                  <button
                    data-testid="button-it-settings"
                    onClick={() => navigate("/it-settings")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
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
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              <div className="w-7 h-7 bg-[#FF8200]/10 rounded-full flex items-center justify-center text-[#FF8200] font-bold text-xs">
                {user?.displayName?.[0]?.toUpperCase() || "U"}
              </div>
              <span className="hidden sm:inline">{user?.displayName}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 top-12 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl w-48 py-1 z-50">
                <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700">
                  <div className="text-sm font-semibold text-slate-800 dark:text-white">{user?.displayName}</div>
                  <div className="text-xs text-slate-400 capitalize">{user?.role}</div>
                </div>
                <button
                  data-testid="button-logout"
                  onClick={() => { logout(); navigate("/login"); }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <LogOut className="w-4 h-4" /> Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* TTS Panel (if enabled for this user) */}
        {user?.ttsEnabled && <TtsPanel />}

        {/* Volume Control section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <SpeakerIcon className="w-5 h-5 text-[#FF8200]" /> Volume Control
            </h2>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  data-testid="input-search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search rooms…"
                  className="pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF8200] w-40"
                />
              </div>
              {(isAdmin || isIt) && (
                <Button
                  data-testid="button-add-room"
                  onClick={() => { setEditingRoom(null); setShowAddRoom(true); }}
                  className="bg-[#FF8200] hover:bg-[#e07200] text-white rounded-xl text-sm font-semibold px-4 py-2"
                >
                  <PlusCircle className="w-4 h-4 mr-1.5" /> Add Room
                </Button>
              )}
            </div>
          </div>

          {filteredRooms.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Radio className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No rooms yet</p>
              <p className="text-sm mt-1">{isAdmin || isIt ? "Add a room to get started." : "No rooms have been assigned to your account."}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredRooms.map((room) => (
                <RoomPanel
                  key={room.id}
                  room={room}
                  isAdmin={isAdmin || isIt}
                  onEdit={() => { setEditingRoom(room); setShowAddRoom(true); }}
                  onDelete={() => handleDeleteRoom(room.id)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {showAddRoom && (
        <AddRoomDialog
          onAdd={handleAddRoom}
          onCancel={() => { setShowAddRoom(false); setEditingRoom(null); }}
          editRoom={editingRoom}
        />
      )}

      {showUserMenu && (
        <div className="fixed inset-0 z-30" onClick={() => setShowUserMenu(false)} />
      )}
    </div>
  );
}
