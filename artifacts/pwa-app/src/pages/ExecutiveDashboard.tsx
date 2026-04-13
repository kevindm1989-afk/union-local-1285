import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MobileLayout } from "@/components/layout/MobileLayout";
import {
  AlertTriangle, CheckCircle2, TrendingUp, Users, FileText, Bell,
  Scale, Vote, RefreshCw, ChevronRight, Loader2, XCircle, Shield,
  LayoutDashboard, Gavel, MessageSquareWarning, Calendar, Plus
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { format, parseISO, differenceInDays } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardData {
  grievances: {
    totalOpen: number;
    byStatus: Record<string, number>;
    byStep: { step: number; count: number }[];
    deadlinesIn7Days: number;
    overdue: number;
    closedRatio: Record<string, number>;
  };
  complaints: {
    totalOpen: number;
    patterns: { category: string; count: number }[];
    byCategory: { category: string; count: number }[];
    escalatedThisMonth: number;
  };
  members: {
    totalActive: number;
    duesInArrears: number;
    bulletinAcknowledgements: {
      id: number; title: string; publishedAt: string | null;
      category: string; ackCount: number; totalActive: number; ackRate: number;
    }[];
    lastVoteParticipation: {
      id: number; title: string; endsAt: string | null;
      votesCast: number; eligible: number; participationRate: number;
    } | null;
  };
  mobilization: {
    lastBulletin: { id: number; title: string; category: string; isUrgent: boolean; publishedAt: string | null } | null;
    activeVotes: { id: number; title: string; endsAt: string | null; votesCast: number; eligible: number }[];
    activeElections: { id: number; title: string; endsAt: string | null; status: string }[];
    strikeOrJobActionBulletins: { id: number; title: string; category: string; publishedAt: string | null }[];
  };
  seniorityDisputes: {
    thisMonth: number;
    activePatterns: { dispute_type: string; count: number }[];
    mostCommonType: string | null;
    mostCommonTypeCount: number;
  };
  upcomingDeadlines: {
    grievances: { id: number; title: string; dueDate: string; step: number; status: string; memberName: string | null; daysUntilDue: number }[];
    polls: { id: number; title: string; endsAt: string | null; votesCast: number; daysUntil: number }[];
  };
  generatedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fetchJson = (url: string) => fetch(url, { credentials: "include" }).then(async (r) => {
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
});

function capitalize(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function urgencyColor(days: number) {
  if (days < 0) return "text-red-600 dark:text-red-400";
  if (days <= 3) return "text-red-500 dark:text-red-400";
  if (days <= 7) return "text-amber-500 dark:text-amber-400";
  return "text-muted-foreground";
}

function urgencyBg(days: number) {
  if (days < 0) return "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800";
  if (days <= 3) return "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800";
  if (days <= 7) return "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800";
  return "bg-card border-border";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, icon: Icon, iconColor, children, accentColor }: {
  title: string; icon: React.ElementType; iconColor: string;
  children: React.ReactNode; accentColor?: string;
}) {
  return (
    <div className={cn(
      "bg-card rounded-2xl border border-border overflow-hidden",
      accentColor ? `border-l-[3px] ${accentColor}` : ""
    )}>
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/60 bg-muted/20">
        <Icon className={cn("w-4 h-4 flex-shrink-0", iconColor)} />
        <span className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function StatRow({ label, value, valueClass, sublabel }: {
  label: string; value: string | number; valueClass?: string; sublabel?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1">
      <span className="text-xs text-muted-foreground leading-tight">{label}</span>
      <div className="text-right">
        <span className={cn("text-sm font-bold tabular-nums", valueClass ?? "text-foreground")}>{value}</span>
        {sublabel && <p className="text-[10px] text-muted-foreground">{sublabel}</p>}
      </div>
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={cn("inline-block w-2 h-2 rounded-full flex-shrink-0", ok ? "bg-green-500" : "bg-red-500")} />;
}

function AckBar({ rate }: { rate: number }) {
  const color = rate >= 75 ? "bg-green-500" : rate >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${rate}%` }} />
      </div>
      <span className="text-xs font-bold tabular-nums w-8 text-right">{rate}%</span>
    </div>
  );
}

function AlertBanner({ children, severity = "warning" }: { children: React.ReactNode; severity?: "warning" | "danger" | "info" }) {
  const cfg = {
    danger:  "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400",
    warning: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400",
    info:    "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400",
  }[severity];
  const Icon = severity === "danger" ? XCircle : AlertTriangle;
  return (
    <div className={cn("flex items-start gap-2 rounded-xl border px-3 py-2 text-xs", cfg)}>
      <Icon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-3">
      {Array(6).fill(0).map((_, i) => (
        <div key={i} className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border/60 bg-muted/20">
            <Skeleton className="h-4 w-36 rounded-lg" />
          </div>
          <div className="p-4 space-y-3">
            <Skeleton className="h-3 w-full rounded" />
            <Skeleton className="h-3 w-4/5 rounded" />
            <Skeleton className="h-3 w-3/5 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ExecutiveDashboard() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const { data, isLoading, error, isFetching, dataUpdatedAt } = useQuery<DashboardData>({
    queryKey: ["executive-dashboard"],
    queryFn: () => fetchJson("/api/executive-dashboard"),
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
  });

  const handleRefresh = () => queryClient.invalidateQueries({ queryKey: ["executive-dashboard"] });

  const lastUpdated = dataUpdatedAt ? format(new Date(dataUpdatedAt), "h:mm a") : null;

  return (
    <MobileLayout>
      <div className="min-h-full flex flex-col bg-background">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 h-14 flex items-center gap-3">
          <LayoutDashboard className="w-5 h-5 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-bold tracking-tight text-sm uppercase leading-none">Executive Dashboard</p>
            {lastUpdated && !isFetching && (
              <p className="text-[10px] text-muted-foreground mt-0.5">Updated {lastUpdated}</p>
            )}
            {isFetching && (
              <p className="text-[10px] text-primary mt-0.5 flex items-center gap-1">
                <Loader2 className="w-2.5 h-2.5 animate-spin" /> Refreshing…
              </p>
            )}
          </div>
          <button
            onClick={handleRefresh}
            disabled={isFetching}
            className="p-2 rounded-xl hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40"
            aria-label="Refresh"
          >
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          </button>
        </header>

        <div className="p-4 pb-10 space-y-3">
          {isLoading ? <DashboardSkeleton /> : error ? (
            <div className="text-center py-16">
              <XCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
              <p className="text-sm font-semibold text-foreground">Could not load dashboard</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">Check your connection and try refreshing</p>
              <Button variant="outline" onClick={handleRefresh} size="sm" className="gap-2 rounded-xl">
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </Button>
            </div>
          ) : data ? (
            <>
              {/* ── Critical alerts ──────────────────────────────────── */}
              {(data.grievances.overdue > 0 || data.mobilization.strikeOrJobActionBulletins.length > 0 || data.seniorityDisputes.activePatterns.length > 0) && (
                <div className="space-y-2">
                  {data.mobilization.strikeOrJobActionBulletins.map((b) => (
                    <AlertBanner key={b.id} severity="danger">
                      <strong>Active {capitalize(b.category)}:</strong> {b.title}
                    </AlertBanner>
                  ))}
                  {data.grievances.overdue > 0 && (
                    <AlertBanner severity="danger">
                      <strong>{data.grievances.overdue} grievance{data.grievances.overdue > 1 ? "s" : ""} past deadline</strong> — immediate action required
                    </AlertBanner>
                  )}
                  {data.seniorityDisputes.activePatterns.map((p) => (
                    <AlertBanner key={p.type} severity="warning">
                      <strong>Seniority pattern:</strong> {p.count} {capitalize(p.dispute_type)} disputes in 60 days
                    </AlertBanner>
                  ))}
                  {data.complaints.patterns.map((p) => (
                    <AlertBanner key={p.category} severity="warning">
                      <strong>Complaint pattern:</strong> {p.count} {capitalize(p.category)} complaints in 30 days
                    </AlertBanner>
                  ))}
                </div>
              )}

              {/* ── 1. Grievance Summary ──────────────────────────────── */}
              <SectionCard title="Grievances" icon={FileText} iconColor="text-blue-500" accentColor="border-l-blue-400">
                <div className="space-y-1 divide-y divide-border/40">
                  <StatRow
                    label="Total open"
                    value={data.grievances.totalOpen}
                    valueClass={data.grievances.totalOpen > 0 ? "text-blue-600 dark:text-blue-400" : "text-green-600"}
                  />
                  {data.grievances.byStep.map((s) => (
                    <StatRow
                      key={s.step}
                      label={`Step ${s.step}`}
                      value={s.count}
                    />
                  ))}
                  <StatRow
                    label="Deadlines this week"
                    value={data.grievances.deadlinesIn7Days}
                    valueClass={data.grievances.deadlinesIn7Days > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}
                  />
                  <StatRow
                    label="Overdue"
                    value={data.grievances.overdue}
                    valueClass={data.grievances.overdue > 0 ? "text-red-600 dark:text-red-400 font-black" : "text-green-600"}
                  />
                  {Object.keys(data.grievances.closedRatio).length > 0 && (
                    <div className="pt-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Closed outcomes</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(data.grievances.closedRatio).map(([outcome, count]) => (
                          <span key={outcome} className={cn(
                            "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                            outcome === "won" ? "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800" :
                            outcome === "lost" ? "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800" :
                            "bg-muted text-muted-foreground border-border"
                          )}>
                            {capitalize(outcome)}: {count}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* ── 2. Complaint Summary ──────────────────────────────── */}
              <SectionCard title="Member Complaints" icon={MessageSquareWarning} iconColor="text-orange-500" accentColor="border-l-orange-400">
                <div className="space-y-1 divide-y divide-border/40">
                  <StatRow
                    label="Total open"
                    value={data.complaints.totalOpen}
                    valueClass={data.complaints.totalOpen > 0 ? "text-orange-600 dark:text-orange-400" : "text-green-600"}
                  />
                  <StatRow
                    label="Pattern flags (30 days)"
                    value={data.complaints.patterns.length}
                    valueClass={data.complaints.patterns.length > 0 ? "text-red-600 dark:text-red-400" : "text-green-600"}
                  />
                  <StatRow
                    label="Escalated to grievances this month"
                    value={data.complaints.escalatedThisMonth}
                    valueClass={data.complaints.escalatedThisMonth > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}
                  />
                  {data.complaints.byCategory.length > 0 && (
                    <div className="pt-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Open by category</p>
                      <div className="space-y-1">
                        {data.complaints.byCategory.slice(0, 4).map((c) => (
                          <div key={c.category} className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{capitalize(c.category)}</span>
                            <span className="text-xs font-bold">{c.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* ── 3. Member Engagement ─────────────────────────────── */}
              <SectionCard title="Member Engagement" icon={Users} iconColor="text-emerald-500" accentColor="border-l-emerald-400">
                <div className="space-y-1 divide-y divide-border/40">
                  <StatRow
                    label="Active members"
                    value={data.members.totalActive}
                    valueClass="text-emerald-600 dark:text-emerald-400"
                  />
                  <StatRow
                    label="Dues in arrears"
                    value={data.members.duesInArrears}
                    valueClass={data.members.duesInArrears > 0 ? "text-red-600 dark:text-red-400" : "text-green-600"}
                  />
                  {data.members.bulletinAcknowledgements.length > 0 && (
                    <div className="pt-1 space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Bulletin acknowledgement (last 3)</p>
                      {data.members.bulletinAcknowledgements.map((b) => (
                        <div key={b.id} className="space-y-1">
                          <p className="text-xs text-foreground font-medium truncate">{b.title}</p>
                          <AckBar rate={b.ackRate} />
                        </div>
                      ))}
                    </div>
                  )}
                  {data.members.lastVoteParticipation && (
                    <div className="pt-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Last vote participation</p>
                      <p className="text-xs text-muted-foreground truncate mb-1.5">{data.members.lastVoteParticipation.title}</p>
                      <AckBar rate={data.members.lastVoteParticipation.participationRate} />
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {data.members.lastVoteParticipation.votesCast} of {data.members.lastVoteParticipation.eligible} eligible
                      </p>
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* ── 4. Mobilization Readiness ─────────────────────────── */}
              <SectionCard title="Mobilization Readiness" icon={Bell} iconColor="text-violet-500" accentColor="border-l-violet-400">
                <div className="space-y-2">
                  {data.mobilization.lastBulletin ? (
                    <div className="flex items-start gap-2">
                      <StatusDot ok={true} />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{data.mobilization.lastBulletin.title}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {data.mobilization.lastBulletin.publishedAt
                            ? format(parseISO(data.mobilization.lastBulletin.publishedAt), "MMM d, yyyy")
                            : "—"}
                          {" · "}{capitalize(data.mobilization.lastBulletin.category)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No bulletins posted yet</p>
                  )}

                  {data.mobilization.activeVotes.length > 0 && (
                    <div className="pt-1 border-t border-border/40 space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Live votes</p>
                      {data.mobilization.activeVotes.map((v) => (
                        <div key={v.id} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Vote className="w-3 h-3 text-violet-500 flex-shrink-0" />
                            <span className="text-xs text-foreground truncate">{v.title}</span>
                          </div>
                          <span className="text-xs font-bold text-violet-600 dark:text-violet-400 flex-shrink-0">{v.votesCast} votes</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {data.mobilization.activeElections.length > 0 && (
                    <div className="pt-1 border-t border-border/40 space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Active elections</p>
                      {data.mobilization.activeElections.map((e) => (
                        <div key={e.id} className="flex items-center justify-between gap-2">
                          <span className="text-xs text-foreground truncate">{e.title}</span>
                          <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800 font-bold uppercase px-1.5 py-0.5 rounded-full flex-shrink-0">
                            {capitalize(e.status)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {data.mobilization.strikeOrJobActionBulletins.length > 0 && (
                    <div className="pt-1 border-t border-red-200 dark:border-red-800 space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">Active action bulletins</p>
                      {data.mobilization.strikeOrJobActionBulletins.map((b) => (
                        <div key={b.id} className="flex items-center gap-1.5">
                          <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" />
                          <span className="text-xs font-semibold text-red-700 dark:text-red-400 truncate">{b.title}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {data.mobilization.activeVotes.length === 0 && data.mobilization.activeElections.length === 0 && data.mobilization.strikeOrJobActionBulletins.length === 0 && (
                    <div className="flex items-center gap-1.5 pt-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                      <span className="text-xs text-green-600 dark:text-green-400">No active actions or votes</span>
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* ── 5. Seniority Disputes ─────────────────────────────── */}
              <SectionCard title="Seniority Disputes" icon={Gavel} iconColor="text-amber-500" accentColor="border-l-amber-400">
                <div className="space-y-1 divide-y divide-border/40">
                  <StatRow
                    label="Disputes this month"
                    value={data.seniorityDisputes.thisMonth}
                    valueClass={data.seniorityDisputes.thisMonth > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}
                  />
                  <StatRow
                    label="Active patterns (60 days)"
                    value={data.seniorityDisputes.activePatterns.length}
                    valueClass={data.seniorityDisputes.activePatterns.length > 0 ? "text-red-600 dark:text-red-400" : "text-green-600"}
                  />
                  {data.seniorityDisputes.mostCommonType && (
                    <StatRow
                      label="Most common type"
                      value={`${capitalize(data.seniorityDisputes.mostCommonType)} (${data.seniorityDisputes.mostCommonTypeCount})`}
                    />
                  )}
                  {data.seniorityDisputes.activePatterns.length > 0 && (
                    <div className="pt-1 space-y-1">
                      {data.seniorityDisputes.activePatterns.map((p) => (
                        <div key={p.dispute_type} className="flex items-center gap-1.5">
                          <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" />
                          <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                            {capitalize(p.dispute_type)}: {p.count} in 60 days
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* ── 6. Upcoming Deadlines ──────────────────────────────── */}
              <SectionCard title="Upcoming Deadlines" icon={Calendar} iconColor="text-rose-500" accentColor="border-l-rose-400">
                {data.upcomingDeadlines.grievances.length === 0 && data.upcomingDeadlines.polls.length === 0 ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-xs text-green-600 dark:text-green-400">No upcoming deadlines</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.upcomingDeadlines.grievances.map((g) => (
                      <Link
                        key={g.id}
                        href={`/grievances/${g.id}`}
                        className={cn(
                          "flex items-start gap-3 p-2.5 rounded-xl border transition-colors hover:opacity-80",
                          urgencyBg(g.daysUntilDue)
                        )}
                      >
                        <FileText className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground leading-tight truncate">{g.title}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Step {g.step} · {g.memberName ?? "—"}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={cn("text-xs font-black", urgencyColor(g.daysUntilDue))}>
                            {g.daysUntilDue < 0 ? `${Math.abs(g.daysUntilDue)}d overdue` :
                             g.daysUntilDue === 0 ? "Today" :
                             `${g.daysUntilDue}d`}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {g.dueDate ? format(parseISO(g.dueDate), "MMM d") : "—"}
                          </p>
                        </div>
                      </Link>
                    ))}

                    {data.upcomingDeadlines.polls.length > 0 && (
                      <div className="pt-1 border-t border-border/40 space-y-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Vote closings</p>
                        {data.upcomingDeadlines.polls.map((p) => (
                          <Link key={p.id} href="/polls" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                            <Vote className="w-3 h-3 text-violet-500 flex-shrink-0" />
                            <span className="text-xs text-foreground flex-1 truncate">{p.title}</span>
                            <span className={cn("text-xs font-bold flex-shrink-0", p.daysUntil <= 1 ? "text-red-600" : p.daysUntil <= 3 ? "text-amber-600" : "text-muted-foreground")}>
                              {p.daysUntil === 0 ? "Today" : `${p.daysUntil}d`}
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </SectionCard>

              {/* ── 7. Quick Actions ──────────────────────────────────── */}
              <div className="bg-card rounded-2xl border border-border overflow-hidden">
                <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/60 bg-muted/20">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground">Quick Actions</span>
                </div>
                <div className="p-3 grid grid-cols-2 gap-2">
                  {[
                    { label: "File Grievance", href: "/grievances/new", icon: FileText, color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800" },
                    { label: "Post Bulletin", href: "/bulletins/new", icon: Bell, color: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800" },
                    { label: "Launch Vote", href: "/polls", icon: Vote, color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800" },
                    { label: "Seniority Tool", href: "/seniority-disputes", icon: Gavel, color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800" },
                  ].map(({ label, href, icon: Icon, color }) => (
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        "flex items-center gap-2 px-3 py-3 rounded-xl border text-xs font-bold transition-all hover:opacity-80 active:scale-95",
                        color
                      )}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </MobileLayout>
  );
}
