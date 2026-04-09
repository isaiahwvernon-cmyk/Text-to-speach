import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Loader2, Monitor, Radio, Lock } from "lucide-react";

const NUM_CHANNELS = 20;
const COL_W = 34;
const ROW_H = 36;
const HEADER_H = 108;
const STICKY_W = 172;

type ChannelInfo  = { channelId: number; name: string; address: string; port: number; active: boolean };
type ReceiverStatus = "ok" | "offline" | "no-auth" | "no-data";
type ReceiverResult = {
  speakerId: string; contactId: string; contactName: string;
  label: string; ipAddress: string; status: ReceiverStatus; channels: ChannelInfo[];
};
type SyncResult = {
  receivers: ReceiverResult[];
  pgs: { id: string; name: string; address: string; port: number; defaultExtension: string }[];
  syncedAt: string;
};

function buildChannelHeaders(receivers: ReceiverResult[]): { channelId: number; name: string }[] {
  const nameMap: Record<number, Record<string, number>> = {};
  for (const r of receivers) {
    for (const ch of r.channels) {
      if (!nameMap[ch.channelId]) nameMap[ch.channelId] = {};
      const n = ch.name.trim() || `CH ${ch.channelId}`;
      nameMap[ch.channelId][n] = (nameMap[ch.channelId][n] ?? 0) + 1;
    }
  }
  return Array.from({ length: NUM_CHANNELS }, (_, i) => {
    const id = i + 1;
    const votes = nameMap[id] ?? {};
    const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
    return { channelId: id, name: best?.[0] ?? `CH ${id}` };
  });
}

function isMobilePhone() {
  if (typeof window === "undefined") return false;
  return window.innerWidth < 768 || /Mobi|Android/i.test(navigator.userAgent);
}

const STATUS_DOT: Record<ReceiverStatus, string> = {
  ok:      "bg-teal-500",
  offline: "bg-red-400",
  "no-data": "bg-amber-400",
  "no-auth": "bg-slate-300 dark:bg-slate-600",
};

const STATUS_LABEL: Record<ReceiverStatus, string> = {
  ok:      "Synced",
  offline: "Offline",
  "no-data": "No data",
  "no-auth": "No credentials",
};

export default function MultiManagement() {
  const { toast } = useToast();
  const [syncing, setSyncing]   = useState(false);
  const [syncData, setSyncData] = useState<SyncResult | null>(null);
  const [activeOnly, setActiveOnly] = useState(false);
  const [selectedPgIdx, setSelectedPgIdx] = useState(0);
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
      const data: SyncResult = await res.json();
      setSyncData(data);
      const ok = data.receivers.filter(r => r.status === "ok").length;
      const offline = data.receivers.filter(r => r.status === "offline").length;
      toast({
        title: "Sync complete",
        description: `${ok} online · ${offline} offline · ${data.receivers.length} total`,
      });
    } catch (e: any) {
      toast({ title: "Sync error", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }

  const pgs = syncData?.pgs ?? [];
  const allReceivers = syncData?.receivers ?? [];
  const channelHeaders = buildChannelHeaders(allReceivers);
  const visibleChannels = activeOnly
    ? channelHeaders.filter(ch => allReceivers.some(r => r.channels.find(c => c.channelId === ch.channelId && c.active)))
    : channelHeaders;

  const selectedPg = pgs[selectedPgIdx] ?? null;

  return (
    <div className="relative select-none">

      {/* ── Mobile warning ──────────────────────────────────────────────────── */}
      {showMobileWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-sm w-full p-7 text-center space-y-4">
            <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto">
              <Monitor className="w-7 h-7 text-amber-500" />
            </div>
            <div>
              <div className="font-bold text-lg text-slate-900 dark:text-white">PC or Tablet Required</div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                The Multi-Management matrix is designed for larger screens. Please open this page on a PC or tablet for the best experience.
              </p>
            </div>
            <button onClick={() => setShowMobileWarning(false)}
              className="w-full py-2.5 rounded-xl bg-[#FF8200] text-white font-semibold text-sm hover:bg-[#e07200] transition-colors">
              Continue Anyway
            </button>
          </div>
        </div>
      )}

      {/* ── Top toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-900 dark:text-white text-sm">Multicast Channel Matrix</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {syncData
              ? `Last synced ${new Date(syncData.syncedAt).toLocaleTimeString()} · ${allReceivers.length} receiver${allReceivers.length !== 1 ? "s" : ""}`
              : "Press Sync to read receiver configurations"}
          </div>
        </div>

        {/* PG selector — only visible if >1 PG */}
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

        {/* All/Active toggle */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
          {[
            { label: "All Channels", val: false },
            { label: "Active Only",  val: true },
          ].map(opt => (
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

        {/* Sync button */}
        <button onClick={handleSync} disabled={syncing} data-testid="button-multicast-sync"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF8200] text-white text-xs font-bold hover:bg-[#e07200] disabled:opacity-60 transition-colors shadow shadow-orange-100">
          {syncing
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Syncing…</>
            : <><RefreshCw className="w-3.5 h-3.5" />Sync</>}
        </button>
      </div>

      {/* ── Pre-sync / syncing state ─────────────────────────────────────────── */}
      {!syncData && !syncing && (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-16 text-center">
          <Radio className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <div className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">No sync data yet</div>
          <div className="text-xs text-slate-400 mb-5">Click Sync to read multicast channel configuration from all receiver devices</div>
          <button onClick={handleSync}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF8200] text-white text-xs font-bold hover:bg-[#e07200] transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />Sync Now
          </button>
        </div>
      )}

      {syncing && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-16 text-center">
          <Loader2 className="w-8 h-8 text-[#FF8200] animate-spin mx-auto mb-3" />
          <div className="text-xs text-slate-400">Reading receiver configurations…</div>
        </div>
      )}

      {/* ── Matrix ──────────────────────────────────────────────────────────── */}
      {syncData && !syncing && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">

          {/* PG label bar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
            <Radio className="w-3.5 h-3.5 text-[#FF8200] flex-shrink-0" />
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
              {selectedPg?.name || "PG Gateway"}
            </span>
            {selectedPg?.address && (
              <span className="text-[10px] text-slate-400 font-mono">{selectedPg.address}</span>
            )}
            <span className="ml-auto text-[10px] text-slate-400">
              {visibleChannels.length} channel{visibleChannels.length !== 1 ? "s" : ""}
              {activeOnly ? " (active)" : ""}
            </span>
          </div>

          {/* Scrollable matrix */}
          <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 320px)", minHeight: 160 }}>
            <table className="border-collapse" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: STICKY_W }} />
                {visibleChannels.map(ch => <col key={ch.channelId} style={{ width: COL_W }} />)}
              </colgroup>

              <thead>
                <tr>
                  {/* Corner cell */}
                  <th
                    className="sticky left-0 top-0 z-30 bg-slate-50 dark:bg-slate-800 border-b border-r border-slate-200 dark:border-slate-700"
                    style={{ height: HEADER_H, width: STICKY_W, minWidth: STICKY_W }}
                  >
                    <span className="block px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-widest text-left">
                      Receiver
                    </span>
                  </th>

                  {/* Channel headers — rotated text */}
                  {visibleChannels.map(ch => (
                    <th
                      key={ch.channelId}
                      className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800 border-b border-r border-slate-200 dark:border-slate-700 p-0 text-center"
                      style={{ height: HEADER_H, width: COL_W, minWidth: COL_W, maxWidth: COL_W }}
                    >
                      <div className="flex flex-col items-center justify-end h-full pb-2 gap-1">
                        <span
                          className="text-[10px] font-bold text-slate-600 dark:text-slate-300 leading-none"
                          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap" }}
                        >
                          {ch.name !== `CH ${ch.channelId}` ? ch.name : `CH ${ch.channelId}`}
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono">{ch.channelId}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {allReceivers.length === 0 && (
                  <tr>
                    <td colSpan={visibleChannels.length + 1} className="text-center py-10 text-xs text-slate-400">
                      No receiver devices found. Add direct-mode contacts with IP credentials.
                    </td>
                  </tr>
                )}

                {allReceivers.map((receiver, rowIdx) => {
                  const noAuth = receiver.status === "no-auth";
                  const channelMap: Record<number, ChannelInfo> = {};
                  receiver.channels.forEach(ch => { channelMap[ch.channelId] = ch; });
                  const isEven = rowIdx % 2 === 0;

                  const rowBg = noAuth
                    ? "bg-slate-50/80 dark:bg-slate-800/40"
                    : isEven
                      ? "bg-white dark:bg-slate-900"
                      : "bg-slate-50/40 dark:bg-slate-800/30";

                  return (
                    <tr
                      key={receiver.speakerId}
                      className={`${rowBg} ${noAuth ? "opacity-50" : "hover:bg-orange-50/20 dark:hover:bg-orange-900/10"} transition-colors`}
                      style={{ height: ROW_H }}
                    >
                      {/* Sticky receiver label */}
                      <td
                        className={`sticky left-0 z-10 border-r border-b border-slate-200 dark:border-slate-700 px-3 ${rowBg}`}
                        style={{ width: STICKY_W, minWidth: STICKY_W, height: ROW_H }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {noAuth ? (
                            <Lock className="w-3 h-3 text-slate-300 dark:text-slate-600 flex-shrink-0" />
                          ) : (
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[receiver.status]}`} />
                          )}
                          <div className="min-w-0">
                            <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 truncate leading-none">
                              {receiver.label}
                            </div>
                            <div className="text-[9px] text-slate-400 font-mono truncate mt-0.5 leading-none">
                              {receiver.ipAddress}
                            </div>
                          </div>
                          {!noAuth && receiver.status !== "ok" && (
                            <span className="ml-auto flex-shrink-0 text-[8px] font-bold uppercase tracking-wide text-slate-400">
                              {receiver.status === "offline" ? "×" : "?"}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Channel cells */}
                      {visibleChannels.map(ch => {
                        const cell = channelMap[ch.channelId];
                        const active = cell?.active === true;
                        const hasData = receiver.status === "ok";

                        return (
                          <td
                            key={ch.channelId}
                            className="border-r border-b border-slate-200 dark:border-slate-700 text-center p-0"
                            style={{ width: COL_W, minWidth: COL_W, maxWidth: COL_W, height: ROW_H }}
                            title={active && cell?.name ? `${cell.name} · ${cell.address || ""}` : undefined}
                          >
                            <div className="flex items-center justify-center h-full">
                              {noAuth ? (
                                <span className="w-3.5 h-3.5 rounded-sm bg-slate-100 dark:bg-slate-700/50" />
                              ) : !hasData ? (
                                <span className="w-3.5 h-3.5 rounded-sm bg-slate-100 dark:bg-slate-700" />
                              ) : active ? (
                                <span className="w-3.5 h-3.5 rounded-sm bg-teal-500 shadow-sm shadow-teal-200 dark:shadow-teal-900" />
                              ) : (
                                <span className="w-3.5 h-3.5 rounded-sm border border-slate-200 dark:border-slate-700" />
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Status bar / legend */}
          <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center gap-5 flex-wrap text-[10px] text-slate-500">
            <span className="font-semibold uppercase tracking-wide text-slate-400 text-[9px]">Legend</span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-teal-500" />Subscribed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm border border-slate-200 dark:border-slate-600" />Not subscribed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-slate-100 dark:bg-slate-700" />Offline / no data
            </span>
            <div className="ml-auto flex items-center gap-3">
              {(["ok","offline","no-data","no-auth"] as ReceiverStatus[]).map(s => {
                const count = allReceivers.filter(r => r.status === s).length;
                if (!count) return null;
                return (
                  <span key={s} className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[s]}`} />
                    {count} {STATUS_LABEL[s]}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
