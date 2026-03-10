import { useState, useEffect, useCallback, useRef } from "react";
import {
  Volume2, VolumeX, Volume1, Minus, Plus,
  Speaker, AlertCircle, ArrowLeft, Trash2, PlusCircle, Home as HomeIcon, Pencil, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import type { Room, SpeakerStatus } from "@shared/schema";

const VOLUME_PRESETS = [
  { label: "Low", value: 15, icon: Volume1 },
  { label: "Normal", value: 31, icon: Volume2 },
  { label: "Loud", value: 48, icon: Speaker },
];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function loadRooms(): Room[] {
  try {
    const saved = localStorage.getItem("toa_rooms");
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

function saveRooms(rooms: Room[]) {
  localStorage.setItem("toa_rooms", JSON.stringify(rooms));
}

function AddRoomDialog({
  onAdd,
  onCancel,
  editRoom,
}: {
  onAdd: (room: Room) => void;
  onCancel: () => void;
  editRoom?: Room | null;
}) {
  const [name, setName] = useState(editRoom?.name || "");
  const [ip, setIp] = useState(editRoom?.ipAddress || "");
  const [username, setUsername] = useState(editRoom?.username || "");
  const [password, setPassword] = useState(editRoom?.password || "");

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onCancel}>
      <Card
        className="w-full sm:max-w-md border-0 shadow-2xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-1 bg-slate-300 dark:bg-slate-600 rounded-full mx-auto mt-3 sm:hidden" />
        <CardContent className="p-6 pt-5 sm:pt-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white" data-testid="text-dialog-title">
              {editRoom ? "Edit Room" : "Add Room"}
            </h2>
            <button onClick={onCancel} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" data-testid="button-dialog-close">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              onAdd({
                id: editRoom?.id || generateId(),
                name: name.trim(),
                ipAddress: ip.trim(),
                username: username.trim(),
                password,
              });
            }}
            className="space-y-5"
          >
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Room Name</label>
              <input
                data-testid="input-room-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Room 101, Science Lab"
                className="w-full px-4 py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-[16px]"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Speaker IP Address</label>
              <input
                data-testid="input-room-ip"
                type="text"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="192.168.1.100"
                className="w-full px-4 py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-[16px]"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Username</label>
              <input
                data-testid="input-room-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full px-4 py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-[16px]"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Password</label>
              <input
                data-testid="input-room-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                className="w-full px-4 py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-[16px]"
                required
              />
            </div>
            <div className="flex gap-3 pt-2 pb-2 safe-bottom">
              <Button type="button" variant="outline" onClick={onCancel} className="flex-1 h-14 rounded-xl font-medium text-base" data-testid="button-dialog-cancel">
                Cancel
              </Button>
              <Button
                type="submit"
                data-testid="button-dialog-save"
                className="flex-1 h-14 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-500/25 text-base"
              >
                {editRoom ? "Save Changes" : "Add Room"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function RoomTile({
  room,
  onSelect,
  onEdit,
  onDelete,
}: {
  room: Room;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (confirmDelete) {
      const timer = setTimeout(() => setConfirmDelete(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [confirmDelete]);

  return (
    <div
      className="relative bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer active:scale-[0.97] overflow-hidden select-none"
      onClick={onSelect}
      data-testid={`tile-room-${room.id}`}
    >
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between mb-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
            <Speaker className="w-6 h-6" />
          </div>
          <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onEdit}
              className="p-2.5 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 active:bg-blue-100 transition-colors"
              data-testid={`button-edit-room-${room.id}`}
            >
              <Pencil className="w-4.5 h-4.5" />
            </button>
            {confirmDelete ? (
              <button
                onClick={onDelete}
                className="px-3 py-2 rounded-xl text-xs font-bold text-white bg-red-500 hover:bg-red-600 active:bg-red-700 transition-colors"
                data-testid={`button-confirm-delete-room-${room.id}`}
              >
                Delete?
              </button>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-2.5 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 active:bg-red-100 transition-colors"
                data-testid={`button-delete-room-${room.id}`}
              >
                <Trash2 className="w-4.5 h-4.5" />
              </button>
            )}
          </div>
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white truncate" data-testid={`text-room-name-${room.id}`}>
          {room.name}
        </h3>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1 truncate">
          {room.ipAddress}
        </p>
      </div>
    </div>
  );
}

function RoomList({
  rooms,
  onSelectRoom,
  onAddRoom,
  onEditRoom,
  onDeleteRoom,
}: {
  rooms: Room[];
  onSelectRoom: (room: Room) => void;
  onAddRoom: () => void;
  onEditRoom: (room: Room) => void;
  onDeleteRoom: (id: string) => void;
}) {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 flex flex-col">
      <header className="sticky top-0 z-10 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-700/60 px-5 py-4 safe-top">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
              <HomeIcon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white" data-testid="text-main-title">Rooms</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {rooms.length} {rooms.length === 1 ? "room" : "rooms"}
              </p>
            </div>
          </div>
          <Button
            onClick={onAddRoom}
            data-testid="button-add-room"
            className="h-11 px-5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-500/25 text-sm"
          >
            <PlusCircle className="w-4 h-4 mr-1.5" />
            Add Room
          </Button>
        </div>
      </header>

      <main className="flex-1 px-5 py-5">
        <div className="max-w-3xl mx-auto">
          {rooms.length === 0 ? (
            <div className="text-center py-24">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 mb-5">
                <Speaker className="w-10 h-10" />
              </div>
              <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2" data-testid="text-empty-title">No rooms yet</h2>
              <p className="text-base text-slate-500 dark:text-slate-400 mb-8 max-w-xs mx-auto">
                Add your first classroom to start controlling its speaker
              </p>
              <Button
                onClick={onAddRoom}
                data-testid="button-add-room-empty"
                className="h-14 px-8 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-500/25 text-base"
              >
                <PlusCircle className="w-5 h-5 mr-2" />
                Add Your First Room
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {rooms.map((room) => (
                <RoomTile
                  key={room.id}
                  room={room}
                  onSelect={() => onSelectRoom(room)}
                  onEdit={() => onEditRoom(room)}
                  onDelete={() => onDeleteRoom(room.id)}
                />
              ))}
              <button
                onClick={onAddRoom}
                data-testid="button-add-room-tile"
                className="min-h-[130px] rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center gap-2.5 text-slate-400 dark:text-slate-500 hover:text-blue-500 hover:border-blue-300 dark:hover:border-blue-700 transition-all active:scale-[0.97]"
              >
                <PlusCircle className="w-7 h-7" />
                <span className="text-sm font-medium">Add Room</span>
              </button>
            </div>
          )}
        </div>
      </main>

      <footer className="text-center pb-5 px-5 safe-bottom">
        <p className="text-xs text-slate-400 dark:text-slate-500">TOA IP-A1 Speaker Control</p>
      </footer>
    </div>
  );
}

function VolumeKnobDisplay({ volume, max }: { volume: number; max: number }) {
  const percentage = max > 0 ? Math.round((volume / max) * 100) : 0;
  const r = 58;
  const circumference = 2 * Math.PI * r;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  const size = 180;
  const cx = size / 2;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={cx} cy={cx} r={r} stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth="12" fill="none" />
        <circle cx={cx} cy={cx} r={r} stroke="url(#volumeGradient)" strokeWidth="12" fill="none" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} className="transition-all duration-300 ease-out" />
        <defs>
          <linearGradient id="volumeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-bold text-slate-900 dark:text-white tabular-nums" data-testid="text-volume-percentage">{percentage}%</span>
        <span className="text-sm text-slate-500 dark:text-slate-400 mt-1">{volume} / {max}</span>
      </div>
    </div>
  );
}

function ControlPanel({
  room,
  onBack,
}: {
  room: Room;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [status, setStatus] = useState<SpeakerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [changingVolume, setChangingVolume] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [sliderValue, setSliderValue] = useState<number | null>(null);
  const wasConnectedRef = useRef(true);

  const connection = { ipAddress: room.ipAddress, username: room.username, password: room.password };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/speaker/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(connection),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Could not reach the speaker" }));
        throw new Error(errData.error || "Could not reach the speaker");
      }
      const data: SpeakerStatus = await res.json();
      setStatus(data);
      if (sliderValue === null) setSliderValue(data.volume);
      if (!wasConnectedRef.current) {
        wasConnectedRef.current = true;
        toast({ title: "Reconnected", description: "Speaker connection restored" });
      }
    } catch (err: any) {
      setStatus((prev) =>
        prev ? { ...prev, connected: false } : { volume: 0, max: 61, min: 0, muteState: "unmute" as const, connected: false }
      );
      if (wasConnectedRef.current) {
        wasConnectedRef.current = false;
        toast({ title: "Connection Lost", description: err.message || "Could not reach the speaker", variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  }, [connection.ipAddress, connection.username, connection.password, toast, sliderValue]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const setVolume = useCallback(async (vol: number) => {
    setChangingVolume(true);
    try {
      const res = await fetch("/api/speaker/volume/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...connection, volume: vol }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
      const data = await res.json();
      setStatus((prev) => prev ? { ...prev, volume: data.volume, connected: true } : prev);
      setSliderValue(data.volume);
    } catch (err: any) {
      toast({ title: "Volume Error", description: err.message, variant: "destructive" });
    } finally { setChangingVolume(false); }
  }, [connection.ipAddress, connection.username, connection.password, toast]);

  const handleSliderChange = useCallback((values: number[]) => {
    setSliderValue(values[0]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setVolume(values[0]), 300);
  }, [setVolume]);

  const toggleMute = useCallback(async () => {
    if (!status) return;
    const newState = status.muteState === "mute" ? "unmute" : "mute";
    try {
      const res = await fetch("/api/speaker/mute/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...connection, mute_state: newState }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
      const data = await res.json();
      setStatus((prev) => prev ? { ...prev, muteState: data.mute_state, connected: true } : prev);
      toast({ title: data.mute_state === "mute" ? "Speaker Muted" : "Speaker Unmuted" });
    } catch (err: any) {
      toast({ title: "Mute Error", description: err.message, variant: "destructive" });
    }
  }, [status, connection.ipAddress, connection.username, connection.password, toast]);

  const adjustVolume = useCallback(async (direction: "increment" | "decrement") => {
    try {
      const res = await fetch(`/api/speaker/volume/${direction}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(connection),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
      const data = await res.json();
      setStatus((prev) => prev ? { ...prev, volume: data.volume, connected: true } : prev);
      setSliderValue(data.volume);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }, [connection.ipAddress, connection.username, connection.password, toast]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white mb-5 animate-pulse shadow-lg shadow-blue-500/25">
            <Speaker className="w-10 h-10" />
          </div>
          <p className="text-base text-slate-600 dark:text-slate-400 font-medium" data-testid="text-connecting">Connecting to {room.name}...</p>
        </div>
      </div>
    );
  }

  const currentVolume = sliderValue ?? status?.volume ?? 0;
  const maxVolume = status?.max ?? 61;
  const isMuted = status?.muteState === "mute";

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 flex flex-col">
      <header className="sticky top-0 z-10 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-700/60 px-5 py-3 safe-top">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <button
            onClick={onBack}
            className="p-3 -ml-3 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 active:bg-slate-200 transition-colors"
            data-testid="button-back"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 truncate" data-testid="text-room-title">{room.name}</h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${status?.connected ? "bg-emerald-500 shadow-sm shadow-emerald-500/50" : "bg-red-500 shadow-sm shadow-red-500/50"}`} data-testid="status-connection" />
              <span className="text-xs text-slate-400 dark:text-slate-500 truncate">{room.ipAddress}</span>
            </div>
          </div>
        </div>
      </header>

      {!status?.connected && (
        <div className="mx-5 mt-3 p-3.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-center gap-2.5">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400">Speaker unreachable — check network and credentials</p>
        </div>
      )}

      <main className="flex-1 flex flex-col items-center justify-center px-5 py-8">
        <div className="w-full max-w-sm space-y-10">
          <div className="text-center">
            <VolumeKnobDisplay volume={currentVolume} max={maxVolume} />
          </div>

          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <button
                onClick={() => adjustVolume("decrement")}
                className="flex-shrink-0 w-14 h-14 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-90 active:bg-slate-100 transition-all shadow-sm"
                data-testid="button-volume-down"
              >
                <Minus className="w-6 h-6" />
              </button>
              <div className="flex-1 py-2">
                <Slider
                  data-testid="slider-volume"
                  value={[currentVolume]}
                  min={0}
                  max={maxVolume}
                  step={1}
                  onValueChange={handleSliderChange}
                  className="cursor-pointer touch-none"
                  disabled={changingVolume}
                />
              </div>
              <button
                onClick={() => adjustVolume("increment")}
                className="flex-shrink-0 w-14 h-14 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-90 active:bg-slate-100 transition-all shadow-sm"
                data-testid="button-volume-up"
              >
                <Plus className="w-6 h-6" />
              </button>
            </div>
            <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500 px-[72px]">
              <span>Mute</span><span>Max</span>
            </div>
          </div>

          <button
            onClick={toggleMute}
            data-testid="button-mute"
            className={`w-full h-16 rounded-2xl font-semibold text-lg flex items-center justify-center gap-3 transition-all duration-200 active:scale-[0.97] ${
              isMuted
                ? "bg-red-500 hover:bg-red-600 active:bg-red-700 text-white shadow-lg shadow-red-500/25"
                : "bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 active:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-sm"
            }`}
          >
            <VolumeX className="w-6 h-6" />
            {isMuted ? "Unmute Speaker" : "Mute Speaker"}
          </button>

          <div className="grid grid-cols-3 gap-4">
            {VOLUME_PRESETS.map((preset) => {
              const isActive = currentVolume >= preset.value - 2 && currentVolume <= preset.value + 2;
              const PresetIcon = preset.icon;
              return (
                <button
                  key={preset.label}
                  onClick={() => { setSliderValue(preset.value); setVolume(preset.value); }}
                  data-testid={`button-preset-${preset.label.toLowerCase()}`}
                  className={`h-20 rounded-2xl font-semibold text-sm flex flex-col items-center justify-center gap-2 transition-all duration-200 active:scale-95 ${
                    isActive
                      ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 active:bg-slate-100 shadow-sm"
                  }`}
                >
                  <PresetIcon className="w-5 h-5" />
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      </main>

      <footer className="text-center pb-5 px-5 safe-bottom">
        <p className="text-xs text-slate-400 dark:text-slate-500">TOA IP-A1 Speaker Control</p>
      </footer>
    </div>
  );
}

export default function Home() {
  const [rooms, setRooms] = useState<Room[]>(loadRooms);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);

  const updateRooms = (newRooms: Room[]) => {
    setRooms(newRooms);
    saveRooms(newRooms);
  };

  const handleAddRoom = (room: Room) => {
    if (editingRoom) {
      updateRooms(rooms.map((r) => (r.id === room.id ? room : r)));
    } else {
      updateRooms([...rooms, room]);
    }
    setShowAddDialog(false);
    setEditingRoom(null);
  };

  const handleDeleteRoom = (id: string) => {
    updateRooms(rooms.filter((r) => r.id !== id));
  };

  if (activeRoom) {
    return <ControlPanel room={activeRoom} onBack={() => setActiveRoom(null)} />;
  }

  return (
    <>
      <RoomList
        rooms={rooms}
        onSelectRoom={setActiveRoom}
        onAddRoom={() => { setEditingRoom(null); setShowAddDialog(true); }}
        onEditRoom={(room) => { setEditingRoom(room); setShowAddDialog(true); }}
        onDeleteRoom={handleDeleteRoom}
      />
      {showAddDialog && (
        <AddRoomDialog
          onAdd={handleAddRoom}
          onCancel={() => { setShowAddDialog(false); setEditingRoom(null); }}
          editRoom={editingRoom}
        />
      )}
    </>
  );
}
