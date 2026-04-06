import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, Wifi, WifiOff, AlertTriangle, CheckCircle2,
  Radio, Loader2, Monitor, Eye, EyeOff, Info
} from "lucide-react";

const NUM_CHANNELS = 20;

type ChannelInfo = {
  channelId: number;
  name: string;
  address: string;
  port: number;
  active: boolean;
};

type ReceiverStatus = "ok" | "offline" | "no-auth" | "no-data" | "error";

type ReceiverResult = {
  speakerId: string;
  contactId: string;
  contactName: string;
  label: string;
  ipAddress: string;
  status: ReceiverStatus;
  channels: ChannelInfo[];
};

type SyncResult = {
  receivers: ReceiverResult[];
  pgs: { id: string; name: string; address: string; port: number }[];
  syncedAt: string;
};

function buildChannelHeaders(receivers: ReceiverResult[]): { channelId: number; name: string }[] {
  const nameMap: Record<number, Record<string, number>> = {};
  for (const r of receivers) {
    for (const ch of r.channels) {
      if (!nameMap[ch.channelId]) nameMap[ch.channelId] = {};
      const n = ch.name || `CH ${ch.channelId}`;
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

export default function MultiManagement() {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [syncData, setSyncData] = useState<SyncResult | null>(null);
  const [activeOnly, setActiveOnly] = useState(false);
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
      toast({ title: "Sync complete", description: `${data.receivers.length} receiver(s) queried` });
    } catch (e: any) {
      toast({ title: "Sync error", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }

  const receivers = syncData?.receivers ?? [];
  const activeReceivers = receivers.filter((r) => r.status !== "no-auth");
  const offlineReceivers = receivers.filter((r) => r.status === "no-auth");
  const channelHeaders = buildChannelHeaders(activeReceivers);

  const visibleChannels = activeOnly
    ? channelHeaders.filter((ch) =>
        activeReceivers.some((r) => r.channels.find((c) => c.channelId === ch.channelId && c.active))
      )
    : channelHeaders;

  const pgName = syncData?.pgs?.[0]?.name ?? "PG Gateway";
  const pgAddress = syncData?.pgs?.[0]?.address ?? "";

  return (
    <div className="relative">
      {/* Mobile warning overlay */}
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
            <button
              onClick={() => setShowMobileWarning(false)}
              className="w-full py-2.5 rounded-xl bg-[#FF8200] text-white font-semibold text-sm hover:bg-[#e07200] transition-colors"
            >
              Continue Anyway
            </button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#FF8200]/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <Radio className="w-5 h-5 text-[#FF8200]" />
          </div>
          <div>
            <div className="font-bold text-slate-900 dark:text-white">Multicast Channel Matrix</div>
            <div className="text-xs text-slate-400">
              {syncData
                ? `Last synced: ${new Date(syncData.syncedAt).toLocaleTimeString()}`
                : "Press Sync to read receiver configurations"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Active only toggle */}
          <button
            onClick={() => setActiveOnly((v) => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
              activeOnly
                ? "bg-[#FF8200]/10 border-[#FF8200] text-[#FF8200]"
                : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
            }`}
            title={activeOnly ? "Showing active channels only" : "Showing all 20 channels"}
          >
            {activeOnly ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {activeOnly ? "Active Channels Only" : "All 20 Channels"}
          </button>

          {/* Sync button */}
          <button
            onClick={handleSync}
            disabled={syncing}
            data-testid="button-multicast-sync"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF8200] text-white text-sm font-semibold hover:bg-[#e07200] disabled:opacity-60 transition-colors shadow-sm shadow-orange-100"
          >
            {syncing
              ? <><Loader2 className="w-4 h-4 animate-spin" />Syncing…</>
              : <><RefreshCw className="w-4 h-4" />Sync</>}
          </button>
        </div>
      </div>

      {/* No-auth (grayed out) receivers */}
      {offlineReceivers.length > 0 && (
        <div className="mb-5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              Receivers without credentials ({offlineReceivers.length})
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            These devices are configured in the system but are missing a username and/or password. Update their info in Contacts to include them in the sync.
          </p>
          <div className="flex flex-wrap gap-2">
            {offlineReceivers.map((r) => (
              <div
                key={r.speakerId}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 opacity-60"
              >
                <WifiOff className="w-3.5 h-3.5 text-slate-400" />
                <div>
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{r.label}</div>
                  <div className="text-[10px] text-slate-400">{r.ipAddress}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pre-sync placeholder */}
      {!syncData && !syncing && (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-16 text-center">
          <div className="w-14 h-14 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Radio className="w-7 h-7 text-slate-400" />
          </div>
          <div className="font-semibold text-slate-600 dark:text-slate-300 mb-1">No sync data yet</div>
          <div className="text-sm text-slate-400 mb-6">
            Click <strong>Sync</strong> to read the multicast channel configuration from all receiver devices.
          </div>
          <button
            onClick={handleSync}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF8200] text-white text-sm font-semibold hover:bg-[#e07200] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />Sync Now
          </button>
        </div>
      )}

      {syncing && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-16 text-center">
          <Loader2 className="w-10 h-10 text-[#FF8200] animate-spin mx-auto mb-4" />
          <div className="text-sm text-slate-500">Reading receiver configurations…</div>
        </div>
      )}

      {/* Matrix */}
      {syncData && !syncing && activeReceivers.length === 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-12 text-center text-slate-400 text-sm">
          No credentialed receiver devices found. Add direct-mode contacts with IP credentials to see the matrix.
        </div>
      )}

      {syncData && !syncing && activeReceivers.length > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
          {/* PG header bar */}
          <div className="px-4 py-2.5 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800 flex items-center gap-3">
            <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex items-center justify-center">
              <Radio className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-sm font-bold text-blue-700 dark:text-blue-300">{pgName}</span>
            {pgAddress && (
              <span className="text-xs text-blue-500 dark:text-blue-400 font-mono">{pgAddress}</span>
            )}
            <span className="ml-auto text-xs text-blue-400">
              {visibleChannels.length} {activeOnly ? "active" : "total"} channel{visibleChannels.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Scrollable matrix table */}
          <div className="overflow-auto max-h-[calc(100vh-380px)] min-h-[200px]">
            <table className="border-collapse min-w-full text-xs">
              <thead>
                <tr>
                  {/* Sticky top-left corner */}
                  <th className="sticky left-0 top-0 z-30 bg-slate-50 dark:bg-slate-800 border-b border-r border-slate-200 dark:border-slate-700 px-4 py-3 text-left min-w-[200px]">
                    <div className="font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-[10px]">Receiver</div>
                  </th>
                  {/* Channel headers */}
                  {visibleChannels.map((ch) => (
                    <th
                      key={ch.channelId}
                      className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800 border-b border-r border-slate-200 dark:border-slate-700 px-2 py-2 min-w-[80px] text-center"
                    >
                      <div className="font-bold text-slate-700 dark:text-slate-200 text-[11px]">CH {ch.channelId}</div>
                      {ch.name !== `CH ${ch.channelId}` && (
                        <div className="text-[9px] text-slate-400 truncate max-w-[72px] mx-auto" title={ch.name}>
                          {ch.name}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeReceivers.map((receiver, rowIdx) => {
                  const channelMap: Record<number, ChannelInfo> = {};
                  receiver.channels.forEach((ch) => { channelMap[ch.channelId] = ch; });
                  const isEven = rowIdx % 2 === 0;

                  return (
                    <tr
                      key={receiver.speakerId}
                      className={`${isEven ? "bg-white dark:bg-slate-800" : "bg-slate-50/50 dark:bg-slate-800/50"} hover:bg-orange-50/30 dark:hover:bg-orange-900/10 transition-colors`}
                    >
                      {/* Sticky receiver label */}
                      <td className={`sticky left-0 z-10 border-r border-b border-slate-200 dark:border-slate-700 px-4 py-3 min-w-[200px] ${isEven ? "bg-white dark:bg-slate-800" : "bg-slate-50/80 dark:bg-slate-800/80"}`}>
                        <div className="flex items-center gap-2">
                          {receiver.status === "ok" ? (
                            <Wifi className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                          ) : receiver.status === "offline" ? (
                            <WifiOff className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                          ) : receiver.status === "no-data" ? (
                            <Info className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">{receiver.label}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{receiver.ipAddress}</div>
                            <div className="text-[10px] text-slate-400 truncate">{receiver.contactName}</div>
                          </div>
                        </div>
                        {(receiver.status === "offline" || receiver.status === "no-data") && (
                          <div className={`mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${
                            receiver.status === "offline"
                              ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                              : "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
                          }`}>
                            {receiver.status === "offline" ? "Offline" : "No Data"}
                          </div>
                        )}
                      </td>

                      {/* Channel cells */}
                      {visibleChannels.map((ch) => {
                        const cell = channelMap[ch.channelId];
                        const isActive = cell?.active === true;
                        const hasData = receiver.status === "ok";

                        return (
                          <td
                            key={ch.channelId}
                            className="border-r border-b border-slate-200 dark:border-slate-700 text-center px-1 py-2.5 min-w-[80px]"
                          >
                            {!hasData ? (
                              <span className="inline-block w-4 h-4 rounded bg-slate-100 dark:bg-slate-700" />
                            ) : isActive ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shadow-sm">
                                  <CheckCircle2 className="w-3 h-3 text-white" />
                                </div>
                                {cell?.name && cell.name !== `CH ${ch.channelId}` && cell.name !== `Channel ${ch.channelId}` && (
                                  <div className="text-[9px] text-green-600 dark:text-green-400 max-w-[72px] truncate" title={cell.name}>
                                    {cell.name}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="inline-block w-4 h-4 rounded-full border-2 border-slate-200 dark:border-slate-600" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-6 flex-wrap text-xs text-slate-500">
            <span className="font-semibold text-slate-400 uppercase tracking-wide text-[10px]">Legend</span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                <CheckCircle2 className="w-2.5 h-2.5 text-white" />
              </span>
              Subscribed to channel
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full border-2 border-slate-300" />
              Not subscribed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-slate-100 dark:bg-slate-700" />
              Offline / no data
            </span>
            <span className="flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5 text-green-500" /> Online
            </span>
            <span className="flex items-center gap-1.5">
              <WifiOff className="w-3.5 h-3.5 text-red-400" /> Offline
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
