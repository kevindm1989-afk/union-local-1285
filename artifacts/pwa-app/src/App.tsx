import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      staleTime: 1000 * 60, // 1 minute
    }
  }
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
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
