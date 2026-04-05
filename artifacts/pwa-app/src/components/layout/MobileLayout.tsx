import { useState } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Users, FileText, Bell, FolderOpen, Plus, LogOut, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/App";

export function MobileLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const getSection = () => {
    if (location.startsWith("/members")) return "members";
    if (location.startsWith("/grievances")) return "grievances";
    if (location.startsWith("/bulletins")) return "bulletins";
    if (location.startsWith("/documents")) return "documents";
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

  const navItems = [
    { id: "dashboard", href: "/", icon: LayoutDashboard, label: "Home" },
    { id: "members", href: "/members", icon: Users, label: "Members" },
    { id: "grievances", href: "/grievances", icon: FileText, label: "Grievances" },
    { id: "bulletins", href: "/bulletins", icon: Bell, label: "Bulletins" },
    { id: "documents", href: "/documents", icon: FolderOpen, label: "CBA" },
  ];

  return (
    <div className="min-h-[100dvh] max-w-[480px] mx-auto bg-background pb-[76px] relative flex flex-col shadow-2xl ring-1 ring-border">
      {user && (
        <div className="flex items-center justify-end px-4 py-2 border-b border-border/50 bg-background/95 backdrop-blur-sm">
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
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowUserMenu(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-xl shadow-xl min-w-[160px] overflow-hidden">
                  <div className="px-3 py-2.5 border-b border-border">
                    <p className="text-xs font-bold text-foreground">{user.displayName}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">@{user.username}</p>
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
        </div>
      )}

      <main className="flex-1 overflow-y-auto no-scrollbar relative w-full">
        {children}
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-background border-t border-border z-50">
        <div className="flex items-center justify-between px-1 pb-safe">
          {navItems.map((item, i) => {
            const Icon = item.icon;
            const isActive = section === item.id;
            const isMidpoint = i === 2 && newLink;

            if (isMidpoint) {
              return (
                <div key={item.id} className="flex flex-col items-center relative" style={{ minWidth: 0, flex: 1 }}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex flex-col items-center justify-center py-2 gap-0.5 w-full transition-all rounded-xl",
                      isActive ? "text-primary font-bold" : "text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-[9px] font-semibold uppercase tracking-wide">{item.label}</span>
                  </Link>
                  {newLink && (
                    <Link
                      href={newLink}
                      className="absolute -top-6 flex items-center justify-center w-12 h-12 bg-primary text-primary-foreground rounded-xl shadow-lg shadow-primary/30 hover:scale-105 active:scale-95 transition-all"
                    >
                      <Plus className="w-6 h-6" strokeWidth={2.5} />
                    </Link>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center py-2 gap-0.5 transition-all rounded-xl",
                  "min-w-0 flex-1",
                  isActive ? "text-primary font-bold" : "text-muted-foreground hover:bg-muted/50"
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[9px] font-semibold uppercase tracking-wide">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
