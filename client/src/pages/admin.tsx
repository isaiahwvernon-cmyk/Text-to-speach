import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { User, Room } from "@shared/schema";
import {
  ArrowLeft, PlusCircle, Pencil, Trash2, X, Users, Radio,
  Shield, ShieldCheck, Wrench, Check, Eye, EyeOff, Mic, MicOff,
} from "lucide-react";

const INPUT_CLS = "w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FF8200] focus:border-transparent transition-all text-sm";
const SELECT_CLS = "w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF8200] focus:border-transparent text-sm";

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    admin: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    it: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    user: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  };
  const icons: Record<string, any> = { admin: ShieldCheck, it: Wrench, user: Users };
  const Icon = icons[role] || Users;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${styles[role] || styles.user}`}>
      <Icon className="w-3 h-3" />{role}
    </span>
  );
}

function UserFormDialog({ rooms, onSave, onCancel, editUser }: {
  rooms: Room[];
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
  editUser?: User | null;
}) {
  const [username, setUsername] = useState(editUser?.username || "");
  const [displayName, setDisplayName] = useState(editUser?.displayName || "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(editUser?.role || "user");
  const [ttsEnabled, setTtsEnabled] = useState(editUser?.ttsEnabled ?? true);
  const [assignedRoomIds, setAssignedRoomIds] = useState<string[]>(editUser?.assignedRoomIds || []);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggleRoom = (id: string) => {
    setAssignedRoomIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !displayName.trim()) return;
    if (!editUser && !password.trim()) return;

    setSaving(true);
    try {
      await onSave({
        username: username.trim(),
        displayName: displayName.trim(),
        ...(password.trim() ? { password: password.trim() } : {}),
        role,
        ttsEnabled,
        assignedRoomIds: role === "user" ? assignedRoomIds : [],
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {editUser ? "Edit User" : "Add User"}
          </h2>
          <button onClick={onCancel} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Username</label>
              <input
                data-testid="input-new-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
                className={INPUT_CLS}
                disabled={!!editUser}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Display Name</label>
              <input
                data-testid="input-new-displayname"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Full name"
                className={INPUT_CLS}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Password {editUser && <span className="text-xs text-slate-400">(leave blank to keep current)</span>}
            </label>
            <div className="relative">
              <input
                data-testid="input-new-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={editUser ? "New password (optional)" : "Set password"}
                className={INPUT_CLS + " pr-10"}
              />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Role</label>
            <select
              data-testid="select-role"
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className={SELECT_CLS}
            >
              <option value="user">User — Standard paging access</option>
              <option value="admin">Admin — User management</option>
              <option value="it">IT — System configuration</option>
            </select>
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm font-medium text-slate-600 dark:text-slate-300">TTS Enabled</div>
              <div className="text-xs text-slate-400">Allow this user to send TTS announcements</div>
            </div>
            <button
              type="button"
              data-testid="toggle-tts-enabled"
              onClick={() => setTtsEnabled((v) => !v)}
              className={`w-12 h-6 rounded-full transition-colors relative ${ttsEnabled ? "bg-[#FF8200]" : "bg-slate-200 dark:bg-slate-600"}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${ttsEnabled ? "translate-x-6" : "translate-x-0.5"}`} />
            </button>
          </div>

          {role === "user" && rooms.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Assigned Rooms</label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {rooms.map((room) => (
                  <label key={room.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700">
                    <input
                      type="checkbox"
                      data-testid={`checkbox-room-${room.id}`}
                      checked={assignedRoomIds.includes(room.id)}
                      onChange={() => toggleRoom(room.id)}
                      className="w-4 h-4 accent-[#FF8200]"
                    />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{room.name}</span>
                    <span className="text-xs text-slate-400 ml-auto">{room.speakers.length} speaker{room.speakers.length > 1 ? "s" : ""}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {role === "user" && rooms.length === 0 && (
            <p className="text-xs text-slate-400 bg-slate-50 dark:bg-slate-700 rounded-xl px-4 py-3">
              No rooms exist yet. Add rooms from the main dashboard first, then assign them to users.
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
            <Button
              type="submit"
              disabled={saving || !username.trim() || !displayName.trim() || (!editUser && !password.trim())}
              className="flex-1 bg-[#FF8200] hover:bg-[#e07200] text-white"
              data-testid="button-save-user"
            >
              {saving ? "Saving…" : editUser ? "Save Changes" : "Create User"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [usersRes, roomsRes] = await Promise.all([
        apiFetch("/api/users"),
        apiFetch("/api/rooms"),
      ]);
      if (usersRes.ok) setUsers(await usersRes.json());
      if (roomsRes.ok) setRooms(await roomsRes.json());
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function handleSave(data: any) {
    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : "/api/users";
      const method = editingUser ? "PUT" : "POST";
      const res = await apiFetch(url, { method, body: JSON.stringify(data) });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast({ title: "Error", description: err.error, variant: "destructive" });
        return;
      }

      await loadData();
      setShowForm(false);
      setEditingUser(null);
      toast({ title: editingUser ? "User updated" : "User created" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  async function handleDelete(u: User) {
    if (!confirm(`Delete user "${u.displayName}"? This cannot be undone.`)) return;
    try {
      const res = await apiFetch(`/api/users/${u.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast({ title: "Error", description: err.error, variant: "destructive" });
        return;
      }
      await loadData();
      toast({ title: "User deleted" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Navbar */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-4">
          <button
            data-testid="button-back"
            onClick={() => navigate("/")}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-purple-100 rounded-xl flex items-center justify-center">
              <Shield className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <div className="font-bold text-slate-900 dark:text-white">Admin Panel</div>
              <div className="text-xs text-slate-400">User &amp; permission management</div>
            </div>
          </div>
          <div className="ml-auto">
            <Button
              data-testid="button-add-user"
              onClick={() => { setEditingUser(null); setShowForm(true); }}
              className="bg-[#FF8200] hover:bg-[#e07200] text-white rounded-xl text-sm font-semibold"
            >
              <PlusCircle className="w-4 h-4 mr-1.5" /> Add User
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm">Loading users…</div>
        ) : (
          <div className="space-y-3">
            {users.map((u) => {
              const assignedRooms = rooms.filter((r) => u.assignedRoomIds?.includes(r.id));
              return (
                <Card key={u.id} className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-2xl" data-testid={`card-user-${u.id}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 bg-[#FF8200]/10 rounded-2xl flex items-center justify-center text-[#FF8200] font-bold text-base">
                          {u.displayName[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 dark:text-white">{u.displayName}</span>
                            <RoleBadge role={u.role} />
                            {!u.ttsEnabled && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                                <MicOff className="w-3 h-3" /> TTS Off
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">@{u.username}</div>
                          {u.role === "user" && (
                            <div className="text-xs text-slate-400 mt-1">
                              {assignedRooms.length === 0
                                ? "No rooms assigned"
                                : assignedRooms.map((r) => r.name).join(", ")}
                            </div>
                          )}
                          <div className="text-xs text-slate-400 mt-0.5">
                            {(u.presets || []).length}/5 presets
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          data-testid={`button-edit-user-${u.id}`}
                          onClick={() => { setEditingUser(u); setShowForm(true); }}
                          className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {u.id !== user?.id && (
                          <button
                            data-testid={`button-delete-user-${u.id}`}
                            onClick={() => handleDelete(u)}
                            className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {users.length === 0 && (
              <div className="text-center py-16 text-slate-400">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No users yet</p>
              </div>
            )}
          </div>
        )}
      </main>

      {showForm && (
        <UserFormDialog
          rooms={rooms}
          editUser={editingUser}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingUser(null); }}
        />
      )}
    </div>
  );
}
