import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/auth";
import { ShieldAlert, RotateCcw, LogOut, Loader2 } from "lucide-react";

export default function RecoveryPage() {
  const { logout } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleReset() {
    setBusy(true);
    try {
      const res = await apiFetch("/api/auth/reset-admin", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");
      setDone(true);
      toast({ title: "Admin reset", description: "Admin account restored to admin / admin" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 p-4">
      <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-8 space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center">
            <ShieldAlert className="w-7 h-7 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Recovery Mode</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              This account can only reset the admin account to its default credentials.
            </p>
          </div>
        </div>

        {!done ? (
          <div className="space-y-3">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-300">
              <p className="font-semibold mb-1">This will reset:</p>
              <ul className="list-disc list-inside space-y-0.5 text-amber-700 dark:text-amber-400">
                <li>Username → <code className="font-mono">admin</code></li>
                <li>Password → <code className="font-mono">admin</code></li>
                <li>Display name → Administrator</li>
              </ul>
              <p className="mt-2 text-xs">All other user accounts and settings are untouched.</p>
            </div>

            <button
              data-testid="button-reset-admin"
              onClick={handleReset}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              Reset Admin Account
            </button>
          </div>
        ) : (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 text-sm text-green-800 dark:text-green-300 text-center">
            <p className="font-semibold">Admin account has been reset.</p>
            <p className="mt-1 text-xs">You can now log in with <code className="font-mono">admin</code> / <code className="font-mono">admin</code></p>
          </div>
        )}

        <button
          data-testid="button-recovery-logout"
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Exit recovery mode
        </button>
      </div>
    </div>
  );
}
