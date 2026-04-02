import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { SystemSettings, LogEntry, PgGateway, GlobalPreset } from "@shared/schema";
import { SUPPORTED_LANGUAGES } from "@shared/schema";
import {
  ArrowLeft, Settings, Radio, Mic, FileText, Trash2,
  Save, AlertCircle, CheckCircle2, Loader2, RefreshCw, ChevronDown, ChevronRight, Plus,
  Download, Upload, Zap, X, Pencil, Globe,
} from "lucide-react";

const INPUT_CLS = "w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FF8200] focus:border-transparent transition-all text-sm";
const SELECT_CLS = "w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF8200] focus:border-transparent text-sm";

function Section({ title, icon: Icon, children, defaultOpen = true }: {
  title: string;
  icon: any;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#FF8200]/10 rounded-xl flex items-center justify-center">
            <Icon className="w-4 h-4 text-[#FF8200]" />
          </div>
          <span className="font-bold text-slate-900 dark:text-white">{title}</span>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <CardContent className="p-5">{children}</CardContent>}
    </Card>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">{label}</label>
      {hint && <p className="text-xs text-slate-400 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

function LogLevelBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    info: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    warn: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
    error: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
    tts: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    sip: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${styles[level] || styles.info}`}>
      {level}
    </span>
  );
}

export default function ItSettingsPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [presets, setPresets] = useState<GlobalPreset[]>([]);
  const [showPresetForm, setShowPresetForm] = useState(false);
  const [editingPreset, setEditingPreset] = useState<GlobalPreset | null>(null);
  const [presetName, setPresetName] = useState("");
  const [presetText, setPresetText] = useState("");
  const [presetPrimaryLang, setPresetPrimaryLang] = useState("en-us");
  const [presetSpeed, setPresetSpeed] = useState(1.0);
  const [presetSecondLangEnabled, setPresetSecondLangEnabled] = useState(false);
  const [presetSecondText, setPresetSecondText] = useState("");
  const [presetSecondLang, setPresetSecondLang] = useState("fr");
  const [presetSaving, setPresetSaving] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const [settingsRes, logsRes, statusRes, presetsRes] = await Promise.all([
        apiFetch("/api/settings"),
        apiFetch("/api/logs?limit=100"),
        apiFetch("/api/system/status"),
        apiFetch("/api/global-presets"),
      ]);
      if (settingsRes.ok) setSettings(await settingsRes.json());
      if (logsRes.ok) setLogs(await logsRes.json());
      if (statusRes.ok) setStatus(await statusRes.json());
      if (presetsRes.ok) setPresets(await presetsRes.json());
    } catch {}
    setLoading(false);
  }

  async function refreshPresets() {
    try {
      const res = await apiFetch("/api/global-presets");
      if (res.ok) setPresets(await res.json());
    } catch {}
  }

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    const hasGenerating = presets.some((p) => !p.audioReady && !p.audioError);
    if (hasGenerating) {
      if (!pollRef.current) pollRef.current = setInterval(refreshPresets, 3000);
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [presets]);

  function openPresetForm(p?: GlobalPreset) {
    setEditingPreset(p ?? null);
    setPresetName(p?.name ?? "");
    setPresetText(p?.text ?? "");
    setPresetPrimaryLang(p?.language ?? "en-us");
    setPresetSpeed(p?.voiceSpeed ?? 1.0);
    setPresetSecondLangEnabled(!!(p?.secondText));
    setPresetSecondText(p?.secondText ?? "");
    setPresetSecondLang(p?.secondLanguage ?? "fr");
    setShowPresetForm(true);
  }

  async function handleSavePreset(e: React.FormEvent) {
    e.preventDefault();
    if (!presetName.trim() || !presetText.trim()) return;
    setPresetSaving(true);
    try {
      const url = editingPreset ? `/api/global-presets/${editingPreset.id}` : "/api/global-presets";
      const method = editingPreset ? "PUT" : "POST";
      const res = await apiFetch(url, {
        method,
        body: JSON.stringify({
          name: presetName.trim(),
          text: presetText.trim(),
          language: presetPrimaryLang,
          voiceSpeed: presetSpeed,
          secondText: presetSecondLangEnabled && presetSecondText.trim() ? presetSecondText.trim() : undefined,
          secondLanguage: presetSecondLangEnabled && presetSecondText.trim() ? presetSecondLang : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast({ title: "Error", description: err.error, variant: "destructive" });
        return;
      }
      await refreshPresets();
      setShowPresetForm(false);
      toast({ title: editingPreset ? "Preset updated — regenerating audio…" : "Preset created — generating audio…" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setPresetSaving(false);
    }
  }

  async function handleDeletePreset(p: GlobalPreset) {
    if (!confirm(`Delete preset "${p.name}"? The audio file will also be removed.`)) return;
    try {
      const res = await apiFetch(`/api/global-presets/${p.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast({ title: "Error", description: err.error, variant: "destructive" });
        return;
      }
      await refreshPresets();
      toast({ title: "Preset deleted" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  async function handleRegeneratePreset(p: GlobalPreset) {
    try {
      await apiFetch(`/api/global-presets/${p.id}/regenerate`, { method: "POST" });
      await refreshPresets();
      toast({ title: "Regenerating audio…" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/settings", { method: "PUT", body: JSON.stringify(settings) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast({ title: "Save failed", description: err.error, variant: "destructive" });
        return;
      }
      const updated = await res.json();
      setSettings(updated);
      toast({ title: "Settings saved" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleClearLogs() {
    if (!confirm("Clear all logs? This cannot be undone.")) return;
    try {
      await apiFetch("/api/logs", { method: "DELETE" });
      setLogs([]);
      toast({ title: "Logs cleared" });
    } catch {}
  }

  async function handleExport() {
    try {
      const res = await apiFetch("/api/settings/export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `voxnova-config-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Configuration exported" });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    }
  }

  function handleImportClick() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const payload = JSON.parse(text);
        if (!payload.settings && !payload.rooms) {
          throw new Error("Invalid config file — missing settings or rooms.");
        }
        if (!confirm("This will replace all current settings and contacts. Continue?")) return;
        const res = await apiFetch("/api/settings/import", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Import failed");
        }
        toast({ title: "Configuration imported", description: "Reloading settings…" });
        await loadAll();
      } catch (e: any) {
        toast({ title: "Import failed", description: e.message, variant: "destructive" });
      }
    };
    input.click();
  }

  async function handleContactsExport() {
    try {
      const res = await apiFetch("/api/contacts/export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `voxnova-contacts-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Contacts exported" });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    }
  }

  function handleContactsImportClick() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const payload = JSON.parse(text);
        if (!payload.contacts || !Array.isArray(payload.contacts)) {
          throw new Error("Invalid contacts file — expected a contacts array.");
        }
        if (!confirm(`This will replace all ${payload.contacts.length} contacts. Continue?`)) return;
        const res = await apiFetch("/api/contacts/import", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Import failed");
        }
        toast({ title: "Contacts imported", description: `${payload.contacts.length} contacts loaded.` });
        await loadAll();
      } catch (e: any) {
        toast({ title: "Import failed", description: e.message, variant: "destructive" });
      }
    };
    input.click();
  }

  function updateSip(key: string, value: any) {
    setSettings((s) => s ? { ...s, sip: { ...s.sip, [key]: value } } : s);
  }
  function addPg() {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const newGw: PgGateway = { id, name: "New Gateway", address: "", port: 5060, defaultExtension: "" };
    setSettings((s) => s ? { ...s, pgs: [...(s.pgs ?? []), newGw] } : s);
  }
  function updatePgGateway(id: string, key: string, value: any) {
    setSettings((s) => s ? { ...s, pgs: (s.pgs ?? []).map((g) => g.id === id ? { ...g, [key]: value } : g) } : s);
  }
  function removePg(id: string) {
    setSettings((s) => s ? { ...s, pgs: (s.pgs ?? []).filter((g) => g.id !== id) } : s);
  }
  function updateTts(key: string, value: any) {
    setSettings((s) => s ? { ...s, tts: { ...s.tts, [key]: value } } : s);
  }
  function updateLogging(key: string, value: any) {
    setSettings((s) => s ? { ...s, logging: { ...s.logging, [key]: value } } : s);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="text-slate-400 text-sm">Loading settings…</div>
      </div>
    );
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
            <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
              <Settings className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <div className="font-bold text-slate-900 dark:text-white">IT Settings</div>
              <div className="text-xs text-slate-400">System configuration &amp; diagnostics</div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button
              data-testid="button-refresh-settings"
              onClick={loadAll}
              className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
            {/* Config export/import */}
            <div className="flex items-center gap-0.5">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-1">Config</span>
              <button
                data-testid="button-export-config"
                onClick={handleExport}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                title="Export full configuration"
              >
                <Upload className="w-4 h-4" />
              </button>
              <button
                data-testid="button-import-config"
                onClick={handleImportClick}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                title="Import full configuration"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
            <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
            {/* Contacts export/import */}
            <div className="flex items-center gap-0.5">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-1">Contacts</span>
              <button
                data-testid="button-export-contacts"
                onClick={handleContactsExport}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                title="Export contacts list"
              >
                <Upload className="w-4 h-4" />
              </button>
              <button
                data-testid="button-import-contacts"
                onClick={handleContactsImportClick}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                title="Import contacts list"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
            <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
            <Button
              data-testid="button-save-settings"
              onClick={handleSave}
              disabled={saving}
              className="bg-[#FF8200] hover:bg-[#e07200] text-white rounded-xl text-sm font-semibold"
            >
              {saving ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Saving…</> : <><Save className="w-4 h-4 mr-1.5" />Save All</>}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {/* System Status — 3 cards: Server, TTS Engine, Paging Gateway */}
        {status && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: "server", label: "Server" },
              { key: "tts", label: "TTS Engine" },
              { key: "pg", label: "Paging Gateway" },
            ].map(({ key, label }) => {
              const raw = status[key];
              const statusStr: string = raw && typeof raw === "object" ? (raw as any).status : (raw as string);
              const ttsMsg: string | undefined = key === "tts" && raw && typeof raw === "object" ? (raw as any).message : undefined;
              return (
                <div key={key} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-center">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">{label}</div>
                  {statusStr === "ok" && <CheckCircle2 className="w-6 h-6 text-green-500 mx-auto" />}
                  {statusStr === "unconfigured" && <AlertCircle className="w-6 h-6 text-slate-300 mx-auto" />}
                  {(statusStr === "error" || statusStr === "unavailable") && <AlertCircle className="w-6 h-6 text-red-500 mx-auto" />}
                  {statusStr === "checking" && <Loader2 className="w-6 h-6 text-yellow-500 mx-auto animate-spin" />}
                  <div className={`text-xs mt-1.5 font-medium capitalize ${
                    statusStr === "ok" ? "text-green-600" :
                    statusStr === "unconfigured" ? "text-slate-400" :
                    "text-red-500"}`}>
                    {statusStr}
                  </div>
                  {ttsMsg && (
                    <div className="text-xs text-slate-400 mt-1 leading-tight">{ttsMsg}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {settings && (
          <>
            {/* SIP Settings — hidden until SIP PBX integration is needed */}

            {/* Paging Gateways */}
            <Section title="Paging Gateways" icon={Radio}>
              <div className="space-y-4">
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-3 text-xs text-orange-700 dark:text-orange-400 flex gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>Paging Gateways convert TTS audio to multicast zones. Add one or more gateways and assign them to contacts. The default extension is used when a contact doesn't specify one.</span>
                </div>

                {(settings.pgs ?? []).length === 0 && (
                  <div className="text-center py-6 text-slate-400 text-sm">No gateways configured. Add one below.</div>
                )}

                {(settings.pgs ?? []).map((gw, idx) => (
                  <div key={gw.id} className="border border-slate-200 dark:border-slate-600 rounded-xl p-4 space-y-3 bg-slate-50 dark:bg-slate-700/30">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Gateway {idx + 1}</span>
                      <button
                        type="button"
                        data-testid={`button-remove-pg-${gw.id}`}
                        onClick={() => removePg(gw.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <Field label="Gateway Name">
                      <input
                        data-testid={`input-pg-name-${gw.id}`}
                        value={gw.name}
                        onChange={(e) => updatePgGateway(gw.id, "name", e.target.value)}
                        placeholder="e.g. Main Building, Floor 2…"
                        className={INPUT_CLS}
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="IP Address">
                        <input
                          data-testid={`input-pg-address-${gw.id}`}
                          value={gw.address}
                          onChange={(e) => updatePgGateway(gw.id, "address", e.target.value)}
                          placeholder="192.168.1.50"
                          className={INPUT_CLS}
                        />
                      </Field>
                      <Field label="SIP Port">
                        <input
                          data-testid={`input-pg-port-${gw.id}`}
                          type="number"
                          value={gw.port}
                          onChange={(e) => updatePgGateway(gw.id, "port", Number(e.target.value))}
                          className={INPUT_CLS}
                        />
                      </Field>
                    </div>
                    <Field label="Default Zone Extension" hint="Used when a contact doesn't specify an extension">
                      <input
                        data-testid={`input-pg-ext-${gw.id}`}
                        value={gw.defaultExtension}
                        onChange={(e) => updatePgGateway(gw.id, "defaultExtension", e.target.value)}
                        placeholder="e.g. 1"
                        className={INPUT_CLS}
                      />
                    </Field>
                  </div>
                ))}

                <button
                  type="button"
                  data-testid="button-add-pg"
                  onClick={addPg}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-[#FF8200] hover:text-[#FF8200] transition-colors text-sm font-medium"
                >
                  <Plus className="w-4 h-4" /> Add Paging Gateway
                </button>
              </div>
            </Section>

            {/* TTS Settings */}
            <Section title="TTS Engine" icon={Mic}>
              <div className="space-y-5">
                {status?.tts?.status === "ok" ? (
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 text-xs text-green-700 dark:text-green-300 space-y-1">
                    <div className="font-semibold flex items-center gap-1.5"><Mic className="w-3.5 h-3.5" /> Kokoro TTS is ready</div>
                    <p>The TTS engine is installed and running. Voice announcements are enabled.</p>
                  </div>
                ) : (
                  <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 text-xs text-orange-700 dark:text-orange-400 space-y-2">
                    <div className="font-semibold flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> Kokoro TTS not detected</div>
                    <p>To enable real audio generation, install Python 3.12 and Kokoro TTS on the host machine:</p>
                    <code className="block bg-black/10 dark:bg-black/20 rounded-lg px-3 py-2 font-mono text-orange-800 dark:text-orange-200">
                      pip install kokoro soundfile
                    </code>
                    <p>Python 3.12 must be installed and added to PATH. Restart the server after installation.</p>
                    <p>Kokoro is a free, open-source 82M parameter TTS model (Apache 2.0 license).</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Default Codec">
                    <select data-testid="select-default-codec" value={settings.tts.defaultCodec} onChange={(e) => updateTts("defaultCodec", e.target.value)} className={SELECT_CLS}>
                      <option value="PCMU">G.711u (PCMU) — 8kHz, μ-law</option>
                      <option value="PCMA">G.711a (PCMA) — 8kHz, A-law</option>
                      <option value="G722">G.722 — 16kHz wideband</option>
                    </select>
                  </Field>
                  <Field label="Default Mode">
                    <select data-testid="select-default-mode" value={settings.tts.defaultMode} onChange={(e) => updateTts("defaultMode", e.target.value)} className={SELECT_CLS}>
                      <option value="direct">Direct SIP</option>
                      <option value="pg">PG Gateway</option>
                    </select>
                  </Field>
                </div>

                <div>
                  <div className="flex justify-between mb-1.5">
                    <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Default DTMF Delay (PG mode)</label>
                    <span className="text-sm font-bold text-[#FF8200]">{settings.tts.dtmfDelayMs}ms</span>
                  </div>
                  <div className="px-1"><input data-testid="input-default-dtmf-delay" type="range" min={200} max={2000} step={50} value={settings.tts.dtmfDelayMs} onChange={(e) => updateTts("dtmfDelayMs", Number(e.target.value))} className="w-full accent-[#FF8200]" /></div>
                  <div className="flex justify-between text-xs text-slate-400 mt-0.5"><span>200ms (fast)</span><span>2000ms (slow)</span></div>
                </div>

                <div className="flex items-center justify-between gap-4 py-2 border-t border-slate-100 dark:border-slate-700">
                  <div>
                    <div className="text-sm font-medium text-slate-600 dark:text-slate-300">Default Chime Enabled</div>
                    <div className="text-xs text-slate-400">Play a chime before announcements (PG mode)</div>
                  </div>
                  <button
                    type="button"
                    data-testid="toggle-chime-default"
                    onClick={() => updateTts("chimeEnabled", !settings.tts.chimeEnabled)}
                    className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors relative ${settings.tts.chimeEnabled ? "bg-[#FF8200]" : "bg-slate-200 dark:bg-slate-600"}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-[left] duration-150 ${settings.tts.chimeEnabled ? "left-[22px]" : "left-[2px]"}`} />
                  </button>
                </div>

                {settings.tts.chimeEnabled && (
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Default Post-Chime Delay</label>
                      <span className="text-sm font-bold text-[#FF8200]">{settings.tts.chimeDelayMs}ms</span>
                    </div>
                    <div className="px-1"><input data-testid="input-default-chime-delay" type="range" min={300} max={10000} step={50} value={settings.tts.chimeDelayMs} onChange={(e) => updateTts("chimeDelayMs", Number(e.target.value))} className="w-full accent-[#FF8200]" /></div>
                    <div className="flex justify-between text-xs text-slate-400 mt-0.5"><span>300ms</span><span>10000ms</span></div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <div className="flex justify-between mb-1">
                      <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Voice Speed</label>
                      <span className="text-sm font-bold text-[#FF8200]">{settings.tts.voiceSpeed.toFixed(1)}x</span>
                    </div>
                    <div className="px-1"><input data-testid="input-voice-speed" type="range" min={0.5} max={2.0} step={0.1} value={settings.tts.voiceSpeed} onChange={(e) => updateTts("voiceSpeed", parseFloat(e.target.value))} className="w-full accent-[#FF8200]" /></div>
                    <div className="flex justify-between text-xs text-slate-400 mt-0.5"><span>0.5x</span><span>2.0x</span></div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Voice Pitch</label>
                      <span className="text-sm font-bold text-[#FF8200]">{settings.tts.voicePitch.toFixed(1)}x</span>
                    </div>
                    <div className="px-1"><input data-testid="input-voice-pitch" type="range" min={0.5} max={2.0} step={0.1} value={settings.tts.voicePitch} onChange={(e) => updateTts("voicePitch", parseFloat(e.target.value))} className="w-full accent-[#FF8200]" /></div>
                    <div className="flex justify-between text-xs text-slate-400 mt-0.5"><span>0.5x</span><span>2.0x</span></div>
                  </div>
                </div>
              </div>
            </Section>

            {/* Logging Settings */}
            <Section title="Logging" icon={FileText} defaultOpen={false}>
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-600 dark:text-slate-300">Enable Logging</div>
                    <div className="text-xs text-slate-400">Record system events, TTS, and SIP activity</div>
                  </div>
                  <button
                    type="button"
                    data-testid="toggle-logging"
                    onClick={() => updateLogging("enabled", !settings.logging.enabled)}
                    className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors relative ${settings.logging.enabled ? "bg-[#FF8200]" : "bg-slate-200 dark:bg-slate-600"}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-[left] duration-150 ${settings.logging.enabled ? "left-[22px]" : "left-[2px]"}`} />
                  </button>
                </div>
                <Field label="Retain Logs (days)">
                  <input data-testid="input-retain-days" type="number" min={1} max={365} value={settings.logging.retainDays} onChange={(e) => updateLogging("retainDays", Number(e.target.value))} className={INPUT_CLS} />
                </Field>
              </div>
            </Section>
          </>
        )}

        {/* Global Presets */}
        <Card className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#FF8200]/10 rounded-xl flex items-center justify-center">
                <Zap className="w-4 h-4 text-[#FF8200]" />
              </div>
              <div>
                <span className="font-bold text-slate-900 dark:text-white">Global Presets</span>
                <span className="text-xs text-slate-400 ml-2">({presets.length}/10)</span>
              </div>
            </div>
            {presets.length < 10 && (
              <button
                data-testid="button-add-preset"
                onClick={() => openPresetForm()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm bg-[#FF8200] text-white hover:bg-[#e07200] font-semibold"
              >
                <Plus className="w-4 h-4" /> New Preset
              </button>
            )}
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {presets.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm">
                <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No presets yet. Create one to get priority announcements.
              </div>
            ) : presets.map((p) => (
              <div key={p.id} className="px-5 py-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-slate-900 dark:text-white text-sm">{p.name}</span>
                    {p.audioReady ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3" /> Ready
                      </span>
                    ) : p.audioError ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">
                        <AlertCircle className="w-3 h-3" /> Error
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">
                        <Loader2 className="w-3 h-3 animate-spin" /> Generating…
                      </span>
                    )}
                    <span className="text-xs text-slate-400">{p.allowedUserIds === null ? "All users" : `${p.allowedUserIds.length} users`}</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{p.text}</p>
                  {p.audioError && <p className="text-xs text-red-500 mt-0.5">{p.audioError}</p>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {(!p.audioReady || p.audioError) && (
                    <button onClick={() => handleRegeneratePreset(p)} title="Regenerate" className="p-2 rounded-xl hover:bg-[#FF8200]/10 text-[#FF8200]">
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => openPresetForm(p)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDeletePreset(p)} className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Preset form modal */}
        {showPresetForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-6 w-full max-w-lg">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-[#FF8200]" />
                  {editingPreset ? "Edit Preset" : "New Global Preset"}
                </h2>
                <button onClick={() => setShowPresetForm(false)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSavePreset} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Preset Name</label>
                  <input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="e.g. Emergency Alert" required className={INPUT_CLS} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Announcement Text</label>
                  <textarea value={presetText} onChange={(e) => setPresetText(e.target.value)} placeholder="Enter the announcement text…" required rows={4} className={INPUT_CLS + " resize-none"} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Voice Speed: <span className="text-[#FF8200] font-bold">{presetSpeed.toFixed(1)}×</span>
                  </label>
                  <div className="px-1">
                    <input type="range" min={0.5} max={2.0} step={0.1} value={presetSpeed} onChange={(e) => setPresetSpeed(Number(e.target.value))} className="w-full accent-[#FF8200]" />
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
                      type="button"
                      onClick={() => setPresetSecondLangEnabled((v) => !v)}
                      className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors relative ${presetSecondLangEnabled ? "bg-[#FF8200]" : "bg-slate-200 dark:bg-slate-600"}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-[left] duration-150 ${presetSecondLangEnabled ? "left-[22px]" : "left-[2px]"}`} />
                    </button>
                  </div>

                  {!presetSecondLangEnabled && (
                    <p className="text-xs text-slate-400">Enable to include a second-language announcement in this preset.</p>
                  )}

                  {presetSecondLangEnabled && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">First language</label>
                          <select value={presetPrimaryLang} onChange={(e) => setPresetPrimaryLang(e.target.value)} className={SELECT_CLS}>
                            {SUPPORTED_LANGUAGES.map((l) => (
                              <option key={l.code} value={l.code}>{l.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Second language</label>
                          <select value={presetSecondLang} onChange={(e) => setPresetSecondLang(e.target.value)} className={SELECT_CLS}>
                            {SUPPORTED_LANGUAGES.filter((l) => l.code !== presetPrimaryLang).map((l) => (
                              <option key={l.code} value={l.code}>{l.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                          Second announcement text <span className="font-normal">({presetSecondLang})</span>
                        </label>
                        <textarea
                          value={presetSecondText}
                          onChange={(e) => setPresetSecondText(e.target.value)}
                          placeholder={`Enter the ${SUPPORTED_LANGUAGES.find((l) => l.code === presetSecondLang)?.label ?? "second language"} text…`}
                          rows={3}
                          className={INPUT_CLS + " resize-none"}
                          maxLength={2000}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowPresetForm(false)} className="flex-1 rounded-xl">Cancel</Button>
                  <Button type="submit" disabled={presetSaving} className="flex-1 bg-[#FF8200] hover:bg-[#e07200] text-white rounded-xl">
                    {presetSaving ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Saving…</> : editingPreset ? "Save Changes" : "Create Preset"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Logs Viewer */}
        <Card className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#FF8200]/10 rounded-xl flex items-center justify-center">
                <FileText className="w-4 h-4 text-[#FF8200]" />
              </div>
              <div>
                <span className="font-bold text-slate-900 dark:text-white">System Logs</span>
                <span className="text-xs text-slate-400 ml-2">({logs.length} entries)</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={loadAll} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                data-testid="button-clear-logs"
                onClick={handleClearLogs}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear
              </button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {logs.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm">No logs yet</div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {logs.map((log) => (
                  <div key={log.id} className="px-5 py-3 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/30" data-testid={`log-entry-${log.id}`}>
                    <div className="shrink-0 pt-0.5"><LogLevelBadge level={log.level} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-800 dark:text-slate-200">{log.message}</div>
                      {log.details && <div className="text-xs text-slate-400 mt-0.5 truncate">{log.details}</div>}
                      <div className="text-xs text-slate-400 mt-0.5">
                        {new Date(log.timestamp).toLocaleString()}
                        {log.user && <span className="ml-2">by {log.user}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}
