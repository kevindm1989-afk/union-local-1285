import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import RequestAccess from "@/pages/RequestAccess";

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
import Admin from "@/pages/Admin";
import CbaAssistant from "@/pages/CbaAssistant";
import ContractViolationDetector from "@/pages/ContractViolationDetector";
import Meetings from "@/pages/Meetings";
import MeetingCreate from "@/pages/MeetingCreate";
import MeetingDetail from "@/pages/MeetingDetail";

import Stats from "@/pages/Stats";
import Coverage from "@/pages/Coverage";
import Polls from "@/pages/Polls";
import Elections from "@/pages/Elections";
import SeniorityDispute from "@/pages/SeniorityDispute";
import ExecutiveDashboard from "@/pages/ExecutiveDashboard";

import MemberPortalProfile from "@/pages/portal/MemberPortalProfile";
import MemberPortalGrievances from "@/pages/portal/MemberPortalGrievances";
import MemberPortalBulletins from "@/pages/portal/MemberPortalBulletins";
import MemberPortalDiscipline from "@/pages/portal/MemberPortalDiscipline";
import MemberPortalSignCard from "@/pages/portal/MemberPortalSignCard";
import MemberPortalCbaAssistant from "@/pages/portal/MemberPortalCbaAssistant";
import MemberPortalRights from "@/pages/portal/MemberPortalRights";
import MemberPortalComplaints from "@/pages/portal/MemberPortalComplaints";
import MemberPortalJournal from "@/pages/portal/MemberPortalJournal";
import MemberRights from "@/pages/MemberRights";
import BargainingAssistant from "@/pages/BargainingAssistant";
import Complaints from "@/pages/Complaints";

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: string;
  permissions: string[];
  linkedMemberId: number | null;
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

export function usePermissions() {
  const { user } = useAuth();
  const can = (permission: string): boolean => {
    if (!user) return false;
    if (user.role === "admin") return true;
    return user.permissions.includes(permission);
  };
  const roleLabel = (role: string) => {
    if (role === "admin") return "Admin";
    if (role === "chair") return "Chair";
    return "Steward";
  };
  return { can, role: user?.role ?? "", roleLabel };
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      staleTime: 1000 * 60,
    },
  },
});

function StewardRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />

      <Route path="/members" component={Members} />
      <Route path="/members/new" component={MemberCreate} />
      <Route path="/members/:id" component={MemberDetail} />

      <Route path="/grievances" component={Grievances} />
      <Route path="/grievances/detect" component={ContractViolationDetector} />
      <Route path="/grievances/new" component={GrievanceCreate} />
      <Route path="/grievances/:id" component={GrievanceDetail} />

      <Route path="/bulletins" component={Bulletins} />
      <Route path="/bulletins/new" component={BulletinCreate} />
      <Route path="/bulletins/:id" component={BulletinDetail} />

      <Route path="/documents" component={Documents} />

      <Route path="/meetings" component={Meetings} />
      <Route path="/meetings/new" component={MeetingCreate} />
      <Route path="/meetings/:id" component={MeetingDetail} />

      <Route path="/assistant" component={CbaAssistant} />
      <Route path="/rights" component={MemberRights} />
      <Route path="/bargaining" component={BargainingAssistant} />
      <Route path="/complaints" component={Complaints} />
      <Route path="/portal/complaints" component={MemberPortalComplaints} />

      <Route path="/admin" component={Admin} />

      <Route path="/stats" component={Stats} />
      <Route path="/coverage" component={Coverage} />

      <Route component={NotFound} />
    </Switch>
  );
}

function MemberPortalRouter() {
  return (
    <Switch>
      <Route path="/portal" component={MemberPortalProfile} />
      <Route path="/portal/grievances" component={MemberPortalGrievances} />
      <Route path="/portal/bulletins" component={MemberPortalBulletins} />
      <Route path="/portal/discipline" component={MemberPortalDiscipline} />
      <Route path="/portal/rights" component={MemberPortalRights} />
      <Route path="/portal/complaints" component={MemberPortalComplaints} />
      <Route path="/portal/assistant" component={MemberPortalCbaAssistant} />
      <Route path="/portal/journal" component={MemberPortalJournal} />
      <Route path="/portal/sign-card" component={MemberPortalSignCard} />
      <Route path="/" component={MemberPortalProfile} />
      <Route component={MemberPortalProfile} />
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
    const path = window.location.pathname;
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    if (path === `${base}/request-access` || path.endsWith("/request-access")) {
      return <RequestAccess />;
    }
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
    <ErrorBoundary>
      <AuthContext.Provider value={{ user, logout }}>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <IdleLogout />
              <Switch>
                <Route path="/polls" component={Polls} />
                <Route path="/elections" component={Elections} />
                <Route path="/seniority-disputes" component={SeniorityDispute} />
                <Route path="/executive-dashboard" component={ExecutiveDashboard} />
                <Route>{user?.role === "member" ? <MemberPortalRouter /> : <StewardRouter />}</Route>
              </Switch>
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </AuthContext.Provider>
    </ErrorBoundary>
  );
}

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

function IdleLogout() {
  const { logout } = useAuth();
  const handleIdle = useCallback(() => {
    logout();
  }, [logout]);
  useIdleTimeout(IDLE_TIMEOUT_MS, handleIdle);
  return null;
}

export default App;
