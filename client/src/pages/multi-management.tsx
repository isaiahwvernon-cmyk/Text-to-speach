import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, Loader2, Monitor, Radio, Lock,
  Upload, CheckCircle2, XCircle, AlertCircle, Layers
} from "lucide-react";

const NUM_CHANNELS = 20;
const COL_W = 34;
const ROW_H = 50;
const HEADER_H = 132;
const STICKY_W = 192;

// Zone accent colors (cycling) — teal, indigo, violet, amber, rose
const ZONE_COLORS = [
  { border: "border-l-teal-500", bg: "bg-teal-50/40 dark:bg-teal-900/10", text: "text-teal-700 dark:text-teal-300", dot: "bg-teal-500" },
  { border: "border-l-indigo-400", bg: "bg-indigo-50/40 dark:bg-indigo-900/10", text: "text-indigo-700 dark:text-indigo-300", dot: "bg-indigo-400" },
  { border: "border-l-violet-400", bg: "bg-violet-50/40 dark:bg-violet-900/10", text: "text-violet-700 dark:text-violet-300", dot: "bg-violet-400" },
  { border: "border-l-amber-400", bg: "bg-amber-50/40 dark:bg-amber-900/10", text: "text-amber-700 dark:text-amber-300", dot: "bg-amber-400" },
  { border: "border-l-rose-400", bg: "bg-rose-50/40 dark:bg-rose-900/10", text: "text-rose-700 dark:text-rose-300", dot: "bg-rose-400" },
];

type ReceiverRow = {
  speakerId: string;
  contactId: string;
  contactName: string;
  roomName: string;
  label: string;
  terminalName: string | null;
  ipAddress: string;
  hasAuth: boolean;
  syncFailed?: boolean;
};

type PgChannel = {
  channelId: number;
  name: string;
  multicastIp: string;
  active: boolean;
};

type PgDataEntry = {
  pgId: string;
  pgName: string;
  address: string;
  channels: PgChannel[];
  activeChannels: number[];
  status: "ok" | "offline" | "no-data" | "no-auth";
};

type MatrixState = Record<string, number[]>;

type PushEvent =
  | { type: "start"; total: number }
  | { type: "progress"; index: number; total: number; label: string; ip: string }
  | { type: "done"; results: { speakerId: string; label: string; success: boolean; error: string }[] };

function isMobilePhone() {
  if (typeof window === "undefined") return false;
  return window.innerWidth < 768 || /Mobi|Android/i.test(navigator.userAgent);
}

// Group receivers by contactId preserving insertion order
function groupByContact(receivers: ReceiverRow[]): { contactId: string; contactName: string; speakers: ReceiverRow[] }[] {
  const order: string[] = [];
  const map: Record<string, { contactId: string; contactName: string; speakers: ReceiverRow[] }> = {};
  for (const r of receivers) {
    if (!map[r.contactId]) {
      map[r.contactId] = { contactId: r.contactId, contactName: r.contactName, speakers: [] };
      order.push(r.contactId);
    }
    map[r.contactId].speakers.push(r);
  }
  return order.map(id => map[id]);
}

export default function MultiManagement() {
  const { toast } = useToast();

  const [receivers, setReceivers] = useState<ReceiverRow[]>([]);
  const [matrix, setMatrix] = useState<MatrixState>({});
  const [synced, setSynced] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [pgs, setPgs] = useState<{ id: string; name: string; address: string }[]>([]);
  const [pgData, setPgData] = useState<PgDataEntry[]>([]);
  const [selectedPgIdx, setSelectedPgIdx] = useState(0);
  const [activeOnly, setActiveOnly] = useState(false);

  const [pushing, setPushing] = useState(false);
  const [pushProgress, setPushProgress] = useState<{ index: number; total: number; label: string } | null>(null);
  const [pushResults, setPushResults] = useState<{ label: string; success: boolean; error: string }[] | null>(null);

  const [showMobileWarning, setShowMobileWarning] = useState(false);
  const checkedMobile = useRef(false);

  useEffect(() => {
    if (!checkedMobile.current) {
      checkedMobile.current = true;
      if (isMobilePhone()) setShowMobileWarning(true);
    }
  }, []);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await apiFetch("/api/multi-management/sync", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Sync failed" }));
        toast({ title: "Sync failed", description: err.error, variant: "destructive" });
        return;
      }
      const data = await res.json();
      setPgs(data.pgs ?? []);
      setPgData(data.pgData ?? []);
      setSyncedAt(data.syncedAt);

      const rows: ReceiverRow[] = (data.receivers as any[]).map((r: any) => ({
        speakerId: r.speakerId,
        contactId: r.contactId,
        contactName: r.contactName,
        roomName: r.contactName,
        label: r.label,
        terminalName: r.terminalName ?? null,
        ipAddress: r.ipAddress,
        hasAuth: r.status !== "no-auth",
        syncFailed: r.status === "offline",
      }));
      setReceivers(rows);

      const newMatrix: MatrixState = {};
      for (const r of data.receivers as any[]) {
        const subscribed: number[] = (r.channels as any[])
          .filter((ch: any) => ch.active)
          .map((ch: any) => ch.channelId);
        newMatrix[r.speakerId] = subscribed;
      }
      setMatrix(newMatrix);
      setSynced(true);

      const dataCount = (data.receivers as any[]).filter((r: any) => r.status === "ok").length;
      const pgOk = (data.pgData as any[] ?? []).filter((p: any) => p.status === "ok").length;
      toast({
        title: "Sync complete",
        description: [
          dataCount > 0 ? `${dataCount} receiver${dataCount !== 1 ? "s" : ""} read` : null,
          pgOk > 0 ? `${pgOk} PG${pgOk !== 1 ? "s" : ""} read` : null,
          dataCount === 0 && pgOk === 0 ? "Devices not reachable — edit manually and push" : null,
        ].filter(Boolean).join(" · "),
      });
    } catch (e: any) {
      toast({ title: "Sync error", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }

  async function handlePush() {
    setPushing(true);
    setPushResults(null);
    setPushProgress(null);
    try {
      const res = await apiFetch("/api/multi-management/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matrix }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Push failed" }));
        toast({ title: "Push failed", description: err.error, variant: "destructive" });
        setPushing(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          try {
            const ev: PushEvent = JSON.parse(line.slice(5).trim());
            if (ev.type === "start") {
              setPushProgress({ index: 0, total: ev.total, label: "" });
            } else if (ev.type === "progress") {
              setPushProgress({ index: ev.index + 1, total: ev.total, label: ev.label });
            } else if (ev.type === "done") {
              setPushResults(ev.results);
              setPushProgress(null);
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e: any) {
      toast({ title: "Push error", description: e.message, variant: "destructive" });
    } finally {
      setPushing(false);
    }
  }

  function toggleCell(speakerId: string, channelId: number) {
    setMatrix(prev => {
      const current = new Set(prev[speakerId] ?? []);
      if (current.has(channelId)) current.delete(channelId);
      else current.add(channelId);
      return { ...prev, [speakerId]: Array.from(current) };
    });
  }

  const credentialedReceivers = receivers.filter(r => r.hasAuth);
  const noAuthReceivers = receivers.filter(r => !r.hasAuth);
  const selectedPg = pgs[selectedPgIdx] ?? null;
  const selectedPgData = pgData.find(p => p.pgId === selectedPg?.id) ?? null;

  const allChannels = Array.from({ length: NUM_CHANNELS }, (_, i) => i + 1);
  const visibleChannels = activeOnly
    ? allChannels.filter(ch =>
        credentialedReceivers.some(r => (matrix[r.speakerId] ?? []).includes(ch)) ||
        (selectedPgData?.activeChannels ?? []).includes(ch)
      )
    : allChannels;

  const zoneGroups = groupByContact(credentialedReceivers);
  const noAuthGroups = groupByContact(noAuthReceivers);

  // Assign zone color by contactId — stable mapping
  const zoneColorMap: Record<string, typeof ZONE_COLORS[number]> = {};
  [...zoneGroups, ...noAuthGroups].forEach((g, idx) => {
    zoneColorMap[g.contactId] = ZONE_COLORS[idx % ZONE_COLORS.length];
  });

  return (
    <div className="relative select-none">

      {/* ── Mobile warning ─────────────────────────────────────── */}
      {showMobileWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-sm w-full p-7 text-center space-y-4">
            <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto">
              <Monitor className="w-7 h-7 text-amber-500" />
            </div>
            <div>
              <div className="font-bold text-lg text-slate-900 dark:text-white">PC or Tablet Required</div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                The Multi-Management matrix is designed for larger screens. Please use a PC or tablet.
              </p>
            </div>
            <button onClick={() => setShowMobileWarning(false)}
              className="w-full py-2.5 rounded-xl bg-[#FF8200] text-white font-semibold text-sm hover:bg-[#e07200] transition-colors">
              Continue Anyway
            </button>
          </div>
        </div>
      )}

      {/* ── Push progress overlay ──────────────────────────────── */}
      {pushing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-6">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center space-y-5">
            <div className="w-14 h-14 bg-[#FF8200]/10 rounded-full flex items-center justify-center mx-auto">
              <Loader2 className="w-7 h-7 text-[#FF8200] animate-spin" />
            </div>
            <div>
              <div className="font-bold text-slate-900 dark:text-white text-lg">Pushing to Devices</div>
              {pushProgress && (
                <>
                  <div className="text-sm text-slate-500 mt-1">
                    {pushProgress.label ? `→ ${pushProgress.label}` : "Starting…"}
                  </div>
                  <div className="mt-4 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#FF8200] rounded-full transition-all duration-300"
                      style={{ width: `${Math.round((pushProgress.index / pushProgress.total) * 100)}%` }}
                    />
                  </div>
                  <div className="text-xs text-slate-400 mt-2">
                    {pushProgress.index} of {pushProgress.total} device{pushProgress.total !== 1 ? "s" : ""}
                  </div>
                </>
              )}
              {!pushProgress && <div className="text-sm text-slate-400 mt-2">Preparing…</div>}
            </div>
          </div>
        </div>
      )}

      {/* ── Push results modal ─────────────────────────────────── */}
      {pushResults && !pushing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-6">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-7 space-y-4">
            <div className="font-bold text-slate-900 dark:text-white text-base">Push Results</div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {pushResults.map((r, i) => (
                <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${
                  r.success
                    ? "bg-teal-50 dark:bg-teal-900/20 border border-teal-100 dark:border-teal-800"
                    : "bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800"
                }`}>
                  {r.success
                    ? <CheckCircle2 className="w-4 h-4 text-teal-500 flex-shrink-0" />
                    : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                  <div className="min-w-0">
                    <div className={`text-sm font-semibold ${r.success ? "text-teal-700 dark:text-teal-300" : "text-red-700 dark:text-red-300"}`}>
                      {r.label}
                    </div>
                    {!r.success && r.error && (
                      <div className="text-xs text-red-500 truncate">{r.error}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setPushResults(null)}
              className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── Toolbar ────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-900 dark:text-white text-sm">Multicast Channel Matrix</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {syncedAt
              ? `Last synced ${new Date(syncedAt).toLocaleTimeString()} · ${credentialedReceivers.length} receiver${credentialedReceivers.length !== 1 ? "s" : ""} in ${zoneGroups.length} zone${zoneGroups.length !== 1 ? "s" : ""} · click cells to edit, then Push`
              : "Sync to read current configuration from devices, or edit manually and Push"}
          </div>
        </div>

        {/* PG selector — show only if >1 PG */}
        {pgs.length > 1 && (
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
            {pgs.map((pg, idx) => (
              <button key={pg.id} onClick={() => setSelectedPgIdx(idx)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  selectedPgIdx === idx
                    ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}>
                {pg.name || `PG ${idx + 1}`}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
          {[{ label: "All", val: false }, { label: "Active", val: true }].map(opt => (
            <button key={String(opt.val)} onClick={() => setActiveOnly(opt.val)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                activeOnly === opt.val
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}>
              {opt.label}
            </button>
          ))}
        </div>

        <button onClick={handleSync} disabled={syncing || pushing} data-testid="button-multicast-sync"
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors">
          {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Sync
        </button>

        <button onClick={handlePush} disabled={pushing || syncing || credentialedReceivers.length === 0}
          data-testid="button-multicast-push"
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FF8200] text-white text-xs font-bold hover:bg-[#e07200] disabled:opacity-50 transition-colors shadow shadow-orange-100">
          <Upload className="w-3.5 h-3.5" />
          Push
        </button>
      </div>

      {/* ── Pre-sync placeholder ────────────────────────────────── */}
      {!synced && !syncing && (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-14 text-center">
          <Radio className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <div className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">No data yet</div>
          <div className="text-xs text-slate-400 mb-5 max-w-xs mx-auto">
            Click <strong>Sync</strong> to read channel subscriptions from all receiver devices and PG gateways.
          </div>
          <button onClick={handleSync}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF8200] text-white text-xs font-bold hover:bg-[#e07200] transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />Sync Now
          </button>
        </div>
      )}

      {syncing && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-14 text-center">
          <Loader2 className="w-8 h-8 text-[#FF8200] animate-spin mx-auto mb-3" />
          <div className="text-xs text-slate-400">Reading receiver configurations and PG config files…</div>
        </div>
      )}

      {/* ── Matrix ─────────────────────────────────────────────── */}
      {synced && !syncing && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">

          {/* PG status bar */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
            <Radio className="w-3 h-3 text-[#FF8200] flex-shrink-0" />
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
              {selectedPg?.name || "PG Gateway"}
            </span>
            {(selectedPg as any)?.address && (
              <span className="text-[10px] text-slate-400 font-mono">{(selectedPg as any).address}</span>
            )}
            {selectedPgData && (
              <span className="ml-1 text-[10px]">
                {selectedPgData.status === "ok" ? (
                  <span className="text-teal-600 dark:text-teal-400 font-semibold">
                    {selectedPgData.activeChannels.length} channel{selectedPgData.activeChannels.length !== 1 ? "s" : ""} active
                  </span>
                ) : selectedPgData.status === "no-auth" ? (
                  <span className="text-amber-500">Add credentials in Settings → IT → Paging Gateways</span>
                ) : (
                  <span className="text-slate-400">Could not read PG config</span>
                )}
              </span>
            )}
            <span className="ml-auto text-[10px] text-slate-400">
              {visibleChannels.length} ch · {credentialedReceivers.length} receiver{credentialedReceivers.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 290px)", minHeight: 120 }}>
            <table className="border-collapse" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: STICKY_W }} />
                {visibleChannels.map(ch => <col key={ch} style={{ width: COL_W }} />)}
              </colgroup>

              <thead>
                <tr>
                  {/* Corner */}
                  <th
                    className="sticky left-0 top-0 z-30 bg-slate-50 dark:bg-slate-800 border-b border-r border-slate-200 dark:border-slate-700"
                    style={{ height: HEADER_H, width: STICKY_W }}
                  >
                    <span className="block px-3 text-[9px] font-semibold text-slate-400 uppercase tracking-widest text-left">
                      Zone / Speaker
                    </span>
                  </th>

                  {/* Rotated channel headers */}
                  {visibleChannels.map(ch => {
                    const pgActive = (selectedPgData?.activeChannels ?? []).includes(ch);
                    const pgCh = selectedPgData?.channels.find(c => c.channelId === ch);
                    const chName = pgCh?.name ?? "";
                    const chIp = pgCh?.multicastIp ?? "";
                    const tooltip = [chName, chIp].filter(Boolean).join(" · ") || `Channel ${ch}`;
                    return (
                      <th
                        key={ch}
                        title={tooltip}
                        className={`sticky top-0 z-20 border-b border-r border-slate-200 dark:border-slate-700 p-0 ${
                          pgActive ? "bg-teal-50 dark:bg-teal-900/20" : "bg-slate-50 dark:bg-slate-800"
                        }`}
                        style={{ height: HEADER_H, width: COL_W }}
                      >
                        <div className="flex flex-col items-center justify-end h-full pb-1.5 gap-0" style={{ paddingTop: 4 }}>
                          {/* Channel name (rotated) */}
                          {chName ? (
                            <span
                              className={`text-[9px] font-semibold leading-none ${pgActive ? "text-teal-600 dark:text-teal-400" : "text-slate-500 dark:text-slate-400"}`}
                              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap", maxHeight: 60, overflow: "hidden", textOverflow: "ellipsis" }}
                            >
                              {chName.length > 10 ? chName.slice(0, 10) + "…" : chName}
                            </span>
                          ) : (
                            <span style={{ height: 24 }} />
                          )}
                          {/* CH N label */}
                          <span
                            className={`text-[10px] font-bold mt-0.5 ${pgActive ? "text-teal-700 dark:text-teal-300" : "text-slate-600 dark:text-slate-300"}`}
                            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap" }}
                          >
                            CH {ch}
                          </span>
                          {pgActive && <span className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-0.5 mb-0.5" />}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {/* PG row */}
                {selectedPgData && (
                  <tr style={{ height: ROW_H }} className="bg-slate-50/80 dark:bg-slate-800/60">
                    <td
                      className="sticky left-0 z-10 border-r border-b border-slate-200 dark:border-slate-700 px-0 bg-slate-50/90 dark:bg-slate-800/70 border-l-4 border-l-[#FF8200]"
                      style={{ width: STICKY_W, height: ROW_H }}
                    >
                      <div className="px-2.5 flex items-center gap-2 min-w-0 h-full">
                        <div className="w-5 h-5 rounded-md bg-[#FF8200]/10 flex items-center justify-center flex-shrink-0">
                          <Radio className="w-3 h-3 text-[#FF8200]" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate leading-tight">
                            {selectedPgData.pgName}
                          </div>
                          <div className="text-[9px] text-slate-400 font-mono leading-tight truncate">
                            {selectedPgData.address}
                          </div>
                          {selectedPgData.status !== "ok" && (
                            <div className="text-[9px] text-amber-500 leading-tight">
                              {selectedPgData.status === "no-auth" ? "no credentials" : "could not read config"}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    {visibleChannels.map(ch => {
                      const pgCh = selectedPgData.channels.find(c => c.channelId === ch);
                      const active = pgCh?.active ?? false;
                      const chName = pgCh?.name ?? "";
                      const chIp = pgCh?.multicastIp ?? "";
                      const tooltip = [chName && `"${chName}"`, chIp, active ? "PG active" : "PG inactive"].filter(Boolean).join(" · ");
                      return (
                        <td
                          key={ch}
                          title={tooltip || `CH ${ch}`}
                          className="border-r border-b border-slate-200 dark:border-slate-700 p-0"
                          style={{ width: COL_W, height: ROW_H }}
                        >
                          {selectedPgData.status !== "ok" ? (
                            <div className="flex items-center justify-center h-full">
                              <span className="w-4 h-4 rounded-sm bg-slate-100 dark:bg-slate-700/60" />
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center h-full gap-0.5">
                              {/* Active indicator */}
                              <span className={`w-3.5 h-3.5 rounded-sm flex-shrink-0 ${active ? "bg-[#FF8200] shadow-sm" : "border border-slate-200 dark:border-slate-700"}`} />
                              {/* Multicast IP (vertical, tiny) */}
                              {chIp && (
                                <span
                                  className="text-[8px] font-mono leading-none text-slate-400 dark:text-slate-500"
                                  style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", maxHeight: 28, overflow: "hidden" }}
                                >
                                  {chIp}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                )}

                {/* Credentialed zones */}
                {zoneGroups.map((group) => {
                  const zc = zoneColorMap[group.contactId];
                  return [
                    /* Zone header row */
                    <tr key={`zone-${group.contactId}`} style={{ height: 26 }}>
                      <td
                        colSpan={visibleChannels.length + 1}
                        className="sticky left-0 border-b border-t border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/90 px-3 py-0"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${zc.dot}`} />
                          <Layers className="w-3 h-3 text-slate-400 flex-shrink-0" />
                          <span className={`text-[10px] font-bold uppercase tracking-wide ${zc.text}`}>
                            {group.contactName}
                          </span>
                          <span className="text-[9px] text-slate-400 ml-1">
                            {group.speakers.length} speaker{group.speakers.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </td>
                    </tr>,

                    /* Speaker rows */
                    ...group.speakers.map((receiver, rowIdx) => {
                      const subscribed = new Set(matrix[receiver.speakerId] ?? []);
                      const isLast = rowIdx === group.speakers.length - 1;
                      return (
                        <tr key={receiver.speakerId} className={`${zc.bg}`} style={{ height: ROW_H }}>
                          <td
                            className={`sticky left-0 z-10 border-r border-b border-slate-200 dark:border-slate-700 px-0 ${zc.bg} border-l-4 ${zc.border} ${isLast ? "border-b-2" : ""}`}
                            style={{ width: STICKY_W, height: ROW_H }}
                          >
                            <div className="px-2 flex items-start gap-2 min-w-0 py-1.5">
                              {receiver.syncFailed && (
                                <AlertCircle className="w-3 h-3 text-amber-400 flex-shrink-0 mt-1" title="Could not read from device — edit manually" />
                              )}
                              <div className="min-w-0 flex-1">
                                {/* Terminal name — from device */}
                                {receiver.terminalName ? (
                                  <div className="text-[11px] font-bold text-slate-900 dark:text-slate-100 truncate leading-tight">
                                    {receiver.terminalName}
                                  </div>
                                ) : (
                                  <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 truncate leading-tight italic">
                                    {receiver.syncFailed ? "offline" : "—"}
                                  </div>
                                )}
                                {/* Speaker label — from contacts */}
                                <div className="text-[10px] text-slate-600 dark:text-slate-400 truncate leading-tight">
                                  {receiver.label}
                                </div>
                                {/* IP address */}
                                <div className="text-[9px] text-slate-400 font-mono leading-tight truncate">
                                  {receiver.ipAddress}
                                </div>
                              </div>
                            </div>
                          </td>
                          {visibleChannels.map(ch => {
                            const active = subscribed.has(ch);
                            return (
                              <td
                                key={ch}
                                className={`border-r border-b border-slate-200 dark:border-slate-700 p-0 cursor-pointer hover:bg-orange-200/70 dark:hover:bg-orange-800/40 transition-colors ${isLast ? "border-b-2" : ""}`}
                                style={{ width: COL_W, height: ROW_H }}
                                onClick={() => toggleCell(receiver.speakerId, ch)}
                                title={`${receiver.terminalName ?? receiver.label} — CH ${ch} — click to ${active ? "unsubscribe" : "subscribe"}`}
                              >
                                <div className="flex items-center justify-center h-full">
                                  {active
                                    ? <span className="w-4 h-4 rounded-sm bg-teal-500 shadow-sm shadow-teal-200 dark:shadow-none block" />
                                    : <span className="w-4 h-4 rounded-sm border border-slate-200 dark:border-slate-700 block" />
                                  }
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    }),
                  ];
                })}

                {/* No-auth zones — faded */}
                {noAuthGroups.map((group) => {
                  const zc = zoneColorMap[group.contactId];
                  return [
                    <tr key={`zone-noauth-${group.contactId}`} style={{ height: 26 }}>
                      <td
                        colSpan={visibleChannels.length + 1}
                        className="sticky left-0 border-b border-t border-slate-200 dark:border-slate-700 bg-slate-100/60 dark:bg-slate-800/70 px-3 py-0 opacity-50"
                      >
                        <div className="flex items-center gap-2">
                          <Lock className="w-3 h-3 text-slate-400 flex-shrink-0" />
                          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            {group.contactName}
                          </span>
                          <span className="text-[9px] text-slate-400">— no credentials</span>
                        </div>
                      </td>
                    </tr>,
                    ...group.speakers.map(receiver => (
                      <tr key={receiver.speakerId} className="opacity-35" style={{ height: ROW_H }}>
                        <td
                          className={`sticky left-0 z-10 border-r border-b border-slate-200 dark:border-slate-700 px-0 bg-white dark:bg-slate-900 border-l-4 ${zc.border}`}
                          style={{ width: STICKY_W, height: ROW_H }}
                        >
                          <div className="px-2 flex items-start gap-2 min-w-0 py-1.5">
                            <Lock className="w-3 h-3 text-slate-300 dark:text-slate-600 flex-shrink-0 mt-1" />
                            <div className="min-w-0">
                              <div className="text-[11px] font-bold text-slate-500 truncate leading-tight">{receiver.label}</div>
                              <div className="text-[9px] text-slate-400 font-mono leading-tight">{receiver.ipAddress}</div>
                            </div>
                          </div>
                        </td>
                        {visibleChannels.map(ch => (
                          <td key={ch} className="border-r border-b border-slate-200 dark:border-slate-700 p-0" style={{ width: COL_W, height: ROW_H }}>
                            <div className="flex items-center justify-center h-full">
                              <span className="w-4 h-4 rounded-sm bg-slate-100 dark:bg-slate-700 block" />
                            </div>
                          </td>
                        ))}
                      </tr>
                    )),
                  ];
                })}

                {credentialedReceivers.length === 0 && !selectedPgData && (
                  <tr>
                    <td colSpan={visibleChannels.length + 1} className="text-center py-10 text-xs text-slate-400">
                      No receiver devices found. Add direct-mode contacts with speaker credentials.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center gap-5 flex-wrap text-[10px] text-slate-500">
            <span className="font-semibold uppercase tracking-wide text-slate-400 text-[9px]">Legend</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#FF8200]" />PG active channel</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-teal-500" />Receiver subscribed</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border border-slate-200 dark:border-slate-600" />Not subscribed</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-100 dark:bg-slate-700" />No credentials</span>
            <span className="ml-auto text-[10px] text-slate-400">Terminal name from device · label from Contacts · click to toggle · Push to apply</span>
          </div>
        </div>
      )}
    </div>
  );
}
