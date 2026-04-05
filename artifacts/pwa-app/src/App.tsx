import { useState, useEffect, createContext, useContext } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";

import Dashboard from "@/pages/Dashboard";
import Members from "@/pages/Members";
import MemberCreate from "@/pages/MemberCreate";
import MemberDetail from "@/pages/MemberDetail";
import Grievances from "@/pages/Grievances";
import GrievanceCreate from "@/pages/GrievanceCreate";
import GrievanceDetail from "@/pages/GrievanceDetail";
import Bulletins from "@/pages/Bulletins";
import BulletinCreate from "@/pages/BulletinCreate";
import BulletinDetail from "@/pages/BulletinDetail";
import Documents from "@/pages/Documents";

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      staleTime: 1000 * 60,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />

      <Route path="/members" component={Members} />
      <Route path="/members/new" component={MemberCreate} />
      <Route path="/members/:id" component={MemberDetail} />

      <Route path="/grievances" component={Grievances} />
      <Route path="/grievances/new" component={GrievanceCreate} />
      <Route path="/grievances/:id" component={GrievanceDetail} />

      <Route path="/bulletins" component={Bulletins} />
      <Route path="/bulletins/new" component={BulletinCreate} />
      <Route path="/bulletins/:id" component={BulletinDetail} />

      <Route path="/documents" component={Documents} />

      <Route component={NotFound} />
    </Switch>
  );
}

type AuthState = "loading" | "authenticated" | "unauthenticated";

function App() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  const checkAuth = async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        setAuthState("authenticated");
      } else {
        setUser(null);
        setAuthState("unauthenticated");
      }
    } catch {
      setUser(null);
      setAuthState("unauthenticated");
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    queryClient.clear();
    setUser(null);
    setAuthState("unauthenticated");
  };

  if (authState === "loading") {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary animate-pulse" />
          <p className="text-sm text-muted-foreground font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Login onLoginSuccess={() => checkAuth()} />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return (
    <AuthContext.Provider value={{ user, logout }}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}

export default App;
