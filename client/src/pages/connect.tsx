import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useLocation } from "wouter";
import { Wifi, Monitor } from "lucide-react";

interface ServerInfo {
  lanIP: string;
  port: number;
  url: string;
}

export default function ConnectPage() {
  const [, navigate] = useLocation();

  const { data: info, isLoading } = useQuery<ServerInfo>({
    queryKey: ["/api/info"],
    refetchInterval: 10000,
  });

  const isLocalhost =
    !info || info.lanIP === "localhost" || info.lanIP === "127.0.0.1";
  const displayUrl = info?.url ?? "Loading...";

  return (
    <div
      className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-10 safe-top safe-bottom"
      data-testid="connect-page"
    >
      <div className="w-full max-w-lg flex flex-col items-center gap-8">

        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Wifi className="w-6 h-6 text-primary" />
            <span className="text-sm font-semibold uppercase tracking-widest text-primary">
              IP-A1 Volume Controller
            </span>
          </div>
          <h1 className="text-3xl font-bold text-foreground">
            Connect from any device
          </h1>
          <p className="mt-2 text-muted-foreground text-base">
            Scan the QR code or type the address into any browser on this network.
          </p>
        </div>

        {isLoading ? (
          <div className="w-64 h-64 bg-muted rounded-2xl animate-pulse" />
        ) : isLocalhost ? (
          <div className="w-64 h-64 bg-muted rounded-2xl flex flex-col items-center justify-center gap-3 text-muted-foreground text-center px-6">
            <Monitor className="w-10 h-10" />
            <p className="text-sm leading-snug">
              No LAN address detected. Open{" "}
              <strong>localhost:5000</strong> in your browser.
            </p>
          </div>
        ) : (
          <div
            className="p-4 bg-white rounded-2xl shadow-md"
            data-testid="qr-code"
          >
            <QRCodeSVG
              value={info!.url}
              size={240}
              level="M"
              includeMargin={false}
            />
          </div>
        )}

        <div className="text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
            Network address
          </p>
          <p
            className="text-2xl font-bold font-mono text-foreground break-all"
            data-testid="network-url"
          >
            {displayUrl}
          </p>
        </div>

        <div className="w-full bg-card border border-border rounded-xl px-5 py-4 text-sm text-muted-foreground leading-relaxed">
          <ol className="list-decimal list-inside space-y-1">
            <li>Make sure the device is on the same Wi-Fi or network.</li>
            <li>Scan the QR code <em>or</em> type the address above into any browser.</li>
            <li>Select a room and adjust the volume.</li>
          </ol>
        </div>

        <button
          onClick={() => navigate("/")}
          className="text-sm text-primary underline underline-offset-4 hover:opacity-70 transition-opacity"
          data-testid="button-open-controller"
        >
          Open controller on this device →
        </button>
      </div>
    </div>
  );
}
