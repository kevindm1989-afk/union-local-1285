import { MemberPortalLayout } from "@/components/layout/MemberPortalLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, CheckCircle2, XCircle, FileText, Calendar, ClipboardList } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type DisciplineRecord = {
  id: number;
  disciplineType: string;
  incidentDate: string;
  issuedDate: string;
  description: string;
  responseFiled: boolean;
  grievanceId: number | null;
  createdAt: string;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  verbal_warning:     { label: "Verbal Warning",      color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  written_warning:    { label: "Written Warning",     color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  suspension_paid:    { label: "Suspension (Paid)",   color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  suspension_unpaid:  { label: "Suspension (Unpaid)", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  termination:        { label: "Termination",         color: "bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200" },
  other:              { label: "Other",               color: "bg-muted text-muted-foreground" },
};

function fmt(d: string) {
  try { return format(new Date(d + "T00:00:00"), "MMM d, yyyy"); } catch { return d; }
}

export default function MemberPortalDiscipline() {
  const { data: records, isLoading, isError } = useQuery<DisciplineRecord[]>({
    queryKey: ["portal-discipline"],
    queryFn: () => fetchJson("/api/member-portal/discipline"),
  });

  return (
    <MemberPortalLayout>
      <div className="px-4 py-5 space-y-4 pb-10">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight text-foreground leading-tight">Discipline Records</h1>
            <p className="text-xs text-muted-foreground">Your official disciplinary history</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-card border border-border rounded-2xl p-4 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-5 text-center">
            <XCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
            <p className="text-sm font-semibold text-destructive">Could not load records</p>
            <p className="text-xs text-muted-foreground mt-1">Contact your steward if this persists.</p>
          </div>
        ) : !records || records.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-8 text-center">
            <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
            <p className="font-bold text-foreground">No discipline records</p>
            <p className="text-xs text-muted-foreground mt-1">You have a clean disciplinary history.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map((r) => {
              const type = TYPE_LABELS[r.disciplineType] ?? TYPE_LABELS.other;
              return (
                <div key={r.id} className="bg-card border border-border rounded-2xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className={cn("text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full", type.color)}>
                      {type.label}
                    </span>
                    {r.responseFiled ? (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-green-700 dark:text-green-400">
                        <CheckCircle2 className="w-3 h-3" /> Response Filed
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                        <XCircle className="w-3 h-3" /> No Response
                      </span>
                    )}
                  </div>

                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 shrink-0" />
                      Incident: <span className="font-semibold text-foreground ml-0.5">{fmt(r.incidentDate)}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <ClipboardList className="w-3 h-3 shrink-0" />
                      Issued: <span className="font-semibold text-foreground ml-0.5">{fmt(r.issuedDate)}</span>
                    </span>
                  </div>

                  <p className="text-sm text-foreground leading-snug">{r.description}</p>

                  {r.grievanceId && (
                    <div className="flex items-center gap-1.5 text-xs text-primary font-semibold">
                      <FileText className="w-3 h-3" />
                      Linked to Grievance #{r.grievanceId}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="bg-muted/40 border border-border rounded-xl px-4 py-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Know your rights:</strong> You have the right to union representation during any disciplinary meeting. Contact your steward if you have questions about any record shown here.
          </p>
        </div>
      </div>
    </MemberPortalLayout>
  );
}
