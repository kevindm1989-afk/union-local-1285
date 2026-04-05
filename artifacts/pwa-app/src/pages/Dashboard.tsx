import { MobileLayout } from "@/components/layout/MobileLayout";
import {
  useGetDashboardSummary,
  useGetRecentActivity,
  getGetDashboardSummaryQueryKey,
  getGetRecentActivityQueryKey,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, FileText, AlertTriangle, Clock, ChevronRight, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  open: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400",
  pending_response: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400",
  pending_hearing: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400",
  resolved: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400",
  withdrawn: "bg-gray-100 text-gray-600 border-gray-200",
};

const categoryColors: Record<string, string> = {
  urgent: "bg-red-100 text-red-800 border-red-200",
  contract: "bg-blue-100 text-blue-800 border-blue-200",
  meeting: "bg-purple-100 text-purple-800 border-purple-200",
  action: "bg-orange-100 text-orange-800 border-orange-200",
  general: "bg-gray-100 text-gray-700 border-gray-200",
};

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() },
  });
  const { data: activity, isLoading: isLoadingActivity } = useGetRecentActivity({
    query: { queryKey: getGetRecentActivityQueryKey() },
  });

  return (
    <MobileLayout>
      <div className="p-5 space-y-7 animate-in fade-in slide-in-from-bottom-4 duration-400">
        <header className="mt-4 space-y-0.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            {format(new Date(), "EEEE, MMMM d")}
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            Union Local 1285
          </h1>
          <p className="text-sm text-muted-foreground">Steward Dashboard</p>
        </header>

        {/* Stats Grid */}
        <section className="grid grid-cols-2 gap-3">
          {isLoadingSummary ? (
            Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
          ) : (
            <>
              <Link href="/members">
                <div className="bg-primary text-primary-foreground rounded-xl p-4 h-24 flex flex-col justify-between relative overflow-hidden cursor-pointer active:opacity-90 transition-opacity">
                  <div className="absolute -right-3 -bottom-3 opacity-10">
                    <Users className="w-20 h-20" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider opacity-80">Members</span>
                  <div>
                    <span className="text-3xl font-black tracking-tighter">{summary?.activeMembers ?? 0}</span>
                    <span className="text-xs opacity-70 ml-1">active</span>
                  </div>
                </div>
              </Link>

              <Link href="/grievances">
                <div className="bg-card border border-border rounded-xl p-4 h-24 flex flex-col justify-between cursor-pointer active:opacity-80 transition-opacity">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <FileText className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Open</span>
                  </div>
                  <div>
                    <span className="text-3xl font-black tracking-tighter text-foreground">{summary?.openGrievances ?? 0}</span>
                    <span className="text-xs text-muted-foreground ml-1">grievances</span>
                  </div>
                </div>
              </Link>

              <div className={cn(
                "rounded-xl p-4 h-24 flex flex-col justify-between",
                (summary?.overdueGrievances ?? 0) > 0
                  ? "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30"
                  : "bg-card border border-border"
              )}>
                <div className={cn("flex items-center gap-1.5", (summary?.overdueGrievances ?? 0) > 0 ? "text-red-700 dark:text-red-400" : "text-muted-foreground")}>
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Overdue</span>
                </div>
                <span className={cn("text-3xl font-black tracking-tighter", (summary?.overdueGrievances ?? 0) > 0 ? "text-red-800 dark:text-red-400" : "text-foreground")}>
                  {summary?.overdueGrievances ?? 0}
                </span>
              </div>

              <Link href="/bulletins">
                <div className={cn(
                  "rounded-xl p-4 h-24 flex flex-col justify-between cursor-pointer active:opacity-80 transition-opacity",
                  (summary?.urgentAnnouncements ?? 0) > 0
                    ? "bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30"
                    : "bg-card border border-border"
                )}>
                  <div className={cn("flex items-center gap-1.5", (summary?.urgentAnnouncements ?? 0) > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
                    <Bell className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Urgent</span>
                  </div>
                  <div>
                    <span className={cn("text-3xl font-black tracking-tighter", (summary?.urgentAnnouncements ?? 0) > 0 ? "text-amber-800 dark:text-amber-400" : "text-foreground")}>
                      {summary?.urgentAnnouncements ?? 0}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">bulletins</span>
                  </div>
                </div>
              </Link>
            </>
          )}
        </section>

        {/* Recent Grievances */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold tracking-tight uppercase text-muted-foreground text-xs tracking-widest">Recent Grievances</h2>
            <Link href="/grievances" className="text-xs font-semibold text-primary flex items-center gap-0.5">
              View all <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-2.5">
            {isLoadingActivity ? (
              Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-[72px] rounded-xl" />)
            ) : (activity?.recentGrievances?.length ?? 0) === 0 ? (
              <div className="text-center py-8 bg-card rounded-xl border border-dashed border-border">
                <p className="text-sm text-muted-foreground">No grievances filed yet</p>
              </div>
            ) : (
              activity?.recentGrievances?.map((g) => (
                <Link key={g.id} href={`/grievances/${g.id}`}>
                  <div className="bg-card border border-border rounded-xl p-3.5 flex items-center justify-between active:bg-muted/50 transition-colors">
                    <div className="min-w-0 flex-1 mr-3">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-bold text-muted-foreground">{g.grievanceNumber}</span>
                        <span className={cn("text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border", statusColors[g.status])}>
                          {g.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-foreground truncate">{g.title}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* Recent Bulletins */}
        <section className="space-y-3 pb-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold tracking-widest uppercase text-muted-foreground">Latest Bulletins</h2>
            <Link href="/bulletins" className="text-xs font-semibold text-primary flex items-center gap-0.5">
              View all <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-2.5">
            {isLoadingActivity ? (
              Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-[72px] rounded-xl" />)
            ) : (activity?.recentAnnouncements?.length ?? 0) === 0 ? (
              <div className="text-center py-8 bg-card rounded-xl border border-dashed border-border">
                <p className="text-sm text-muted-foreground">No bulletins posted</p>
              </div>
            ) : (
              activity?.recentAnnouncements?.map((a) => (
                <Link key={a.id} href={`/bulletins/${a.id}`}>
                  <div className="bg-card border border-border rounded-xl p-3.5 active:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn("text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border", categoryColors[a.category])}>
                            {a.category}
                          </span>
                          {a.isUrgent && <span className="text-[9px] font-bold text-red-600 uppercase">Urgent</span>}
                        </div>
                        <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{a.title}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </MobileLayout>
  );
}
