import { useState, useEffect } from "react";
import { Radio, Wifi, RefreshCw } from "lucide-react";

export default function QrPage() {
  const [networkUrl, setNetworkUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/qr");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setNetworkUrl(data.url);
    } catch (e: any) {
      setError("Could not determine network address.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-6">
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-8 w-full max-w-sm border border-slate-200 dark:border-slate-700 text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-12 h-12 bg-[#FF8200] rounded-2xl flex items-center justify-center shadow-lg shadow-orange-200">
            <Radio className="w-6 h-6 text-white" />
          </div>
          <div className="text-left">
            <div className="font-black text-2xl text-slate-900 dark:text-white">IV VoxNova</div>
            <div className="text-xs text-slate-400">IP-A1 Control + TTS Paging</div>
          </div>
        </div>

        <h1 className="text-lg font-bold text-slate-800 dark:text-white mb-1">Connect to IV VoxNova</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Scan with your phone or open the URL below on any device on the same network.</p>

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <RefreshCw className="w-8 h-8 text-slate-300 animate-spin" />
            <span className="text-sm text-slate-400">Detecting network address…</span>
          </div>
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-2xl p-4 mb-4">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <button
              onClick={load}
              className="mt-2 text-xs text-red-500 font-semibold hover:text-red-700"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            {/* QR Code */}
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-white rounded-2xl shadow-md border border-slate-100">
                <img
                  src="/api/qr/image"
                  alt="QR code to access IV VoxNova"
                  className="w-48 h-48 block"
                />
              </div>
            </div>

            {/* URL */}
            <div className="bg-slate-50 dark:bg-slate-700 rounded-2xl px-4 py-3 flex items-center gap-3 border border-slate-200 dark:border-slate-600">
              <Wifi className="w-4 h-4 text-[#FF8200] flex-shrink-0" />
              <span className="text-sm font-mono font-semibold text-slate-800 dark:text-white break-all">{networkUrl}</span>
            </div>

            <p className="text-xs text-slate-400 mt-4">
              Make sure your device is on the same Wi-Fi / LAN as this computer.
            </p>
          </>
        )}

        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-700">
          <div className="text-xs text-slate-400 mb-2">Default credentials</div>
          <div className="flex gap-3 justify-center">
            <div className="bg-slate-50 dark:bg-slate-700 rounded-xl px-3 py-2 text-xs font-mono">
              <span className="text-slate-500">Admin:</span> <span className="font-bold text-slate-800 dark:text-white">admin / admin</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-700 rounded-xl px-3 py-2 text-xs font-mono">
              <span className="text-slate-500">IT:</span> <span className="font-bold text-slate-800 dark:text-white">it / it1234</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
