import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Home from "@/pages/home";
import LoginPage from "@/pages/login";
import AdminPage from "@/pages/admin";
import ItSettingsPage from "@/pages/it-settings";
import ConnectPage from "@/pages/connect";
import NotFound from "@/pages/not-found";

function ProtectedRoute({ component: Component, roles }: {
  component: React.ComponentType;
  roles?: string[];
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="text-slate-400 text-sm animate-pulse">Loading REPIT…</div>
      </div>
    );
  }

  if (!user) return <Redirect to="/login" />;
  if (roles && !roles.includes(user.role)) return <Redirect to="/" />;

  return <Component />;
}

function PublicRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="text-slate-400 text-sm animate-pulse">Loading REPIT…</div>
      </div>
    );
  }

  if (user) return <Redirect to="/" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login">
        <PublicRoute component={LoginPage} />
      </Route>
      <Route path="/">
        <ProtectedRoute component={Home} />
      </Route>
      <Route path="/admin">
        <ProtectedRoute component={AdminPage} roles={["admin"]} />
      </Route>
      <Route path="/it-settings">
        <ProtectedRoute component={ItSettingsPage} roles={["it"]} />
      </Route>
      <Route path="/connect">
        <ProtectedRoute component={ConnectPage} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
