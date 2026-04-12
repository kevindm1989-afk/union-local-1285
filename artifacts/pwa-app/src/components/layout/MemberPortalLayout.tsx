import { useState } from "react";
import { Link, useLocation } from "wouter";
import { User, FileText, Bell, PenLine, LogOut, ChevronDown, ShieldAlert, Sparkles, Vote } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/App";

const navItems = [
  { id: "profile", href: "/portal", icon: User, label: "Profile" },
  { id: "grievances", href: "/portal/grievances", icon: FileText, label: "Grievances" },
  { id: "bulletins", href: "/portal/bulletins", icon: Bell, label: "Bulletins" },
  { id: "discipline", href: "/portal/discipline", icon: ShieldAlert, label: "Discipline" },
  { id: "polls", href: "/polls", icon: Vote, label: "Polls" },
  { id: "assistant", href: "/portal/assistant", icon: Sparkles, label: "Assistant" },
  { id: "sign-card", href: "/portal/sign-card", icon: PenLine, label: "Card" },
];

export function MemberPortalLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const getSection = () => {
    if (location.startsWith("/portal/grievances")) return "grievances";
    if (location.startsWith("/portal/bulletins")) return "bulletins";
    if (location.startsWith("/portal/discipline")) return "discipline";
    if (location.startsWith("/portal/assistant")) return "assistant";
    if (location.startsWith("/portal/sign-card")) return "sign-card";
    if (location === "/polls") return "polls";
    return "profile";
  };

  const section = getSection();

  return (
    <div className="min-h-[100dvh] max-w-[480px] mx-auto bg-background pb-[76px] relative flex flex-col shadow-2xl ring-1 ring-border">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-primary/5 backdrop-blur-sm relative z-30">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
            <span className="text-[10px] font-bold text-primary-foreground">UL</span>
          </div>
          <span className="text-xs font-bold text-primary">Member Portal</span>
        </div>
        {user && (
          <div className="relative">
            <button
              onClick={() => setShowUserMenu((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1 px-2 rounded-lg hover:bg-muted/50"
            >
              <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-[9px] font-bold text-primary uppercase">
                  {user.displayName.charAt(0)}
                </span>
              </div>
              <span className="font-medium">{user.displayName}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-xl shadow-xl min-w-[160px] overflow-hidden">
                  <div className="px-3 py-2.5 border-b border-border">
                    <p className="text-xs font-bold text-foreground">{user.displayName}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">@{user.username}</p>
                    <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-1.5 py-0.5 rounded-full">
                      Member
                    </span>
                  </div>
                  <button
                    onClick={() => { setShowUserMenu(false); logout(); }}
                    className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <main className="flex-1 overflow-y-auto no-scrollbar relative w-full">
        {children}
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-background border-t border-border z-50">
        <div className="flex items-center justify-around px-2 py-1 pb-safe">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = section === item.id;
            return (
              <Link
                key={item.id}
                href={item.href}
                title={item.label}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl transition-all min-w-[40px]",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <div className={cn(
                  "flex items-center justify-center w-9 h-7 rounded-full transition-all",
                  isActive ? "bg-primary/10" : ""
                )}>
                  <Icon className={cn("transition-all", isActive ? "w-5 h-5" : "w-5 h-5")} />
                </div>
                <span className={cn(
                  "text-[9px] font-semibold leading-none tracking-wide",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
