import { Link, useLocation } from "wouter";
import { LayoutDashboard, Users, FileText, Bell, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function MobileLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const getSection = () => {
    if (location.startsWith("/members")) return "members";
    if (location.startsWith("/grievances")) return "grievances";
    if (location.startsWith("/bulletins")) return "bulletins";
    return "dashboard";
  };

  const section = getSection();

  const getNewLink = () => {
    if (section === "members") return "/members/new";
    if (section === "grievances") return "/grievances/new";
    if (section === "bulletins") return "/bulletins/new";
    return null;
  };

  const newLink = getNewLink();

  return (
    <div className="min-h-[100dvh] max-w-[480px] mx-auto bg-background pb-[84px] relative flex flex-col shadow-2xl ring-1 ring-border">
      <main className="flex-1 overflow-y-auto no-scrollbar relative w-full">
        {children}
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] h-[84px] bg-background border-t border-border flex items-center justify-between px-2 sm:px-6 pb-safe z-50">
        <Link 
          href="/" 
          className={cn(
            "flex flex-col items-center justify-center min-w-[64px] h-[54px] gap-1 rounded-xl transition-all",
            section === "dashboard" ? "text-primary font-bold" : "text-muted-foreground hover:bg-muted/50"
          )}
        >
          <LayoutDashboard className="w-6 h-6" />
          <span className="text-[10px] font-medium uppercase tracking-wider">Home</span>
        </Link>

        <Link 
          href="/members" 
          className={cn(
            "flex flex-col items-center justify-center min-w-[64px] h-[54px] gap-1 rounded-xl transition-all",
            section === "members" ? "text-primary font-bold" : "text-muted-foreground hover:bg-muted/50"
          )}
        >
          <Users className="w-6 h-6" />
          <span className="text-[10px] font-medium uppercase tracking-wider">Members</span>
        </Link>

        {newLink ? (
          <Link 
            href={newLink} 
            className="flex items-center justify-center w-[54px] h-[54px] bg-primary text-primary-foreground rounded-md shadow-lg shadow-primary/30 transform -translate-y-4 hover:scale-105 active:scale-95 transition-all"
          >
            <Plus className="w-8 h-8" strokeWidth={2.5} />
          </Link>
        ) : (
          <div className="w-[54px]" />
        )}

        <Link 
          href="/grievances" 
          className={cn(
            "flex flex-col items-center justify-center min-w-[64px] h-[54px] gap-1 rounded-xl transition-all",
            section === "grievances" ? "text-primary font-bold" : "text-muted-foreground hover:bg-muted/50"
          )}
        >
          <FileText className="w-6 h-6" />
          <span className="text-[10px] font-medium uppercase tracking-wider">Grievances</span>
        </Link>
        
        <Link 
          href="/bulletins" 
          className={cn(
            "flex flex-col items-center justify-center min-w-[64px] h-[54px] gap-1 rounded-xl transition-all",
            section === "bulletins" ? "text-primary font-bold" : "text-muted-foreground hover:bg-muted/50"
          )}
        >
          <Bell className="w-6 h-6" />
          <span className="text-[10px] font-medium uppercase tracking-wider">Bulletins</span>
        </Link>
      </nav>
    </div>
  );
}