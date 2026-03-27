import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { SystemSettings, LogEntry } from "@shared/schema";
import {
  ArrowLeft, Settings, Phone, Radio, Mic, FileText, Trash2,
  Save, AlertCircle, CheckCircle2, Loader2, RefreshCw, ChevronDown, ChevronRight,
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

  async function loadAll() {
    setLoading(true);
    try {
      const [settingsRes, logsRes, statusRes] = await Promise.all([
        apiFetch("/api/settings"),
        apiFetch("/api/logs?limit=100"),
        apiFetch("/api/system/status"),
      ]);
      if (settingsRes.ok) setSettings(await settingsRes.json());
      if (logsRes.ok) setLogs(await logsRes.json());
      if (statusRes.ok) setStatus(await statusRes.json());
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

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

  function updateSip(key: string, value: any) {
    setSettings((s) => s ? { ...s, sip: { ...s.sip, [key]: value } } : s);
  }
  function updatePg(key: string, value: any) {
    setSettings((s) => s ? { ...s, pg: { ...s.pg, [key]: value } } : s);
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
          <div className="ml-auto flex gap-2">
            <button
              data-testid="button-refresh-settings"
              onClick={loadAll}
              className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
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
        {/* System Status */}
        {status && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { key: "server", label: "Server" },
              { key: "tts", label: "TTS Engine" },
              { key: "sip", label: "SIP" },
              { key: "pg", label: "PG Gateway" },
            ].map(({ key, label }) => (
              <div key={key} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-center">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">{label}</div>
                {status[key] === "ok" && <CheckCircle2 className="w-6 h-6 text-green-500 mx-auto" />}
                {status[key] === "unconfigured" && <AlertCircle className="w-6 h-6 text-slate-300 mx-auto" />}
                {(status[key] === "error" || status[key] === "unavailable") && <AlertCircle className="w-6 h-6 text-red-500 mx-auto" />}
                {status[key] === "checking" && <Loader2 className="w-6 h-6 text-yellow-500 mx-auto animate-spin" />}
                <div className={`text-xs mt-1.5 font-medium capitalize ${
                  status[key] === "ok" ? "text-green-600" :
                  status[key] === "unconfigured" ? "text-slate-400" :
                  "text-red-500"}`}>
                  {status[key]}
                </div>
                {key === "tts" && status.ttsMessage && (
                  <div className="text-xs text-slate-400 mt-1 leading-tight">{status.ttsMessage}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {settings && (
          <>
            {/* SIP Settings */}
            <Section title="SIP Configuration" icon={Phone}>
              <div className="space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-300 flex gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>SIP credentials are used to place calls to IP-A1 speakers (Direct mode) or the IP-A1PG gateway (PG mode). Configure these to match your SIP server/PBX settings.</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="SIP Server Address">
                    <input data-testid="input-sip-address" value={settings.sip.serverAddress} onChange={(e) => updateSip("serverAddress", e.target.value)} placeholder="192.168.1.1 or sip.example.com" className={INPUT_CLS} />
                  </Field>
                  <Field label="SIP Server Port">
                    <input data-testid="input-sip-port" type="number" value={settings.sip.serverPort} onChange={(e) => updateSip("serverPort", Number(e.target.value))} className={INPUT_CLS} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="SIP Username">
                    <input data-testid="input-sip-username" value={settings.sip.username} onChange={(e) => updateSip("username", e.target.value)} placeholder="sip_user" className={INPUT_CLS} />
                  </Field>
                  <Field label="SIP Password">
                    <input data-testid="input-sip-password" type="password" value={settings.sip.password} onChange={(e) => updateSip("password", e.target.value)} placeholder="••••••••" className={INPUT_CLS} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="From Extension" hint="Extension this server registers as">
                    <input data-testid="input-sip-from" value={settings.sip.fromExtension} onChange={(e) => updateSip("fromExtension", e.target.value)} placeholder="e.g., 100" className={INPUT_CLS} />
                  </Field>
                  <Field label="Realm" hint="Leave blank to auto-detect">
                    <input data-testid="input-sip-realm" value={settings.sip.realm} onChange={(e) => updateSip("realm", e.target.value)} placeholder="Optional" className={INPUT_CLS} />
                  </Field>
                </div>
              </div>
            </Section>

            {/* PG Settings */}
            <Section title="IP-A1PG Gateway" icon={Radio}>
              <div className="space-y-4">
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-3 text-xs text-orange-700 dark:text-orange-400 flex gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>The IP-A1PG converts SIP audio to multicast. Users can override the extension per announcement, or this default will be used.</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="PG Server Address">
                    <input data-testid="input-pg-address" value={settings.pg.address} onChange={(e) => updatePg("address", e.target.value)} placeholder="192.168.1.50" className={INPUT_CLS} />
                  </Field>
                  <Field label="PG SIP Port">
                    <input data-testid="input-pg-port" type="number" value={settings.pg.port} onChange={(e) => updatePg("port", Number(e.target.value))} className={INPUT_CLS} />
                  </Field>
                </div>
                <Field label="Default Zone Extension" hint="Default DTMF zone (users can override per announcement)">
                  <input data-testid="input-pg-extension" value={settings.pg.defaultExtension} onChange={(e) => updatePg("defaultExtension", e.target.value)} placeholder="e.g., 1 for Zone 1" className={INPUT_CLS} />
                </Field>
              </div>
            </Section>

            {/* TTS Settings */}
            <Section title="TTS Engine" icon={Mic}>
              <div className="space-y-5">
                <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 text-xs text-green-700 dark:text-green-300 space-y-2">
                  <div className="font-semibold flex items-center gap-1.5"><Mic className="w-3.5 h-3.5" /> Kokoro TTS Setup</div>
                  <p>To enable real audio generation, install Kokoro TTS on the host machine:</p>
                  <code className="block bg-black/10 dark:bg-black/20 rounded-lg px-3 py-2 font-mono text-green-800 dark:text-green-200">
                    pip install kokoro soundfile
                  </code>
                  <p>The server will automatically detect Kokoro at startup. Restart the server after installation.</p>
                  <p>Kokoro is a free, open-source 82M parameter TTS model (Apache 2.0 license).</p>
                </div>

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
                  <input data-testid="input-default-dtmf-delay" type="range" min={200} max={2000} step={50} value={settings.tts.dtmfDelayMs} onChange={(e) => updateTts("dtmfDelayMs", Number(e.target.value))} className="w-full accent-[#FF8200]" />
                  <div className="flex justify-between text-xs text-slate-400 mt-0.5"><span>200ms (fast)</span><span>2000ms (slow)</span></div>
                </div>

                <div className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-slate-700">
                  <div>
                    <div className="text-sm font-medium text-slate-600 dark:text-slate-300">Default Chime Enabled</div>
                    <div className="text-xs text-slate-400">Play a chime before announcements (PG mode)</div>
                  </div>
                  <button
                    type="button"
                    data-testid="toggle-chime-default"
                    onClick={() => updateTts("chimeEnabled", !settings.tts.chimeEnabled)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${settings.tts.chimeEnabled ? "bg-[#FF8200]" : "bg-slate-200 dark:bg-slate-600"}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.tts.chimeEnabled ? "translate-x-6" : "translate-x-0.5"}`} />
                  </button>
                </div>

                {settings.tts.chimeEnabled && (
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Default Post-Chime Delay</label>
                      <span className="text-sm font-bold text-[#FF8200]">{settings.tts.chimeDelayMs}ms</span>
                    </div>
                    <input data-testid="input-default-chime-delay" type="range" min={300} max={3000} step={50} value={settings.tts.chimeDelayMs} onChange={(e) => updateTts("chimeDelayMs", Number(e.target.value))} className="w-full accent-[#FF8200]" />
                    <div className="flex justify-between text-xs text-slate-400 mt-0.5"><span>300ms</span><span>3000ms</span></div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <div className="flex justify-between mb-1">
                      <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Voice Speed</label>
                      <span className="text-sm font-bold text-[#FF8200]">{settings.tts.voiceSpeed.toFixed(1)}x</span>
                    </div>
                    <input data-testid="input-voice-speed" type="range" min={0.5} max={2.0} step={0.1} value={settings.tts.voiceSpeed} onChange={(e) => updateTts("voiceSpeed", parseFloat(e.target.value))} className="w-full accent-[#FF8200]" />
                    <div className="flex justify-between text-xs text-slate-400 mt-0.5"><span>0.5x</span><span>2.0x</span></div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Voice Pitch</label>
                      <span className="text-sm font-bold text-[#FF8200]">{settings.tts.voicePitch.toFixed(1)}x</span>
                    </div>
                    <input data-testid="input-voice-pitch" type="range" min={0.5} max={2.0} step={0.1} value={settings.tts.voicePitch} onChange={(e) => updateTts("voicePitch", parseFloat(e.target.value))} className="w-full accent-[#FF8200]" />
                    <div className="flex justify-between text-xs text-slate-400 mt-0.5"><span>0.5x</span><span>2.0x</span></div>
                  </div>
                </div>
              </div>
            </Section>

            {/* Logging Settings */}
            <Section title="Logging" icon={FileText} defaultOpen={false}>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-600 dark:text-slate-300">Enable Logging</div>
                    <div className="text-xs text-slate-400">Record system events, TTS, and SIP activity</div>
                  </div>
                  <button
                    type="button"
                    data-testid="toggle-logging"
                    onClick={() => updateLogging("enabled", !settings.logging.enabled)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${settings.logging.enabled ? "bg-[#FF8200]" : "bg-slate-200 dark:bg-slate-600"}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.logging.enabled ? "translate-x-6" : "translate-x-0.5"}`} />
                  </button>
                </div>
                <Field label="Retain Logs (days)">
                  <input data-testid="input-retain-days" type="number" min={1} max={365} value={settings.logging.retainDays} onChange={(e) => updateLogging("retainDays", Number(e.target.value))} className={INPUT_CLS} />
                </Field>
              </div>
            </Section>
          </>
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
