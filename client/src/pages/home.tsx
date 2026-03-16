import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Volume2, VolumeX, Volume1, Minus, Plus,
  Speaker, AlertCircle, ArrowLeft, Trash2, PlusCircle, Home as HomeIcon,
  Pencil, X, Lock, Unlock, Search, RefreshCw, CloudOff, Link2, Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import type { Room, Speaker as SpeakerType, SpeakerStatus } from "@shared/schema";

const ADMIN_PASSWORD = "IPA1";

const VOLUME_PRESETS = [
  { label: "Low", value: 15, icon: Volume1 },
  { label: "Normal", value: 31, icon: Volume2 },
  { label: "Loud", value: 48, icon: Speaker },
];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function loadRoomsFromCache(): Room[] {
  try {
    const saved = localStorage.getItem("toa_rooms");
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    // Migrate old flat-format from localStorage cache
    return parsed.map((r: any) => {
      if (r.ipAddress && !r.speakers) {
        return {
          id: r.id,
          name: r.name,
          syncMode: true,
          speakers: [{ id: generateId(), label: "Speaker 1", ipAddress: r.ipAddress, username: r.username, password: r.password }],
        };
      }
      return r;
    });
  } catch { return []; }
}

function saveRoomsToCache(rooms: Room[]) {
  localStorage.setItem("toa_rooms", JSON.stringify(rooms));
}

async function fetchRoomsFromServer(): Promise<Room[]> {
  const res = await fetch("/api/rooms");
  if (!res.ok) throw new Error("Failed to load config");
  return res.json();
}

async function saveRoomsToServer(rooms: Room[]): Promise<void> {
  const res = await fetch(`/api/rooms?pw=${encodeURIComponent(ADMIN_PASSWORD)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "x-admin-password": ADMIN_PASSWORD },
    body: JSON.stringify(rooms),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body || "no details"}`);
  }
}

// ─── Input field styling ─────────────────────────────────────────────────────
const INPUT_CLS = "w-full px-4 py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-[#707372]/50 focus:outline-none focus:ring-2 focus:ring-[#FF8200] focus:border-transparent transition-all text-[16px]";

// ─── Blank speaker factory ────────────────────────────────────────────────────
function blankSpeaker(index: number): SpeakerType {
  return { id: generateId(), label: `Speaker ${index + 1}`, ipAddress: "", username: "", password: "" };
}

// ─── AddRoomDialog ────────────────────────────────────────────────────────────
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
  const [speakers, setSpeakers] = useState<SpeakerType[]>(
    editRoom?.speakers?.length ? editRoom.speakers : [blankSpeaker(0)]
  );

  const updateSpeaker = (index: number, field: keyof SpeakerType, value: string) => {
    setSpeakers((prev) => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const addSpeaker = () => setSpeakers((prev) => [...prev, blankSpeaker(prev.length)]);

  const removeSpeaker = (index: number) =>
    setSpeakers((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({
      id: editRoom?.id || generateId(),
      name: name.trim(),
      speakers,
      syncMode: editRoom?.syncMode ?? true,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <Card
        className="w-full sm:max-w-md border-0 shadow-2xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-1 bg-slate-300 dark:bg-slate-600 rounded-full mx-auto mt-3 sm:hidden" />
        <CardContent className="p-6 pt-5 sm:pt-6">
          <div className="flex items-center justify-between mb-6">
            <h2
              className="text-xl font-bold text-slate-900 dark:text-white"
              data-testid="text-dialog-title"
            >
              {editRoom ? "Edit Room" : "Add Room"}
            </h2>
            <button
              onClick={onCancel}
              className="p-2 rounded-xl text-[#707372] hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              data-testid="button-dialog-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Room name */}
            <div>
              <label className="block text-sm font-medium text-[#707372] dark:text-slate-300 mb-2">
                Room Name
              </label>
              <input
                data-testid="input-room-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Room 101, Science Lab"
                className={INPUT_CLS}
                required
                autoFocus
              />
            </div>

            {/* Speakers */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-[#707372] dark:text-slate-300">
                  Speakers
                  {speakers.length > 1 && (
                    <span className="ml-2 text-xs bg-[#FF8200]/10 text-[#FF8200] px-2 py-0.5 rounded-full font-semibold">
                      {speakers.length}
                    </span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={addSpeaker}
                  className="flex items-center gap-1.5 text-sm text-[#FF8200] hover:text-[#e67400] font-medium transition-colors"
                  data-testid="button-add-speaker"
                >
                  <PlusCircle className="w-4 h-4" />
                  Add Speaker
                </button>
              </div>

              {speakers.map((sp, idx) => (
                <div
                  key={sp.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3 bg-slate-50/50 dark:bg-slate-800/40"
                  data-testid={`speaker-entry-${idx}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-[#FF8200] flex items-center justify-center">
                        <Speaker className="w-3.5 h-3.5 text-white" />
                      </div>
                      <input
                        type="text"
                        value={sp.label}
                        onChange={(e) => updateSpeaker(idx, "label", e.target.value)}
                        placeholder={`Speaker ${idx + 1}`}
                        className="text-sm font-semibold text-slate-800 dark:text-slate-200 bg-transparent border-none outline-none w-32 focus:ring-0"
                        data-testid={`input-speaker-label-${idx}`}
                      />
                    </div>
                    {speakers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSpeaker(idx)}
                        className="p-1.5 rounded-lg text-[#707372] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                        data-testid={`button-remove-speaker-${idx}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#707372] dark:text-slate-400 mb-1.5">
                      IP Address
                    </label>
                    <input
                      data-testid={`input-speaker-ip-${idx}`}
                      type="text"
                      value={sp.ipAddress}
                      onChange={(e) => updateSpeaker(idx, "ipAddress", e.target.value)}
                      placeholder="192.168.1.100"
                      className={INPUT_CLS}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#707372] dark:text-slate-400 mb-1.5">
                        Username
                      </label>
                      <input
                        data-testid={`input-speaker-username-${idx}`}
                        type="text"
                        value={sp.username}
                        onChange={(e) => updateSpeaker(idx, "username", e.target.value)}
                        placeholder="admin"
                        className={INPUT_CLS}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#707372] dark:text-slate-400 mb-1.5">
                        Password
                      </label>
                      <input
                        data-testid={`input-speaker-password-${idx}`}
                        type="password"
                        value={sp.password}
                        onChange={(e) => updateSpeaker(idx, "password", e.target.value)}
                        placeholder="••••••"
                        className={INPUT_CLS}
                        required
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-2 pb-2 safe-bottom">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="flex-1 h-14 rounded-xl font-medium text-base"
                data-testid="button-dialog-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                data-testid="button-dialog-save"
                className="flex-1 h-14 rounded-xl bg-[#FF8200] hover:bg-[#e67400] text-white font-semibold shadow-lg shadow-[#FF8200]/25 text-base"
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

// ─── AdminPasswordDialog ──────────────────────────────────────────────────────
function AdminPasswordDialog({ onUnlock, onCancel }: { onUnlock: () => void; onCancel: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) { onUnlock(); }
    else { setError(true); setPassword(""); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <Card
        className="w-full sm:max-w-sm border-0 shadow-2xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-1 bg-slate-300 dark:bg-slate-600 rounded-full mx-auto mt-3 sm:hidden" />
        <CardContent className="p-6 pt-5 sm:pt-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FF8200] flex items-center justify-center text-white">
                <Lock className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white" data-testid="text-admin-dialog-title">
                Admin Access
              </h2>
            </div>
            <button
              onClick={onCancel}
              className="p-2 rounded-xl text-[#707372] hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              data-testid="button-admin-dialog-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm text-[#707372] dark:text-slate-400 mb-4">Enter the admin password to manage rooms</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                data-testid="input-admin-password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(false); }}
                placeholder="Enter password"
                className={`w-full px-4 py-3.5 rounded-xl border ${error ? "border-red-400 ring-2 ring-red-200 dark:ring-red-900" : "border-slate-200 dark:border-slate-700"} bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-[#707372]/50 focus:outline-none focus:ring-2 focus:ring-[#FF8200] focus:border-transparent transition-all text-[16px]`}
                required
                autoFocus
              />
              {error && <p className="text-sm text-red-500 mt-2" data-testid="text-admin-error">Incorrect password</p>}
            </div>
            <div className="flex gap-3 pb-2 safe-bottom">
              <Button type="button" variant="outline" onClick={onCancel} className="flex-1 h-14 rounded-xl font-medium text-base" data-testid="button-admin-cancel">
                Cancel
              </Button>
              <Button type="submit" data-testid="button-admin-unlock" className="flex-1 h-14 rounded-xl bg-[#FF8200] hover:bg-[#e67400] text-white font-semibold shadow-lg shadow-[#FF8200]/25 text-base">
                Unlock
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── RoomTile ─────────────────────────────────────────────────────────────────
function RoomTile({
  room,
  onSelect,
  onEdit,
  onDelete,
  adminMode,
}: {
  room: Room;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  adminMode: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const speakerCount = room.speakers.length;

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
          {/* Speaker icon — stacked if multi */}
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-[#FF8200] flex items-center justify-center text-white shadow-sm shadow-[#FF8200]/20">
              <Speaker className="w-6 h-6" />
            </div>
            {speakerCount > 1 && (
              <div
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-800 dark:bg-white text-white dark:text-slate-800 text-[10px] font-bold flex items-center justify-center shadow"
                data-testid={`badge-speaker-count-${room.id}`}
              >
                {speakerCount}
              </div>
            )}
          </div>

          {adminMode && (
            <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={onEdit}
                className="p-2.5 rounded-xl text-[#707372] hover:text-[#FF8200] hover:bg-orange-50 dark:hover:bg-orange-900/20 active:bg-orange-100 transition-colors"
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
                  className="p-2.5 rounded-xl text-[#707372] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 active:bg-red-100 transition-colors"
                  data-testid={`button-delete-room-${room.id}`}
                >
                  <Trash2 className="w-4.5 h-4.5" />
                </button>
              )}
            </div>
          )}
        </div>

        <h3 className="text-lg font-semibold text-slate-900 dark:text-white truncate" data-testid={`text-room-name-${room.id}`}>
          {room.name}
        </h3>

        {speakerCount === 1 ? (
          <p className="text-sm text-[#707372] mt-1 truncate">{room.speakers[0].ipAddress}</p>
        ) : (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="text-xs font-medium text-[#FF8200]">{speakerCount} speakers</span>
            <span className="text-[#707372]/40">·</span>
            <span className="text-xs text-[#707372] truncate">{room.speakers.map((s) => s.label).join(", ")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── RoomList ─────────────────────────────────────────────────────────────────
function RoomList({
  rooms,
  onSelectRoom,
  onAddRoom,
  onEditRoom,
  onDeleteRoom,
  adminMode,
  onToggleAdmin,
  syncStatus,
  onRefresh,
}: {
  rooms: Room[];
  onSelectRoom: (room: Room) => void;
  onAddRoom: () => void;
  onEditRoom: (room: Room) => void;
  onDeleteRoom: (id: string) => void;
  adminMode: boolean;
  onToggleAdmin: () => void;
  syncStatus: "idle" | "synced" | "syncing" | "offline" | "error";
  onRefresh: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredRooms = useMemo(() => {
    if (!searchQuery.trim()) return rooms;
    const q = searchQuery.toLowerCase().trim();
    return rooms.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.speakers.some((s) => s.ipAddress.includes(q) || s.label.toLowerCase().includes(q))
    );
  }, [rooms, searchQuery]);

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-50 via-orange-50/30 to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex flex-col">
      <header className="sticky top-0 z-10 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-700/60 px-5 py-4 safe-top">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#FF8200] flex items-center justify-center text-white shadow-sm shadow-[#FF8200]/20">
              <HomeIcon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white" data-testid="text-main-title">Rooms</h1>
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-[#707372]">
                  {rooms.length} {rooms.length === 1 ? "room" : "rooms"}
                </p>
                {syncStatus !== "idle" && <span className="text-[#707372]/40">·</span>}
                {syncStatus === "syncing" && (
                  <span className="flex items-center gap-1 text-xs text-[#FF8200]">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Syncing</span>
                  </span>
                )}
                {syncStatus === "synced" && (
                  <span className="text-xs text-emerald-500" data-testid="status-synced">Config saved</span>
                )}
                {(syncStatus === "offline" || syncStatus === "error") && (
                  <button onClick={onRefresh} className="flex items-center gap-1 text-xs text-[#707372] hover:text-[#FF8200] transition-colors" data-testid="button-sync-retry">
                    <CloudOff className="w-3 h-3" />
                    <span>Local only — tap to retry</span>
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {adminMode && (
              <Button
                onClick={onAddRoom}
                data-testid="button-add-room"
                className="h-11 px-5 rounded-xl bg-[#FF8200] hover:bg-[#e67400] text-white font-semibold shadow-lg shadow-[#FF8200]/25 text-sm"
              >
                <PlusCircle className="w-4 h-4 mr-1.5" />
                Add Room
              </Button>
            )}
            <button
              onClick={onToggleAdmin}
              data-testid="button-admin-toggle"
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-95 ${
                adminMode
                  ? "bg-[#FF8200] text-white shadow-sm shadow-[#FF8200]/20"
                  : "bg-slate-100 dark:bg-slate-800 text-[#707372] hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {adminMode ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-5 py-5">
        <div className="max-w-3xl mx-auto">
          {rooms.length === 0 ? (
            <div className="text-center py-24">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-slate-100 dark:bg-slate-800 text-[#707372] mb-5">
                <Speaker className="w-10 h-10" />
              </div>
              <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2" data-testid="text-empty-title">No rooms yet</h2>
              <p className="text-base text-[#707372] mb-8 max-w-xs mx-auto">
                {adminMode
                  ? "Add your first classroom to start controlling its speaker"
                  : "Tap the lock icon to unlock admin access and add rooms"}
              </p>
              {adminMode && (
                <Button
                  onClick={onAddRoom}
                  data-testid="button-add-room-empty"
                  className="h-14 px-8 rounded-xl bg-[#FF8200] hover:bg-[#e67400] text-white font-semibold shadow-lg shadow-[#FF8200]/25 text-base"
                >
                  <PlusCircle className="w-5 h-5 mr-2" />
                  Add Your First Room
                </Button>
              )}
            </div>
          ) : (
            <>
              {rooms.length > 5 && (
                <div className="relative mb-4">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#707372]" />
                  <input
                    data-testid="input-search-rooms"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search rooms or speaker IPs..."
                    className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-[#707372]/50 focus:outline-none focus:ring-2 focus:ring-[#FF8200] focus:border-transparent transition-all text-[16px]"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-lg text-[#707372] hover:text-slate-600 transition-colors"
                      data-testid="button-clear-search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
              {searchQuery && filteredRooms.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-base text-[#707372]">No rooms match "{searchQuery}"</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredRooms.map((room) => (
                    <RoomTile
                      key={room.id}
                      room={room}
                      onSelect={() => onSelectRoom(room)}
                      onEdit={() => onEditRoom(room)}
                      onDelete={() => onDeleteRoom(room.id)}
                      adminMode={adminMode}
                    />
                  ))}
                  {adminMode && !searchQuery && (
                    <button
                      onClick={onAddRoom}
                      data-testid="button-add-room-tile"
                      className="min-h-[130px] rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center gap-2.5 text-[#707372] hover:text-[#FF8200] hover:border-[#FF8200]/40 transition-all active:scale-[0.97]"
                    >
                      <PlusCircle className="w-7 h-7" />
                      <span className="text-sm font-medium">Add Room</span>
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <footer className="text-center pb-5 px-5 safe-bottom">
        <p className="text-xs text-[#707372]/60">IP-A1 Volume Controller</p>
      </footer>
    </div>
  );
}

// ─── VolumeKnobDisplay ────────────────────────────────────────────────────────
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
        <circle cx={cx} cy={cx} r={r} stroke="#FF8200" strokeWidth="12" fill="none" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} className="transition-all duration-300 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-bold text-slate-900 dark:text-white tabular-nums" data-testid="text-volume-percentage">
          {percentage}%
        </span>
      </div>
    </div>
  );
}

// ─── useSpeakerState hook ─────────────────────────────────────────────────────
// Manages status, volume, mute for a single speaker connection.
function useSpeakerState(sp: SpeakerType, showToasts = true) {
  const { toast } = useToast();
  const [status, setStatus] = useState<SpeakerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [changingVolume, setChangingVolume] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [sliderValue, setSliderValue] = useState<number | null>(null);
  const wasConnectedRef = useRef(true);

  const connKey = `${sp.ipAddress}|${sp.username}|${sp.password}`;
  const conn = { ipAddress: sp.ipAddress, username: sp.username, password: sp.password };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/speaker/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(conn),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Could not reach speaker" }));
        throw new Error(errData.error || "Could not reach speaker");
      }
      const data: SpeakerStatus = await res.json();
      setStatus(data);
      if (sliderValue === null) setSliderValue(data.volume);
      if (!wasConnectedRef.current) {
        wasConnectedRef.current = true;
        if (showToasts) toast({ title: "Reconnected", description: `${sp.label} connection restored` });
      }
    } catch (err: any) {
      setStatus((prev) =>
        prev ? { ...prev, connected: false } : { volume: 0, max: 61, min: 0, muteState: "unmute" as const, connected: false }
      );
      if (wasConnectedRef.current) {
        wasConnectedRef.current = false;
        if (showToasts) toast({ title: "Connection Lost", description: err.message || `Could not reach ${sp.label}`, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  }, [connKey, sliderValue, showToasts]);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 10000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const setVolume = useCallback(async (vol: number) => {
    setChangingVolume(true);
    try {
      const res = await fetch("/api/speaker/volume/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...conn, volume: vol }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
      const data = await res.json();
      setStatus((prev) => prev ? { ...prev, volume: data.volume, connected: true } : prev);
      setSliderValue(data.volume);
    } catch (err: any) {
      if (showToasts) toast({ title: "Volume Error", description: err.message, variant: "destructive" });
    } finally { setChangingVolume(false); }
  }, [connKey, showToasts]);

  const handleSliderChange = useCallback((value: number[]) => {
    const newVol = value[0];
    setSliderValue(newVol);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setVolume(newVol), 300);
  }, [setVolume]);

  const toggleMute = useCallback(async () => {
    if (!status) return;
    const newState = status.muteState === "mute" ? "unmute" : "mute";
    try {
      const res = await fetch("/api/speaker/mute/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...conn, mute_state: newState }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
      const data = await res.json();
      setStatus((prev) => prev ? { ...prev, muteState: data.mute_state, connected: true } : prev);
      if (showToasts) toast({ title: data.mute_state === "mute" ? "Speaker Muted" : "Speaker Unmuted" });
    } catch (err: any) {
      if (showToasts) toast({ title: "Mute Error", description: err.message, variant: "destructive" });
    }
  }, [status, connKey, showToasts]);

  const setMuteState = useCallback(async (newState: "mute" | "unmute") => {
    try {
      const res = await fetch("/api/speaker/mute/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...conn, mute_state: newState }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
      const data = await res.json();
      setStatus((prev) => prev ? { ...prev, muteState: data.mute_state, connected: true } : prev);
    } catch (err: any) {
      if (showToasts) toast({ title: "Mute Error", description: err.message, variant: "destructive" });
    }
  }, [connKey, showToasts]);

  const adjustVolume = useCallback(async (direction: "increment" | "decrement") => {
    try {
      const res = await fetch(`/api/speaker/volume/${direction}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(conn),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Failed"); }
      const data = await res.json();
      setStatus((prev) => prev ? { ...prev, volume: data.volume, connected: true } : prev);
      setSliderValue(data.volume);
    } catch (err: any) {
      if (showToasts) toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }, [connKey, showToasts]);

  const currentVolume = sliderValue ?? status?.volume ?? 0;
  const maxVolume = status?.max ?? 61;
  const isMuted = status?.muteState === "mute";

  return { status, loading, changingVolume, currentVolume, maxVolume, isMuted, setVolume, handleSliderChange, toggleMute, setMuteState, adjustVolume, setSliderValue };
}

// ─── VolumeControls (shared UI block) ────────────────────────────────────────
function VolumeControls({
  currentVolume,
  maxVolume,
  isMuted,
  changingVolume,
  onSliderChange,
  onDecrement,
  onIncrement,
  onMuteToggle,
  onPreset,
  muteLabel,
  testPrefix = "",
}: {
  currentVolume: number;
  maxVolume: number;
  isMuted: boolean;
  changingVolume: boolean;
  onSliderChange: (v: number[]) => void;
  onDecrement: () => void;
  onIncrement: () => void;
  onMuteToggle: () => void;
  onPreset: (v: number) => void;
  muteLabel?: string;
  testPrefix?: string;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <button
          onClick={onDecrement}
          className="flex-shrink-0 w-14 h-14 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[#707372] hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-90 active:bg-slate-100 transition-all shadow-sm"
          data-testid={`${testPrefix}button-volume-down`}
        >
          <Minus className="w-6 h-6" />
        </button>
        <div className="flex-1 py-2">
          <Slider
            data-testid={`${testPrefix}slider-volume`}
            value={[currentVolume]}
            min={0}
            max={maxVolume}
            step={1}
            onValueChange={onSliderChange}
            className="cursor-pointer touch-none"
            disabled={changingVolume}
          />
        </div>
        <button
          onClick={onIncrement}
          className="flex-shrink-0 w-14 h-14 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[#707372] hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-90 active:bg-slate-100 transition-all shadow-sm"
          data-testid={`${testPrefix}button-volume-up`}
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>
      <div className="flex justify-between text-xs text-[#707372] px-[72px]">
        <span>Mute</span><span>Max</span>
      </div>

      <button
        onClick={onMuteToggle}
        data-testid={`${testPrefix}button-mute`}
        className={`w-full h-16 rounded-2xl font-semibold text-lg flex items-center justify-center gap-3 transition-all duration-200 active:scale-[0.97] ${
          isMuted
            ? "bg-red-500 hover:bg-red-600 active:bg-red-700 text-white shadow-lg shadow-red-500/25"
            : "bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 active:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-sm"
        }`}
      >
        <VolumeX className="w-6 h-6" />
        {isMuted ? `Unmute${muteLabel ? ` ${muteLabel}` : ""}` : `Mute${muteLabel ? ` ${muteLabel}` : ""}`}
      </button>

      <div className="grid grid-cols-3 gap-4">
        {VOLUME_PRESETS.map((preset) => {
          const isActive = currentVolume >= preset.value - 2 && currentVolume <= preset.value + 2;
          const PresetIcon = preset.icon;
          return (
            <button
              key={preset.label}
              onClick={() => onPreset(preset.value)}
              data-testid={`${testPrefix}button-preset-${preset.label.toLowerCase()}`}
              className={`h-20 rounded-2xl font-semibold text-sm flex flex-col items-center justify-center gap-2 transition-all duration-200 active:scale-95 ${
                isActive
                  ? "bg-[#FF8200] text-white shadow-lg shadow-[#FF8200]/25"
                  : "bg-white dark:bg-slate-800 text-[#707372] border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 active:bg-slate-100 shadow-sm"
              }`}
            >
              <PresetIcon className="w-5 h-5" />
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── IndividualSpeakerCard ────────────────────────────────────────────────────
// Self-contained card for one speaker in individual mode.
function IndividualSpeakerCard({ speaker }: { speaker: SpeakerType }) {
  const ctrl = useSpeakerState(speaker, true);

  return (
    <div
      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden"
      data-testid={`card-speaker-${speaker.id}`}
    >
      {/* Card header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-700/60">
        <div className="w-8 h-8 rounded-lg bg-[#FF8200] flex items-center justify-center flex-shrink-0">
          <Speaker className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{speaker.label}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ctrl.status?.connected ? "bg-emerald-500" : "bg-red-400"}`} />
            <span className="text-xs text-[#707372] truncate">{speaker.ipAddress}</span>
          </div>
        </div>
        <span className="text-2xl font-bold text-slate-700 dark:text-slate-200 tabular-nums">
          {ctrl.maxVolume > 0 ? Math.round((ctrl.currentVolume / ctrl.maxVolume) * 100) : 0}%
        </span>
      </div>

      {ctrl.loading ? (
        <div className="px-5 py-6 text-center">
          <p className="text-sm text-[#707372]">Connecting…</p>
        </div>
      ) : !ctrl.status?.connected ? (
        <div className="px-5 py-4 flex items-center gap-2 text-red-500">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <p className="text-sm">Speaker unreachable</p>
        </div>
      ) : (
        <div className="px-5 py-4">
          <VolumeControls
            currentVolume={ctrl.currentVolume}
            maxVolume={ctrl.maxVolume}
            isMuted={ctrl.isMuted}
            changingVolume={ctrl.changingVolume}
            onSliderChange={ctrl.handleSliderChange}
            onDecrement={() => ctrl.adjustVolume("decrement")}
            onIncrement={() => ctrl.adjustVolume("increment")}
            onMuteToggle={ctrl.toggleMute}
            onPreset={(v) => { ctrl.setSliderValue(v); ctrl.setVolume(v); }}
            testPrefix={`sp-${speaker.id}-`}
          />
        </div>
      )}
    </div>
  );
}

// ─── ControlPanel ─────────────────────────────────────────────────────────────
function ControlPanel({ room, onBack }: { room: Room; onBack: () => void }) {
  const { toast } = useToast();
  const isMulti = room.speakers.length > 1;
  const [syncMode, setSyncMode] = useState(room.syncMode ?? true);

  // Primary speaker state (always active — drives the sync controls + single-speaker mode)
  const primary = useSpeakerState(room.speakers[0], !isMulti || syncMode);

  // For sync mode status of all other speakers (connection dots only)
  const [otherStatuses, setOtherStatuses] = useState<(SpeakerStatus | null)[]>(
    () => room.speakers.slice(1).map(() => null)
  );

  // Poll non-primary speakers for connection status when in sync mode
  useEffect(() => {
    if (!isMulti || !syncMode) return;
    const others = room.speakers.slice(1);
    if (others.length === 0) return;

    const poll = async () => {
      const results = await Promise.allSettled(
        others.map((sp) =>
          fetch("/api/speaker/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ipAddress: sp.ipAddress, username: sp.username, password: sp.password }),
          }).then((r) => {
            if (!r.ok) throw new Error("failed");
            return r.json() as Promise<SpeakerStatus>;
          })
        )
      );
      setOtherStatuses(
        results.map((r) =>
          r.status === "fulfilled"
            ? r.value
            : { volume: 0, max: 61, min: 0, muteState: "unmute" as const, connected: false }
        )
      );
    };

    poll();
    const id = setInterval(poll, 10000);
    return () => clearInterval(id);
  }, [isMulti, syncMode, room.speakers.map((s) => s.ipAddress).join(",")]);

  // Fire volume to all speakers in sync mode
  const setVolumeAll = useCallback(async (vol: number) => {
    primary.setSliderValue(vol);
    await Promise.allSettled(
      room.speakers.map((sp) =>
        fetch("/api/speaker/volume/set", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ipAddress: sp.ipAddress, username: sp.username, password: sp.password, volume: vol }),
        })
      )
    );
    primary.setVolume(vol);
  }, [room.speakers, primary.setVolume, primary.setSliderValue]);

  const handleSyncSlider = useCallback((value: number[]) => {
    primary.setSliderValue(value[0]);
    setVolumeAll(value[0]);
  }, [setVolumeAll, primary.setSliderValue]);

  // Fire mute to all speakers in sync mode
  const toggleMuteAll = useCallback(async () => {
    if (!primary.status) return;
    const newState = primary.isMuted ? "unmute" : "mute";
    await Promise.allSettled(
      room.speakers.map((sp) =>
        fetch("/api/speaker/mute/set", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ipAddress: sp.ipAddress, username: sp.username, password: sp.password, mute_state: newState }),
        })
      )
    );
    primary.setMuteState(newState);
    toast({ title: newState === "mute" ? "All Speakers Muted" : "All Speakers Unmuted" });
  }, [primary.status, primary.isMuted, primary.setMuteState, room.speakers, toast]);

  // All speaker connection statuses (primary + others)
  const allStatuses = [primary.status, ...otherStatuses];
  const connectedCount = allStatuses.filter((s) => s?.connected).length;

  if (primary.loading && !isMulti) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-slate-50 via-orange-50/30 to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[#FF8200] text-white mb-5 animate-pulse shadow-lg shadow-[#FF8200]/25">
            <Speaker className="w-10 h-10" />
          </div>
          <p className="text-base text-[#707372] font-medium" data-testid="text-connecting">Connecting to {room.name}…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-50 via-orange-50/30 to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-700/60 px-5 py-3 safe-top">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <button
            onClick={onBack}
            className="p-3 -ml-3 rounded-xl text-[#707372] hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 active:bg-slate-200 transition-colors"
            data-testid="button-back"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200 truncate" data-testid="text-room-title">
              {room.name}
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              {isMulti ? (
                <>
                  <span className="text-xs text-[#707372]">{connectedCount}/{room.speakers.length} connected</span>
                  {/* Speaker dots */}
                  <span className="text-[#707372]/40 mx-0.5">·</span>
                  <div className="flex gap-1">
                    {room.speakers.map((sp, i) => (
                      <div
                        key={sp.id}
                        title={sp.label}
                        className={`w-2 h-2 rounded-full ${allStatuses[i]?.connected ? "bg-emerald-500" : "bg-red-400"}`}
                        data-testid={`dot-speaker-${sp.id}`}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${primary.status?.connected ? "bg-emerald-500 shadow-sm shadow-emerald-500/50" : "bg-red-500 shadow-sm shadow-red-500/50"}`} data-testid="status-connection" />
                  <span className="text-xs text-[#707372] truncate">{room.speakers[0].ipAddress}</span>
                </>
              )}
            </div>
          </div>

          {/* Sync / Individual toggle for multi-speaker rooms */}
          {isMulti && (
            <button
              onClick={() => setSyncMode((v) => !v)}
              data-testid="button-sync-toggle"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
                syncMode
                  ? "bg-[#FF8200] text-white shadow-sm shadow-[#FF8200]/20"
                  : "bg-slate-100 dark:bg-slate-800 text-[#707372] hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {syncMode ? <Link2 className="w-3.5 h-3.5" /> : <Unlink className="w-3.5 h-3.5" />}
              {syncMode ? "Synced" : "Individual"}
            </button>
          )}
        </div>
      </header>

      {/* ── SYNC MODE (or single speaker) ── */}
      {syncMode && (
        <>
          {!primary.status?.connected && (
            <div className="mx-5 mt-3 p-3.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-400">
                {isMulti ? "Primary speaker unreachable" : "Speaker unreachable — check network and credentials"}
              </p>
            </div>
          )}

          <main className="flex-1 flex flex-col items-center justify-center px-5 py-8">
            <div className="w-full max-w-sm space-y-10">
              <div className="text-center">
                <VolumeKnobDisplay volume={primary.currentVolume} max={primary.maxVolume} />
                {isMulti && (
                  <p className="text-xs text-[#707372] mt-2">Controls all {room.speakers.length} speakers together</p>
                )}
              </div>

              <VolumeControls
                currentVolume={primary.currentVolume}
                maxVolume={primary.maxVolume}
                isMuted={primary.isMuted}
                changingVolume={primary.changingVolume}
                onSliderChange={isMulti ? handleSyncSlider : primary.handleSliderChange}
                onDecrement={() => isMulti ? setVolumeAll(Math.max(0, primary.currentVolume - 1)) : primary.adjustVolume("decrement")}
                onIncrement={() => isMulti ? setVolumeAll(Math.min(primary.maxVolume, primary.currentVolume + 1)) : primary.adjustVolume("increment")}
                onMuteToggle={isMulti ? toggleMuteAll : primary.toggleMute}
                onPreset={(v) => { primary.setSliderValue(v); isMulti ? setVolumeAll(v) : primary.setVolume(v); }}
                muteLabel={isMulti ? "All" : "Speaker"}
              />

              {/* Per-speaker connection status strip (multi only) */}
              {isMulti && (
                <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700/60 shadow-sm">
                  {room.speakers.map((sp, i) => (
                    <div key={sp.id} className="flex items-center gap-3 px-4 py-3" data-testid={`row-speaker-status-${sp.id}`}>
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${allStatuses[i]?.connected ? "bg-emerald-500" : "bg-red-400"}`} />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex-1">{sp.label}</span>
                      <span className="text-xs text-[#707372]">{sp.ipAddress}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </main>
        </>
      )}

      {/* ── INDIVIDUAL MODE ── */}
      {!syncMode && isMulti && (
        <main className="flex-1 px-5 py-5 overflow-y-auto">
          <div className="max-w-lg mx-auto space-y-4">
            <p className="text-xs text-[#707372] text-center mb-1">Each speaker is controlled independently</p>
            {room.speakers.map((sp) => (
              <IndividualSpeakerCard key={sp.id} speaker={sp} />
            ))}
          </div>
        </main>
      )}

      <footer className="text-center pb-5 px-5 safe-bottom">
        <p className="text-xs text-[#707372]/60">IP-A1 Volume Controller</p>
      </footer>
    </div>
  );
}

// ─── Home (root) ──────────────────────────────────────────────────────────────
export default function Home() {
  const [rooms, setRooms] = useState<Room[]>(() => loadRoomsFromCache());
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [adminMode, setAdminMode] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "synced" | "syncing" | "offline" | "error">("syncing");
  const { toast } = useToast();

  const loadFromServer = useCallback(async () => {
    setSyncStatus("syncing");
    try {
      const serverRooms = await fetchRoomsFromServer();
      setRooms(serverRooms);
      saveRoomsToCache(serverRooms);
      setSyncStatus("idle");
    } catch {
      const cached = loadRoomsFromCache();
      setRooms(cached);
      setSyncStatus("offline");
    }
  }, []);

  useEffect(() => { loadFromServer(); }, [loadFromServer]);

  const updateRooms = useCallback(async (newRooms: Room[]) => {
    setRooms(newRooms);
    saveRoomsToCache(newRooms);
    setSyncStatus("syncing");
    try {
      await saveRoomsToServer(newRooms);
      setSyncStatus("synced");
      setTimeout(() => setSyncStatus("idle"), 3000);
    } catch (err: any) {
      setSyncStatus("error");
      toast({ title: "Could not save to config file", description: err?.message || "Check that the server is running.", variant: "destructive" });
    }
  }, [toast]);

  const handleAddRoom = (room: Room) => {
    if (editingRoom) {
      updateRooms(rooms.map((r) => (r.id === room.id ? room : r)));
    } else {
      updateRooms([...rooms, room]);
    }
    setShowAddDialog(false);
    setEditingRoom(null);
  };

  const handleDeleteRoom = (id: string) => updateRooms(rooms.filter((r) => r.id !== id));

  const handleToggleAdmin = () => {
    if (adminMode) { setAdminMode(false); }
    else { setShowPasswordDialog(true); }
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
        adminMode={adminMode}
        onToggleAdmin={handleToggleAdmin}
        syncStatus={syncStatus}
        onRefresh={loadFromServer}
      />
      {showPasswordDialog && (
        <AdminPasswordDialog
          onUnlock={() => { setAdminMode(true); setShowPasswordDialog(false); }}
          onCancel={() => setShowPasswordDialog(false)}
        />
      )}
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
