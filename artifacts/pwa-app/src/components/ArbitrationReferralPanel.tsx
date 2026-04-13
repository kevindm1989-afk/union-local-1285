import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, FileText, Printer, Save, Sparkles, RefreshCw,
  AlertCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface JustCauseData {
  adequateNotice: boolean;
  reasonableRule: boolean;
  investigationConducted: boolean;
  investigationFair: boolean;
  proofSufficient: boolean;
  penaltyConsistent: boolean;
  penaltyProgressive: boolean;
  notes: string | null;
}

interface AssembledData {
  grievance: {
    number: string; title: string; description: string | null;
    contractArticle: string | null; grievanceType: string | null;
    incidentDate: string | null; filedDate: string; dueDate: string | null;
    step: number; status: string; outcome: string | null;
    remedyRequested: string | null; notes: string | null;
    accommodationRequest: boolean;
  };
  member: { name: string | null; department: string | null; shift: string | null; employeeId: string | null } | null;
  activityNotes: Array<{ content: string; type: string; author: string | null; date: string }>;
  journalEntries: Array<{ content: string; type: string; author: string | null; date: string }>;
  justCause: JustCauseData | null;
  communicationLog: Array<{ method: string; summary: string; date: string; author: string | null }>;
}

interface ReferralPackage {
  grievanceId: number;
  coverSummary: string;
  assembledData: AssembledData;
  generatedAt: string;
  updatedAt: string;
}

const fetchJson = async (url: string, opts?: RequestInit) => {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
};

const JUST_CAUSE_LABELS: [keyof JustCauseData, string][] = [
  ["adequateNotice", "Adequate Notice"],
  ["reasonableRule", "Reasonable Rule"],
  ["investigationConducted", "Investigation Conducted"],
  ["investigationFair", "Investigation Fair"],
  ["proofSufficient", "Proof Sufficient"],
  ["penaltyConsistent", "Penalty Consistent"],
  ["penaltyProgressive", "Progressive Discipline"],
];

export function ArbitrationReferralPanel({
  grievanceId, grievanceNumber, step, outcome,
}: {
  grievanceId: number;
  grievanceNumber: string;
  step: number;
  outcome: string;
}) {
  const isEligible = step >= 5 || outcome === "arbitration";
  const [open, setOpen] = useState(false);
  const [editedCover, setEditedCover] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const { data: pkg, refetch, isFetching } = useQuery<ReferralPackage | null>({
    queryKey: ["referral-package", grievanceId],
    queryFn: async () => {
      const res = await fetch(`/api/grievances/${grievanceId}/referral-package`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to load package");
      return res.json();
    },
    enabled: open && !!grievanceId,
    retry: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (pkg?.coverSummary && !editedCover) {
      setEditedCover(pkg.coverSummary);
    }
  }, [pkg]);

  const generate = useMutation<ReferralPackage>({
    mutationFn: () =>
      fetchJson(`/api/grievances/${grievanceId}/referral-package`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (data) => {
      setEditedCover(data.coverSummary);
      setIsEditing(false);
      refetch();
    },
  });

  const saveCover = useMutation({
    mutationFn: () =>
      fetchJson(`/api/grievances/${grievanceId}/referral-package`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverSummary: editedCover }),
      }),
    onSuccess: () => {
      setSaveSuccess(true);
      setIsEditing(false);
      refetch();
      setTimeout(() => setSaveSuccess(false), 3000);
    },
  });

  if (!isEligible) return null;

  const data = pkg?.assembledData;
  const g = data?.grievance;
  const m = data?.member;
  const isLoading = isFetching && !pkg;

  return (
    <div className="rounded-xl border-2 border-amber-300 dark:border-amber-700 overflow-hidden bg-amber-50/40 dark:bg-amber-950/20">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-100/60 dark:hover:bg-amber-900/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            Arbitration Referral Package
          </span>
          {pkg && (
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200">
              Generated
            </span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-amber-600 dark:text-amber-400" /> : <ChevronDown className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
      </button>

      {open && (
        <div className="border-t border-amber-200 dark:border-amber-700 p-4 space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading package…</span>
            </div>
          )}

          {/* Generate / Regenerate toolbar */}
          <div className="no-print flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              {!pkg && !isLoading ? (
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    Ready to prepare arbitration referral
                  </p>
                  <p className="text-xs text-amber-700/70 dark:text-amber-400/70 mt-0.5">
                    AI will assemble the complete grievance file and draft a professional cover summary for Unifor National.
                  </p>
                </div>
              ) : pkg ? (
                <p className="text-xs text-muted-foreground">
                  Last generated {format(parseISO(pkg.generatedAt), "MMMM d, yyyy 'at' h:mm a")}
                </p>
              ) : null}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {pkg && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl gap-1.5 text-xs border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300"
                  onClick={() => window.print()}
                >
                  <Printer className="w-3 h-3" />
                  Print / PDF
                </Button>
              )}
              <Button
                size="sm"
                className="rounded-xl gap-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                disabled={generate.isPending}
                onClick={() => generate.mutate()}
              >
                {generate.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : pkg ? (
                  <RefreshCw className="w-3 h-3" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                {generate.isPending ? "Generating…" : pkg ? "Regenerate" : "Generate Package"}
              </Button>
            </div>
          </div>

          {generate.error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 dark:text-red-300">
                {(generate.error as Error).message}
              </p>
            </div>
          )}

          {pkg && data && g && (
            <div className="space-y-4 print:space-y-8" id="arbitration-print-area">

              {/* ── Print header (hidden on screen) ── */}
              <div className="hidden print:block text-center border-b-2 border-gray-800 pb-6 mb-6">
                <p className="text-xs uppercase tracking-widest text-gray-600 mb-1">Unifor Local 1285</p>
                <h1 className="text-2xl font-bold uppercase tracking-wide">Arbitration Referral Package</h1>
                <p className="text-base font-semibold mt-1">Grievance {grievanceNumber}</p>
                <p className="text-xs text-gray-500 mt-2">
                  Prepared: {format(parseISO(pkg.generatedAt), "MMMM d, yyyy")}
                </p>
              </div>

              {/* ── Section 1: Cover Summary ── */}
              <section>
                <div className="no-print flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Cover Summary — AI Drafted
                  </p>
                  {!isEditing ? (
                    <button
                      onClick={() => { setEditedCover(pkg.coverSummary); setIsEditing(true); }}
                      className="text-xs text-primary underline underline-offset-2"
                    >
                      Edit
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsEditing(false)}
                        className="text-xs text-muted-foreground underline underline-offset-2"
                      >
                        Cancel
                      </button>
                      <Button
                        size="sm"
                        className="h-7 rounded-lg text-xs gap-1"
                        disabled={saveCover.isPending}
                        onClick={() => saveCover.mutate()}
                      >
                        {saveCover.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        Save
                      </Button>
                    </div>
                  )}
                </div>
                {saveSuccess && (
                  <p className="text-xs text-green-600 dark:text-green-400 mb-2 no-print">
                    Cover summary saved successfully.
                  </p>
                )}
                {isEditing ? (
                  <Textarea
                    value={editedCover}
                    onChange={(e) => setEditedCover(e.target.value)}
                    className="min-h-[320px] rounded-xl bg-background resize-none text-sm font-mono leading-relaxed"
                  />
                ) : (
                  <div className="p-4 rounded-xl bg-white dark:bg-card border border-border text-sm text-foreground leading-relaxed whitespace-pre-wrap print:border-gray-400 print:rounded-none">
                    {pkg.coverSummary}
                  </div>
                )}
              </section>

              {/* ── Section 2: Grievance Details ── */}
              <section className="rounded-xl border border-border bg-card p-4 space-y-3 print:border-gray-400 print:rounded-none print:p-0 print:border-t print:border-b print:pt-4 print:pb-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground print:text-gray-700 print:text-sm">
                  Grievance Details
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {[
                    ["Grievance Number", g.number],
                    ["Date Filed", g.filedDate],
                    ["Incident Date", g.incidentDate ?? "—"],
                    ["Grievance Type", g.grievanceType ?? "—"],
                  ].map(([label, val]) => (
                    <div key={label}>
                      <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">{label}</p>
                      <p className="text-sm font-semibold">{val}</p>
                    </div>
                  ))}
                  <div className="col-span-2">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">CA Articles Cited</p>
                    <p className="text-sm font-semibold">{g.contractArticle ?? "—"}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Remedy Requested</p>
                    <p className="text-sm">{g.remedyRequested ?? "—"}</p>
                  </div>
                  {g.accommodationRequest && (
                    <div className="col-span-2">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                        ADA / Accommodation Request
                      </span>
                    </div>
                  )}
                </div>

                {m && (
                  <>
                    <hr className="border-border" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground print:text-gray-700">
                      Member Information
                    </h3>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                      {[
                        ["Name", m.name ?? "—"],
                        ["Department", m.department ?? "—"],
                        ["Shift", m.shift ?? "—"],
                        ["Employee ID", m.employeeId ?? "—"],
                      ].map(([label, val]) => (
                        <div key={label}>
                          <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">{label}</p>
                          <p className="text-sm font-semibold">{val}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {g.description && (
                  <>
                    <hr className="border-border" />
                    <div>
                      <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-1">Grievance Description</p>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{g.description}</p>
                    </div>
                  </>
                )}
                {g.notes && (
                  <>
                    <hr className="border-border" />
                    <div>
                      <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-1">Steward Notes</p>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{g.notes}</p>
                    </div>
                  </>
                )}
              </section>

              {/* ── Section 3: Activity Timeline ── */}
              {data.activityNotes.length > 0 && (
                <section className="rounded-xl border border-border bg-card p-4 space-y-3 print:border-gray-400 print:rounded-none print:p-0 print:border-t print:pt-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground print:text-gray-700 print:text-sm">
                    Procedural Timeline ({data.activityNotes.length} entries)
                  </h3>
                  <div className="space-y-2.5">
                    {data.activityNotes.map((n, i) => (
                      <div key={i} className="flex gap-2.5">
                        <span className={cn(
                          "text-[9px] font-bold uppercase px-1.5 py-0.5 h-fit rounded flex-shrink-0 mt-0.5",
                          n.type === "step_change" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" :
                          n.type === "status_change" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" :
                          "bg-muted text-muted-foreground"
                        )}>
                          {n.type.replace(/_/g, " ")}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground leading-snug">{n.content}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {n.author ?? "System"}
                            {n.date ? ` — ${format(new Date(n.date), "MMM d, yyyy 'at' h:mm a")}` : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Section 4: Just Cause Assessment ── */}
              {data.justCause && (
                <section className="rounded-xl border border-border bg-card p-4 space-y-2.5 print:border-gray-400 print:rounded-none print:p-0 print:border-t print:pt-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground print:text-gray-700 print:text-sm">
                    Just Cause Assessment
                  </h3>
                  <div className="grid grid-cols-2 gap-1.5">
                    {JUST_CAUSE_LABELS.map(([key, label]) => {
                      const passed = Boolean(data.justCause![key]);
                      return (
                        <div
                          key={key}
                          className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium",
                            passed
                              ? "bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300"
                              : "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300"
                          )}
                        >
                          <span className="font-bold">{passed ? "✓" : "✗"}</span>
                          {label}
                        </div>
                      );
                    })}
                  </div>
                  {data.justCause.notes && (
                    <p className="text-xs text-muted-foreground italic">{data.justCause.notes}</p>
                  )}
                </section>
              )}

              {/* ── Section 5: Communication Log ── */}
              {data.communicationLog.length > 0 && (
                <section className="rounded-xl border border-border bg-card p-4 space-y-2 print:border-gray-400 print:rounded-none print:p-0 print:border-t print:pt-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground print:text-gray-700 print:text-sm">
                    Member Contact Log ({data.communicationLog.length} entries)
                  </h3>
                  <div className="space-y-1.5">
                    {data.communicationLog.map((c, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className="font-mono text-muted-foreground flex-shrink-0 w-24">{c.date}</span>
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 h-fit rounded bg-muted text-muted-foreground flex-shrink-0">
                          {c.method?.replace(/_/g, " ")}
                        </span>
                        <span className="flex-1 text-foreground">{c.summary}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Print footer ── */}
              <div className="hidden print:block text-center border-t border-gray-400 pt-4 mt-8">
                <p className="text-xs text-gray-600 italic">
                  Prepared by Unifor Local 1285 — For review by Unifor National Representative
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
