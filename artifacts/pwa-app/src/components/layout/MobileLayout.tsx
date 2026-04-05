import { Link, useLocation } from "wouter";
import { LayoutDashboard, CheckSquare, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function MobileLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-[100dvh] max-w-[375px] mx-auto bg-background pb-[84px] relative flex flex-col shadow-2xl ring-1 ring-border">
      <main className="flex-1 overflow-y-auto no-scrollbar relative w-full">
        {children}
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[375px] h-[84px] bg-background/80 backdrop-blur-xl border-t border-border flex items-center justify-around px-6 pb-safe z-50">
        <Link 
          href="/" 
          className={cn(
            "flex flex-col items-center justify-center min-w-[64px] h-[54px] gap-1 rounded-xl transition-all",
            location === "/" ? "text-primary font-semibold" : "text-muted-foreground hover:bg-muted/50"
          )}
        >
          <LayoutDashboard className="w-6 h-6" />
          <span className="text-[10px]">Home</span>
        </Link>

        <Link 
          href="/tasks/new" 
          className="flex items-center justify-center w-[54px] h-[54px] bg-primary text-primary-foreground rounded-full shadow-lg shadow-primary/30 transform -translate-y-4 hover:scale-105 active:scale-95 transition-all"
        >
          <Plus className="w-7 h-7" strokeWidth={2.5} />
        </Link>

        <Link 
          href="/tasks" 
          className={cn(
            "flex flex-col items-center justify-center min-w-[64px] h-[54px] gap-1 rounded-xl transition-all",
            location.startsWith("/tasks") && location !== "/tasks/new" ? "text-primary font-semibold" : "text-muted-foreground hover:bg-muted/50"
          )}
        >
          <CheckSquare className="w-6 h-6" />
          <span className="text-[10px]">Tasks</span>
        </Link>
      </nav>
    </div>
  );
}