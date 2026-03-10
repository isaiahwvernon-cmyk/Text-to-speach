import { useState, useEffect, useCallback, useRef } from "react";
import { Volume2, VolumeX, Volume1, Wifi, WifiOff, Settings, X, Minus, Plus, Speaker, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import type { SpeakerConnection, SpeakerStatus } from "@shared/schema";

const VOLUME_PRESETS = [
  { label: "Low", value: 15, icon: Volume1 },
  { label: "Normal", value: 31, icon: Volume2 },
  { label: "Loud", value: 48, icon: Speaker },
];

function ConnectionSetup({
  onConnect,
  initialConnection,
  error,
}: {
  onConnect: (conn: SpeakerConnection) => void;
  initialConnection: SpeakerConnection | null;
  error: string | null;
}) {
  const [ip, setIp] = useState(initialConnection?.ipAddress || "");
  const [username, setUsername] = useState(initialConnection?.username || "");
  const [password, setPassword] = useState(initialConnection?.password || "");
  const [connecting, setConnecting] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950">
      <Card className="w-full max-w-md border-0 shadow-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
        <CardContent className="p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white mb-4 shadow-lg shadow-blue-500/25">
              <Speaker className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white" data-testid="text-setup-title">
              Speaker Setup
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Enter the connection details for your classroom speaker
            </p>
          </div>

          {error && (
            <div className="mb-6 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start gap-2.5" data-testid="text-connection-error">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setConnecting(true);
              onConnect({ ipAddress: ip, username, password });
            }}
            className="space-y-5"
          >
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Speaker IP Address
              </label>
              <input
                data-testid="input-ip-address"
                type="text"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="192.168.1.100"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-base"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Username
              </label>
              <input
                data-testid="input-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-base"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Password
              </label>
              <input
                data-testid="input-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-base"
                required
              />
            </div>

            <Button
              type="submit"
              data-testid="button-connect"
              disabled={connecting}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold text-base shadow-lg shadow-blue-500/25 transition-all duration-200"
            >
              <Wifi className="w-5 h-5 mr-2" />
              {connecting ? "Connecting..." : "Connect to Speaker"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function VolumeKnobDisplay({ volume, max }: { volume: number; max: number }) {
  const percentage = max > 0 ? Math.round((volume / max) * 100) : 0;
  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="160" height="160" className="transform -rotate-90">
        <circle
          cx="80"
          cy="80"
          r="54"
          stroke="currentColor"
          className="text-slate-200 dark:text-slate-700"
          strokeWidth="10"
          fill="none"
        />
        <circle
          cx="80"
          cy="80"
          r="54"
          stroke="url(#volumeGradient)"
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-300 ease-out"
        />
        <defs>
          <linearGradient id="volumeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-4xl font-bold text-slate-900 dark:text-white tabular-nums"
          data-testid="text-volume-percentage"
        >
          {percentage}%
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {volume} / {max}
        </span>
      </div>
    </div>
  );
}

function ControlPanel({
  connection,
  onDisconnect,
}: {
  connection: SpeakerConnection;
  onDisconnect: () => void;
}) {
  const { toast } = useToast();
  const [status, setStatus] = useState<SpeakerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [changingVolume, setChangingVolume] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [sliderValue, setSliderValue] = useState<number | null>(null);
  const wasConnectedRef = useRef(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/speaker/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(connection),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Could not reach the speaker" }));
        throw new Error(errData.error || "Could not reach the speaker");
      }
      const data: SpeakerStatus = await res.json();
      setStatus(data);
      if (sliderValue === null) {
        setSliderValue(data.volume);
      }
      if (!wasConnectedRef.current) {
        wasConnectedRef.current = true;
        toast({ title: "Reconnected", description: "Speaker connection restored" });
      }
    } catch (err: any) {
      setStatus((prev) =>
        prev ? { ...prev, connected: false } : {
          volume: 0, max: 61, min: 0, muteState: "unmute" as const, connected: false,
        }
      );
      if (wasConnectedRef.current) {
        wasConnectedRef.current = false;
        toast({
          title: "Connection Lost",
          description: err.message || "Could not reach the speaker",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [connection, toast, sliderValue]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const setVolume = useCallback(
    async (vol: number) => {
      setChangingVolume(true);
      try {
        const res = await fetch("/api/speaker/volume/set", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...connection, volume: vol }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: "Failed" }));
          throw new Error(errData.error);
        }
        const data = await res.json();
        setStatus((prev) => prev ? { ...prev, volume: data.volume, connected: true } : prev);
        setSliderValue(data.volume);
      } catch (err: any) {
        toast({
          title: "Volume Error",
          description: err.message || "Failed to set volume",
          variant: "destructive",
        });
      } finally {
        setChangingVolume(false);
      }
    },
    [connection, toast]
  );

  const handleSliderChange = useCallback(
    (values: number[]) => {
      const val = values[0];
      setSliderValue(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setVolume(val);
      }, 300);
    },
    [setVolume]
  );

  const toggleMute = useCallback(async () => {
    if (!status) return;
    const newState = status.muteState === "mute" ? "unmute" : "mute";
    try {
      const res = await fetch("/api/speaker/mute/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...connection, mute_state: newState }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(errData.error);
      }
      const data = await res.json();
      setStatus((prev) => prev ? { ...prev, muteState: data.mute_state, connected: true } : prev);
      toast({
        title: data.mute_state === "mute" ? "Speaker Muted" : "Speaker Unmuted",
        description: data.mute_state === "mute" ? "The speaker is now muted" : "The speaker is now active",
      });
    } catch (err: any) {
      toast({
        title: "Mute Error",
        description: err.message || "Failed to toggle mute",
        variant: "destructive",
      });
    }
  }, [status, connection, toast]);

  const incrementVolume = useCallback(async () => {
    try {
      const res = await fetch("/api/speaker/volume/increment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(connection),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const data = await res.json();
      setStatus((prev) => prev ? { ...prev, volume: data.volume, connected: true } : prev);
      setSliderValue(data.volume);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }, [connection, toast]);

  const decrementVolume = useCallback(async () => {
    try {
      const res = await fetch("/api/speaker/volume/decrement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(connection),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const data = await res.json();
      setStatus((prev) => prev ? { ...prev, volume: data.volume, connected: true } : prev);
      setSliderValue(data.volume);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }, [connection, toast]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white mb-4 animate-pulse shadow-lg shadow-blue-500/25">
            <Speaker className="w-8 h-8" />
          </div>
          <p className="text-slate-600 dark:text-slate-400 font-medium" data-testid="text-connecting">
            Connecting to speaker...
          </p>
        </div>
      </div>
    );
  }

  const currentVolume = sliderValue ?? status?.volume ?? 0;
  const maxVolume = status?.max ?? 61;
  const isMuted = status?.muteState === "mute";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 flex flex-col">
      <header className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                status?.connected
                  ? "bg-emerald-500 shadow-sm shadow-emerald-500/50"
                  : "bg-red-500 shadow-sm shadow-red-500/50"
              }`}
              data-testid="status-connection"
            />
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400" data-testid="text-speaker-ip">
              {connection.ipAddress}
            </span>
          </div>
          {status?.terminalName && (
            <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:inline">
              · {status.terminalName}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          data-testid="button-settings"
        >
          {showSettings ? <X className="w-5 h-5" /> : <Settings className="w-5 h-5" />}
        </button>
      </header>

      {showSettings && (
        <div className="px-5 pb-3 animate-in slide-in-from-top-2 duration-200">
          <Card className="border-0 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Connected Speaker</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {connection.ipAddress} · {status?.modelName || "TOA IP-A1"}
                  </p>
                </div>
                <Button
                  onClick={onDisconnect}
                  variant="destructive"
                  size="sm"
                  className="rounded-lg"
                  data-testid="button-disconnect"
                >
                  <WifiOff className="w-4 h-4 mr-1.5" />
                  Disconnect
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!status?.connected && (
        <div className="mx-5 mb-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400">
            Speaker unreachable — check network connection and credentials
          </p>
        </div>
      )}

      <main className="flex-1 flex flex-col items-center justify-center px-5 pb-8 -mt-4">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center">
            <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-6" data-testid="text-page-title">
              Classroom Speaker
            </h1>
            <VolumeKnobDisplay volume={currentVolume} max={maxVolume} />
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                onClick={decrementVolume}
                className="flex-shrink-0 w-11 h-11 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-all shadow-sm"
                data-testid="button-volume-down"
              >
                <Minus className="w-5 h-5" />
              </button>

              <div className="flex-1">
                <Slider
                  data-testid="slider-volume"
                  value={[currentVolume]}
                  min={0}
                  max={maxVolume}
                  step={1}
                  onValueChange={handleSliderChange}
                  className="cursor-pointer"
                  disabled={changingVolume}
                />
              </div>

              <button
                onClick={incrementVolume}
                className="flex-shrink-0 w-11 h-11 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-all shadow-sm"
                data-testid="button-volume-up"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500 px-14">
              <span>Mute</span>
              <span>Max</span>
            </div>
          </div>

          <button
            onClick={toggleMute}
            data-testid="button-mute"
            className={`w-full h-14 rounded-2xl font-semibold text-base flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-[0.98] ${
              isMuted
                ? "bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/25"
                : "bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-sm"
            }`}
          >
            {isMuted ? (
              <>
                <VolumeX className="w-5 h-5" />
                Unmute Speaker
              </>
            ) : (
              <>
                <VolumeX className="w-5 h-5" />
                Mute Speaker
              </>
            )}
          </button>

          <div className="grid grid-cols-3 gap-3">
            {VOLUME_PRESETS.map((preset) => {
              const isActive =
                currentVolume >= preset.value - 2 && currentVolume <= preset.value + 2;
              const PresetIcon = preset.icon;
              return (
                <button
                  key={preset.label}
                  onClick={() => {
                    setSliderValue(preset.value);
                    setVolume(preset.value);
                  }}
                  data-testid={`button-preset-${preset.label.toLowerCase()}`}
                  className={`h-16 rounded-2xl font-medium text-sm flex flex-col items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 ${
                    isActive
                      ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm"
                  }`}
                >
                  <PresetIcon className="w-4 h-4" />
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      </main>

      <footer className="text-center pb-4 px-5">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          TOA IP-A1 Speaker Control
        </p>
      </footer>
    </div>
  );
}

export default function Home() {
  const [connection, setConnection] = useState<SpeakerConnection | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("speaker_connection");
    if (saved) {
      try {
        setConnection(JSON.parse(saved));
      } catch {
        localStorage.removeItem("speaker_connection");
      }
    }
  }, []);

  const handleConnect = async (conn: SpeakerConnection) => {
    setConnectionError(null);
    try {
      const res = await fetch("/api/speaker/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(conn),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Connection failed" }));
        setConnectionError(errData.error || "Could not connect to the speaker");
        return;
      }
      localStorage.setItem("speaker_connection", JSON.stringify(conn));
      setConnection(conn);
    } catch (err: any) {
      setConnectionError(err.message || "Connection failed");
    }
  };

  const handleDisconnect = () => {
    localStorage.removeItem("speaker_connection");
    setConnection(null);
    setConnectionError(null);
  };

  if (!connection) {
    return (
      <ConnectionSetup
        onConnect={handleConnect}
        initialConnection={null}
        error={connectionError}
      />
    );
  }

  return <ControlPanel connection={connection} onDisconnect={handleDisconnect} />;
}
