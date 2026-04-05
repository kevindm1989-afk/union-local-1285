import { useState } from "react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import {
  useListAnnouncements,
  getListAnnouncementsQueryKey,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Bell, ChevronRight } from "lucide-react";

const categories = [
  { id: "all", label: "All" },
  { id: "urgent", label: "Urgent" },
  { id: "contract", label: "Contract" },
  { id: "meeting", label: "Meeting" },
  { id: "action", label: "Action" },
  { id: "general", label: "General" },
];

const categoryColors: Record<string, string> = {
  urgent: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400",
  contract: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400",
  meeting: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400",
  action: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400",
  general: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800/50 dark:text-gray-300",
};

export default function Bulletins() {
  const [filter, setFilter] = useState("all");

  const { data: announcements, isLoading } = useListAnnouncements(
    { category: filter === "all" ? undefined : filter as any },
    { query: { queryKey: getListAnnouncementsQueryKey({ category: filter === "all" ? undefined : filter as any }) } }
  );

  const urgentItems = announcements?.filter((a) => a.isUrgent) ?? [];
  const regularItems = announcements?.filter((a) => !a.isUrgent) ?? [];

  return (
    <MobileLayout>
      <div className="p-4 sm:p-5 space-y-5">
        <header>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Bulletins</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Union announcements & news</p>
        </header>

        <div className="flex overflow-x-auto no-scrollbar gap-2 pb-1 -mx-4 px-4">
          {categories.map((c) => (
            <button key={c.id} onClick={() => setFilter(c.id)}
              className={cn(
                "whitespace-nowrap px-4 py-2 rounded-full text-sm font-semibold transition-colors border shrink-0",
                filter === c.id ? "bg-foreground text-background border-foreground" : "bg-card text-muted-foreground border-border hover:bg-muted"
              )}>
              {c.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : (
          <div className="space-y-5">
            {urgentItems.length > 0 && (
              <section className="space-y-2.5">
                <p className="text-xs font-bold uppercase tracking-widest text-red-600">Urgent</p>
                {urgentItems.map((a) => (
                  <Link key={a.id} href={`/bulletins/${a.id}`}>
                    <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-xl p-4 active:opacity-80 transition-opacity">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <Bell className="w-3.5 h-3.5 text-red-600 shrink-0" />
                            <span className={cn("text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border", categoryColors[a.category])}>
                              {a.category}
                            </span>
                          </div>
                          <p className="font-bold text-foreground leading-snug line-clamp-2 text-sm">{a.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">{format(new Date(a.publishedAt), "MMM d, yyyy")}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      </div>
                    </div>
                  </Link>
                ))}
              </section>
            )}

            {regularItems.length > 0 && (
              <section className="space-y-2.5">
                {urgentItems.length > 0 && <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">All Bulletins</p>}
                {regularItems.map((a) => (
                  <Link key={a.id} href={`/bulletins/${a.id}`}>
                    <div className="bg-card border border-border rounded-xl p-4 active:opacity-80 transition-opacity">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className={cn("text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border", categoryColors[a.category])}>
                              {a.category}
                            </span>
                          </div>
                          <p className="font-semibold text-foreground leading-snug line-clamp-2 text-sm">{a.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">{format(new Date(a.publishedAt), "MMM d, yyyy")}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      </div>
                    </div>
                  </Link>
                ))}
              </section>
            )}

            {(announcements?.length ?? 0) === 0 && (
              <div className="text-center py-12 text-muted-foreground bg-card rounded-xl border border-dashed border-border">
                <Bell className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium">No bulletins posted</p>
              </div>
            )}
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
