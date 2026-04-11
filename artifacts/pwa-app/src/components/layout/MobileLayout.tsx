import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Users, FileText, Bell, Bot, FolderOpen, Plus, LogOut, ChevronDown, ShieldCheck, CalendarDays, BellRing, BellOff, Sun, Moon, BarChart2, MapPin, Vote } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth, usePermissions } from "@/App";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useTheme } from "@/hooks/useTheme";

export function MobileLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { roleLabel, can } = usePermissions();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { status: pushStatus, subscribe, unsubscribe } = usePushNotifications();
  const { isDark, toggle } = useTheme();

  // Apply theme on mount
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const getSection = () => {
    if (location.startsWith("/members")) return "members";
    if (location.startsWith("/grievances")) return "grievances";
    if (location.startsWith("/bulletins")) return "bulletins";
    if (location.startsWith("/documents")) return "documents";
    if (location.startsWith("/assistant")) return "assistant";
    if (location.startsWith("/meetings")) return "meetings";
    if (location.startsWith("/stats")) return "stats";
    if (location.startsWith("/coverage")) return "coverage";
    if (location.startsWith("/polls")) return "polls";
    return "dashboard";
  };

  const section = getSection();

  const getNewLink = () => {
    if (section === "members" && can("members.edit")) return "/members/new";
    if (section === "grievances" && can("grievances.file")) return "/grievances/new";
    if (section === "bulletins" && can("bulletins.post")) return "/bulletins/new";
    if (section === "meetings" && can("meetings.manage")) return "/meetings/new";
    return null;
  };

  const newLink = getNewLink();

  const navItems = [
    { id: "dashboard", href: "/", icon: LayoutDashboard, label: "Home" },
    { id: "members", href: "/members", icon: Users, label: "Members" },
    { id: "grievances", href: "/grievances", icon: FileText, label: "Griev." },
    { id: "bulletins", href: "/bulletins", icon: Bell, label: "Bulletins" },
    { id: "meetings", href: "/meetings", icon: CalendarDays, label: "Meetings" },
    { id: "documents", href: "/documents", icon: FolderOpen, label: "Docs" },
    { id: "assistant", href: "/assistant", icon: Bot, label: "AI" },
  ];

  return (
    <div className="min-h-[100dvh] max-w-[480px] mx-auto bg-background pb-[76px] relative flex flex-col shadow-2xl ring-1 ring-border">
      {user && (
        <div className="flex items-center justify-end px-4 py-2 border-b border-border/50 bg-background/95 backdrop-blur-sm relative z-30">
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
                <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-xl shadow-xl min-w-[180px] overflow-hidden">
                  <div className="px-3 py-2.5 border-b border-border">
                    <p className="text-xs font-bold text-foreground">{user.displayName}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">@{user.username}</p>
                    <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                      {roleLabel(user.role)}
                    </span>
                  </div>

                  {/* Dark mode toggle */}
                  <button
                    onClick={() => { toggle(); setShowUserMenu(false); }}
                    className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-foreground hover:bg-muted/50 transition-colors"
                  >
                    {isDark ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-blue-500" />}
                    {isDark ? "Light Mode" : "Dark Mode"}
                  </button>

                  {/* Quick links for advanced features */}
                  <div className="border-t border-border">
                    <Link
                      href="/stats"
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-foreground hover:bg-muted/50 transition-colors"
                    >
                      <BarChart2 className="w-4 h-4 text-primary" />
                      Grievance Stats
                    </Link>
                    <Link
                      href="/coverage"
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-foreground hover:bg-muted/50 transition-colors"
                    >
                      <MapPin className="w-4 h-4 text-primary" />
                      Coverage Map
                    </Link>
                    <Link
                      href="/polls"
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-foreground hover:bg-muted/50 transition-colors"
                    >
                      <Vote className="w-4 h-4 text-primary" />
                      Polls
                    </Link>
                  </div>

                  {(user.role === "admin" || user.role === "chair") && (
                    <div className="border-t border-border">
                      <Link
                        href="/admin"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-foreground hover:bg-muted/50 transition-colors"
                      >
                        <ShieldCheck className="w-4 h-4 text-primary" />
                        Admin Panel
                      </Link>
                    </div>
                  )}

                  {pushStatus !== "unsupported" && pushStatus !== "denied" && (
                    <div className="border-t border-border">
                      <button
                        onClick={async () => {
                          setShowUserMenu(false);
                          if (pushStatus === "subscribed") {
                            await unsubscribe();
                          } else {
                            await subscribe();
                          }
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-foreground hover:bg-muted/50 transition-colors"
                      >
                        {pushStatus === "subscribed" ? (
                          <><BellOff className="w-4 h-4 text-muted-foreground" />Disable Notifications</>
                        ) : (
                          <><BellRing className="w-4 h-4 text-primary" />Enable Notifications</>
                        )}
                      </button>
                    </div>
                  )}

                  <div className="border-t border-border">
                    <button
                      onClick={() => { setShowUserMenu(false); logout(); }}
                      className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto no-scrollbar relative w-full">
        {children}
      </main>

      {/* FAB — fixed above nav bar, bottom-right */}
      {newLink && (
        <Link
          href={newLink}
          className="fixed bottom-[84px] right-4 z-40 flex items-center justify-center w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-xl shadow-primary/40 hover:scale-105 active:scale-95 transition-all"
          style={{ maxWidth: "calc(480px - 1rem)", right: "max(1rem, calc(50vw - 240px + 1rem))" }}
        >
          <Plus className="w-6 h-6" strokeWidth={2.5} />
        </Link>
      )}

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-background border-t border-border z-50">
        <div className="flex items-center justify-between px-1 pb-safe">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = section === item.id;
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
