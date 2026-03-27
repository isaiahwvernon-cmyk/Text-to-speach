import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Radio, Lock, Mic, Wifi } from "lucide-react";

const INPUT_CLS =
  "w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FF8200] focus:border-transparent transition-all text-base";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setLoading(true);
    try {
      await login(username.trim(), password);
      navigate("/");
    } catch (err: any) {
      toast({
        title: "Login failed",
        description: err.message || "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex flex-col items-center justify-center p-4">
      {/* Logo / Brand */}
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="w-12 h-12 bg-[#FF8200] rounded-2xl flex items-center justify-center shadow-lg shadow-orange-200">
            <Radio className="w-7 h-7 text-white" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
          REPIT
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          IP-A1 Control + TTS Paging System
        </p>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 p-8">
        <div className="flex items-center gap-2 mb-6">
          <Lock className="w-4 h-4 text-[#FF8200]" />
          <h2 className="text-base font-semibold text-slate-700 dark:text-slate-200">
            Sign in to continue
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Username
            </label>
            <input
              data-testid="input-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              className={INPUT_CLS}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Password
            </label>
            <input
              data-testid="input-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className={INPUT_CLS}
            />
          </div>

          <Button
            data-testid="button-login"
            type="submit"
            disabled={loading || !username.trim() || !password.trim()}
            className="w-full bg-[#FF8200] hover:bg-[#e07200] text-white rounded-xl py-3 text-base font-semibold mt-2 shadow-md shadow-orange-100"
          >
            {loading ? "Signing in…" : "Sign In"}
          </Button>
        </form>
      </div>

      {/* Feature hints */}
      <div className="mt-8 flex items-center gap-6 text-xs text-slate-400">
        <span className="flex items-center gap-1.5"><Mic className="w-3.5 h-3.5" /> TTS Paging</span>
        <span className="flex items-center gap-1.5"><Wifi className="w-3.5 h-3.5" /> SIP Routing</span>
        <span className="flex items-center gap-1.5"><Radio className="w-3.5 h-3.5" /> IP-A1 Control</span>
      </div>

      <p className="mt-6 text-xs text-slate-400 text-center">
        Default credentials: <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">admin / admin</code>
      </p>
    </div>
  );
}
