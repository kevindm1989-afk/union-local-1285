import { useListGrievances, getListGrievancesQueryKey } from "@workspace/api-client-react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { Clock, CheckCircle, Search, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

const statuses = [
  { id: "all", label: "All" },
  { id: "member_requested", label: "Requested" },
  { id: "open", label: "Open" },
  { id: "pending_response", label: "Awaiting Response" },
  { id: "pending_hearing", label: "Awaiting Hearing" },
  { id: "resolved", label: "Resolved" },
  { id: "withdrawn", label: "Withdrawn" },
];

export default function Grievances() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: grievances, isLoading } = useListGrievances(
    { status: filter === "all" ? undefined : filter as any },
    { query: { queryKey: getListGrievancesQueryKey({ status: filter === "all" ? undefined : filter as any }) } }
  );

  const filtered = useMemo(() => {
    if (!grievances) return [];
    const q = search.trim().toLowerCase();
    if (!q) return grievances;
    return grievances.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.grievanceNumber.toLowerCase().includes(q) ||
        (g.memberName ?? "").toLowerCase().includes(q) ||
        (g.contractArticle ?? "").toLowerCase().includes(q),
    );
  }, [grievances, search]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'member_requested': return 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-800';
      case 'open': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800';
      case 'pending_response': return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800';
      case 'pending_hearing': return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800';
      case 'resolved': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
      case 'withdrawn': return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800/50 dark:text-gray-400 dark:border-gray-700';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <MobileLayout>
      <div className="p-4 sm:p-6 space-y-4">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Grievances</h1>
          <p className="text-muted-foreground mt-1">Active disputes & history</p>
        </header>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, number, or member…"
            className="w-full h-11 rounded-xl border border-border bg-card pl-9 pr-9 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Scroll */}
        <div className="flex overflow-x-auto no-scrollbar gap-2 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          {statuses.map((s) => (
            <button
              key={s.id}
              onClick={() => setFilter(s.id)}
              className={cn(
                "whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-colors border",
                filter === s.id
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card text-muted-foreground border-border hover:bg-muted"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {isLoading ? (
            Array(4).fill(0).map((_, i) => (
              <Card key={i} className="shadow-sm">
                <CardContent className="p-4 space-y-3">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                  <div className="flex justify-between mt-4">
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                </CardContent>
              </Card>
            ))
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-20 text-green-500" />
              <p className="text-sm">{search ? `No results for "${search}"` : "No grievances found in this view"}</p>
            </div>
          ) : (
            filtered.map((g) => (
              <Link key={g.id} href={`/grievances/${g.id}`} className="block transition-transform active:scale-[0.98]">
                <Card className="shadow-sm border-border hover:border-primary/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-bold text-muted-foreground">{g.grievanceNumber}</span>
                      <span className={cn("text-[10px] uppercase font-bold px-2 py-0.5 rounded-sm border", getStatusColor(g.status))}>
                        {g.status.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <h3 className="font-semibold text-foreground text-lg leading-tight mb-1">{g.title}</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {g.memberName ? `Member: ${g.memberName}` : "General Grievance"}
                    </p>

                    <div className="flex items-center justify-between pt-3 border-t border-border/50 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 font-medium bg-muted px-2 py-1 rounded">
                          {g.step === 5 ? "Arbitration" : `Step ${g.step}`}
                        </span>
                        {g.isOverdue && (
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-sm border bg-red-50 text-red-700 border-red-200">
                            Overdue
                          </span>
                        )}
                        {g.accommodationRequest && (
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-sm border bg-blue-50 text-blue-700 border-blue-200">
                            ADA
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-0.5">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          Filed {format(new Date(g.filedDate), 'MMM d')}
                        </span>
                        {g.dueDate && (
                          <span className={g.isOverdue ? "text-red-600 font-medium" : ""}>
                            Due {format(new Date(g.dueDate), 'MMM d')}
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>
        {search && filtered.length > 0 && (
          <p className="text-xs text-center text-muted-foreground pb-2">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""} for "{search}"
          </p>
        )}
      </div>
    </MobileLayout>
  );
}
