import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { User, Contact } from "@shared/schema";
import {
  ArrowLeft, PlusCircle, Pencil, Trash2, X, Users, Radio,
  Shield, ShieldCheck, Wrench, Eye, EyeOff, MicOff,
  Wifi, PhoneCall, UserCheck,
} from "lucide-react";

const INPUT_CLS = "w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FF8200] focus:border-transparent transition-all text-sm";
const SELECT_CLS = "w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF8200] focus:border-transparent text-sm";

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function blankSpeaker(i: number) {
  return { id: generateId(), label: `Speaker ${i + 1}`, ipAddress: "", username: "", password: "" };
}

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

// ─── User Form ────────────────────────────────────────────────────────────────
function UserFormDialog({ contacts, onSave, onCancel, editUser }: {
  contacts: Contact[];
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

  const toggleContact = (id: string) => {
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
              <option value="admin">Admin — User &amp; contact management</option>
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
              className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors relative ${ttsEnabled ? "bg-[#FF8200]" : "bg-slate-200 dark:bg-slate-600"}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-[left] duration-150 ${ttsEnabled ? "left-[22px]" : "left-[2px]"}`} />
            </button>
          </div>

          {role === "user" && contacts.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Assigned Contacts</label>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {contacts.map((c) => (
                  <label key={c.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700">
                    <input
                      type="checkbox"
                      data-testid={`checkbox-room-${c.id}`}
                      checked={assignedRoomIds.includes(c.id)}
                      onChange={() => toggleContact(c.id)}
                      className="w-4 h-4 accent-[#FF8200]"
                    />
                    <div className="flex items-center gap-2 flex-1">
                      {c.mode === "pg"
                        ? <PhoneCall className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                        : <Wifi className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{c.name}</span>
                    </div>
                    <span className="text-xs text-slate-400 ml-auto">
                      {c.mode === "pg" ? `Ext: ${c.pgExtension || "—"}` : `${c.speakers?.length || 0} spk`}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {role === "user" && contacts.length === 0 && (
            <p className="text-xs text-slate-400 bg-slate-50 dark:bg-slate-700 rounded-xl px-4 py-3">
              No contacts exist yet. Add contacts first, then assign them to users.
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

// ─── Contact Form ─────────────────────────────────────────────────────────────
function ContactFormDialog({ onSave, onCancel, editContact }: {
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
  editContact?: Contact | null;
}) {
  const [name, setName] = useState(editContact?.name || "");
  const [mode, setMode] = useState<"direct" | "pg">(editContact?.mode || "direct");
  const [pgExtension, setPgExtension] = useState(editContact?.pgExtension || "");
  const [pgId, setPgId] = useState((editContact as any)?.pgId || "");
  const [codec, setCodec] = useState<string>(editContact?.codec || "");
  const [speakers, setSpeakers] = useState<any[]>(
    editContact?.speakers?.length ? editContact.speakers : [blankSpeaker(0)]
  );
  const [saving, setSaving] = useState(false);
  const [gateways, setGateways] = useState<any[]>([]);

  useEffect(() => {
    apiFetch("/api/gateways").then((r) => r.ok ? r.json() : []).then(setGateways).catch(() => {});
  }, []);

  const updateSpeaker = (i: number, field: string, value: string) => {
    setSpeakers((prev) => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    try {
      if (mode === "direct") {
        const validSpeakers = speakers.filter((s) => s.ipAddress?.trim() && s.username?.trim() && s.password?.trim());
        if (validSpeakers.length === 0) return;
        await onSave({
          ...(editContact ? { id: editContact.id } : {}),
          name: name.trim(),
          mode: "direct",
          speakers: validSpeakers,
          pgExtension: "",
          codec: codec || undefined,
          syncMode: editContact?.syncMode ?? true,
        });
      } else {
        await onSave({
          ...(editContact ? { id: editContact.id } : {}),
          name: name.trim(),
          mode: "pg",
          speakers: [],
          pgExtension: pgExtension.trim(),
          pgId: pgId || undefined,
          codec: codec || undefined,
          syncMode: false,
        });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
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
              data-testid="input-contact-name"
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
                { value: "pg", label: "PG Gateway", desc: "Route via IP-A1PG", icon: PhoneCall },
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
                <div key={spk.id || i} className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 space-y-3 border border-slate-200 dark:border-slate-600">
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
                    value={spk.label}
                    onChange={(e) => updateSpeaker(i, "label", e.target.value)}
                    placeholder="Label (e.g. Main Speaker)"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF8200]"
                  />
                  <input
                    value={spk.ipAddress}
                    onChange={(e) => updateSpeaker(i, "ipAddress", e.target.value)}
                    placeholder="IP Address (e.g. 192.168.1.100)"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF8200]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={spk.username}
                      onChange={(e) => updateSpeaker(i, "username", e.target.value)}
                      placeholder="Username"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF8200]"
                    />
                    <input
                      type="password"
                      value={spk.password}
                      onChange={(e) => updateSpeaker(i, "password", e.target.value)}
                      placeholder="Password"
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
              disabled={saving}
              className="flex-1 bg-[#FF8200] hover:bg-[#e07200] text-white"
            >
              {saving ? "Saving…" : editContact ? "Save Changes" : "Add Contact"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Admin Page ───────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [tab, setTab] = useState<"users" | "contacts">("users");
  const [users, setUsers] = useState<User[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [usersRes, contactsRes] = await Promise.all([
        apiFetch("/api/users"),
        apiFetch("/api/rooms"),
      ]);
      if (usersRes.ok) setUsers(await usersRes.json());
      if (contactsRes.ok) setContacts(await contactsRes.json());
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  // ── User CRUD ──
  async function handleSaveUser(data: any) {
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
      setShowUserForm(false);
      setEditingUser(null);
      toast({ title: editingUser ? "User updated" : "User created" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  async function handleDeleteUser(u: User) {
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

  // ── Contact CRUD ──
  async function handleSaveContact(data: any) {
    try {
      const isEdit = !!editingContact;
      const url = isEdit ? `/api/contacts/${editingContact!.id}` : "/api/contacts";
      const method = isEdit ? "PUT" : "POST";
      const res = await apiFetch(url, { method, body: JSON.stringify(data) });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast({ title: "Error", description: err.error, variant: "destructive" });
        return;
      }

      await loadData();
      setShowContactForm(false);
      setEditingContact(null);
      toast({ title: isEdit ? "Contact updated" : "Contact created" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  async function handleDeleteContact(c: Contact) {
    if (!confirm(`Delete contact "${c.name}"? This cannot be undone.`)) return;
    try {
      const res = await apiFetch(`/api/contacts/${c.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast({ title: "Error", description: err.error, variant: "destructive" });
        return;
      }
      await loadData();
      toast({ title: "Contact deleted" });
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
              <div className="text-xs text-slate-400">User &amp; contact management</div>
            </div>
          </div>
          <div className="ml-auto">
            {tab === "users" ? (
              <Button
                data-testid="button-add-user"
                onClick={() => { setEditingUser(null); setShowUserForm(true); }}
                className="bg-[#FF8200] hover:bg-[#e07200] text-white rounded-xl text-sm font-semibold"
              >
                <PlusCircle className="w-4 h-4 mr-1.5" /> Add User
              </Button>
            ) : (
              <Button
                data-testid="button-add-contact"
                onClick={() => { setEditingContact(null); setShowContactForm(true); }}
                className="bg-[#FF8200] hover:bg-[#e07200] text-white rounded-xl text-sm font-semibold"
              >
                <PlusCircle className="w-4 h-4 mr-1.5" /> Add Contact
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-4xl mx-auto px-4 flex gap-1 pt-1">
          {[
            { key: "users", label: "Users", icon: Users },
            { key: "contacts", label: "Contacts", icon: Radio },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key as any)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === key
                ? "border-[#FF8200] text-[#FF8200]"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
            >
              <Icon className="w-4 h-4" /> {label}
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${tab === key ? "bg-[#FF8200]/10 text-[#FF8200]" : "bg-slate-100 dark:bg-slate-700 text-slate-500"}`}>
                {key === "users" ? users.length : contacts.length}
              </span>
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
        ) : tab === "users" ? (
          <div className="space-y-3">
            {users.map((u) => {
              const assignedContacts = contacts.filter((c) => u.assignedRoomIds?.includes(c.id));
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
                              {assignedContacts.length === 0
                                ? "No contacts assigned"
                                : assignedContacts.map((c) => c.name).join(", ")}
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
                          onClick={() => { setEditingUser(u); setShowUserForm(true); }}
                          className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {u.id !== user?.id && (
                          <button
                            data-testid={`button-delete-user-${u.id}`}
                            onClick={() => handleDeleteUser(u)}
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
        ) : (
          <div className="space-y-3">
            {contacts.map((c) => {
              const usersWithAccess = users.filter((u) => u.assignedRoomIds?.includes(c.id));
              return (
                <Card key={c.id} className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-2xl" data-testid={`card-contact-${c.id}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${c.mode === "pg" ? "bg-blue-100 dark:bg-blue-900/30" : "bg-green-100 dark:bg-green-900/30"}`}>
                          {c.mode === "pg"
                            ? <PhoneCall className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            : <Wifi className="w-5 h-5 text-green-600 dark:text-green-400" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 dark:text-white">{c.name}</span>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${c.mode === "pg" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"}`}>
                              {c.mode === "pg" ? "PG Gateway" : "Direct SIP"}
                            </span>
                            {c.codec && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                {c.codec}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
                            {c.mode === "pg"
                              ? `Extension: ${c.pgExtension || "—"}`
                              : `${c.speakers?.length || 0} speaker${(c.speakers?.length || 0) !== 1 ? "s" : ""}`}
                          </div>
                          {usersWithAccess.length > 0 && (
                            <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                              <UserCheck className="w-3 h-3" />
                              {usersWithAccess.map((u) => u.displayName).join(", ")}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          data-testid={`button-edit-contact-${c.id}`}
                          onClick={() => { setEditingContact(c); setShowContactForm(true); }}
                          className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          data-testid={`button-delete-contact-${c.id}`}
                          onClick={() => handleDeleteContact(c)}
                          className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {contacts.length === 0 && (
              <div className="text-center py-16 text-slate-400">
                <Radio className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No contacts yet</p>
                <p className="text-sm mt-1">Add contacts to configure paging destinations.</p>
              </div>
            )}
          </div>
        )}
      </main>

      {showUserForm && (
        <UserFormDialog
          contacts={contacts}
          editUser={editingUser}
          onSave={handleSaveUser}
          onCancel={() => { setShowUserForm(false); setEditingUser(null); }}
        />
      )}

      {showContactForm && (
        <ContactFormDialog
          editContact={editingContact}
          onSave={handleSaveContact}
          onCancel={() => { setShowContactForm(false); setEditingContact(null); }}
        />
      )}
    </div>
  );
}
