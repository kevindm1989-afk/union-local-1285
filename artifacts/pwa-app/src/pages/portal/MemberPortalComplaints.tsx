import { useState } from "react";
import { MemberPortalLayout } from "@/components/layout/MemberPortalLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Plus, X, ChevronDown, ChevronUp, AlertTriangle,
  CheckCircle2, Clock, ArrowUpRight, Sparkles, MessageSquare,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Complaint {
  id: number;
  description: string;
  category: string;
  occurredDate: string;
  affectedScope: string;
  severity: string;
  status: string;
  linkedGrievanceId: number | null;
  aiRecommendation: string | null;
  aiPatternFlag: boolean | null;
  createdAt: string;
}

interface AiResult {
  confirmedCategory: string;
  recommendation: string;
  explanation: string;
  patternFlag: boolean;
  patternCount: number;
  disclaimer: string;
}

interface SubmitResponse {
  complaint: Complaint;
  aiResult: AiResult;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "scheduling", label: "Scheduling" },
  { value: "discipline", label: "Discipline" },
  { value: "overtime", label: "Overtime" },
  { value: "benefits", label: "Benefits" },
  { value: "seniority", label: "Seniority" },
  { value: "working_conditions", label: "Working Conditions" },
  { value: "harassment", label: "Harassment" },
  { value: "other", label: "Other" },
];

const SEVERITIES = [
  { value: "minor", label: "Minor annoyance" },
  { value: "ongoing", label: "Ongoing problem" },
  { value: "serious", label: "Serious issue" },
];

const SCOPES = [
  { value: "just_me", label: "Just me" },
  { value: "multiple_members", label: "Multiple members" },
  { value: "entire_shift", label: "Entire shift" },
  { value: "entire_department", label: "Entire department" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  open: { label: "Open", color: "bg-blue-100 text-blue-800 border-blue-200", icon: Clock },
  monitoring: { label: "Monitoring", color: "bg-purple-100 text-purple-800 border-purple-200", icon: Clock },
  resolved: { label: "Resolved", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
  escalated: { label: "Escalated to Grievance", color: "bg-orange-100 text-orange-800 border-orange-200", icon: ArrowUpRight },
};

const REC_CONFIG: Record<string, { label: string; desc: string; color: string }> = {
  monitor: {
    label: "Monitor Only",
    desc: "Your steward will keep an eye on this issue.",
    color: "bg-gray-50 border-gray-200 dark:bg-gray-800/30",
  },
  raise_informally: {
    label: "Raise Informally with Management",
    desc: "Your steward may approach management informally about this issue.",
    color: "bg-amber-50 border-amber-200 dark:bg-amber-900/20",
  },
  file_grievance: {
    label: "File a Grievance",
    desc: "This may be a collective agreement violation. Your steward may recommend filing a formal grievance.",
    color: "bg-red-50 border-red-200 dark:bg-red-900/20",
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  scheduling: "Scheduling", discipline: "Discipline", overtime: "Overtime",
  benefits: "Benefits", seniority: "Seniority", working_conditions: "Working Conditions",
  harassment: "Harassment", other: "Other",
};

// ─── Form ──────────────────────────────────────────────────────────────────────

function ComplaintForm({ onSubmitted }: { onSubmitted: (result: SubmitResponse) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [occurredDate, setOccurredDate] = useState("");
  const [affectedScope, setAffectedScope] = useState("");
  const [severity, setSeverity] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/complaints", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, category, occurredDate, affectedScope, severity }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Submission failed" }));
        throw new Error(err.error ?? "Submission failed");
      }
      return res.json() as Promise<SubmitResponse>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["my-complaints"] });
      onSubmitted(data);
    },
    onError: (err: Error) => {
      toast({ title: "Submission failed", description: err.message, variant: "destructive" });
    },
  });

  const valid = description.trim().length >= 10 && category && occurredDate && affectedScope && severity;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
          What happened? <span className="text-destructive">*</span>
        </label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Describe the issue in your own words…"
          className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none min-h-[100px]"
        />
        <p className="text-[10px] text-muted-foreground mt-1">Minimum 10 characters · {description.length}/5000</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
            Category <span className="text-destructive">*</span>
          </label>
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary">
            <option value="">Select…</option>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
            Date occurred <span className="text-destructive">*</span>
          </label>
          <input type="date" value={occurredDate} onChange={e => setOccurredDate(e.target.value)}
            max={new Date().toISOString().split("T")[0]}
            className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
          Who is affected? <span className="text-destructive">*</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {SCOPES.map(s => (
            <button key={s.value} onClick={() => setAffectedScope(s.value)}
              className={cn(
                "py-2 px-3 rounded-xl border text-xs font-semibold transition-colors text-left",
                affectedScope === s.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-foreground hover:bg-muted"
              )}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
          Severity <span className="text-destructive">*</span>
        </label>
        <div className="flex flex-col gap-2">
          {SEVERITIES.map(s => (
            <button key={s.value} onClick={() => setSeverity(s.value)}
              className={cn(
                "py-2.5 px-3 rounded-xl border text-xs font-semibold transition-colors text-left",
                severity === s.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-foreground hover:bg-muted"
              )}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => mutation.mutate()}
        disabled={!valid || mutation.isPending}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-50 transition-opacity"
      >
        {mutation.isPending ? (
          <>
            <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            Submitting & analysing…
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            Submit Complaint
          </>
        )}
      </button>
    </div>
  );
}

// ─── AI Result Card ─────────────────────────────────────────────────────────────

function AiResultCard({ result, complaintId, category }: { result: AiResult; complaintId: number; category: string }) {
  const rec = REC_CONFIG[result.recommendation] ?? REC_CONFIG.monitor;
  const grievanceParams = new URLSearchParams({ complaint_id: String(complaintId) });

  return (
    <div className={cn("border rounded-xl p-4 space-y-3", rec.color)}>
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <p className="text-xs font-black uppercase tracking-wider text-foreground">AI Analysis</p>
      </div>

      {result.patternFlag && (
        <div className="flex items-start gap-2 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 dark:text-red-300 font-semibold">
            Pattern detected — {result.patternCount} similar complaints in this category recently. Your steward has been alerted.
          </p>
        </div>
      )}

      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Recommendation</p>
        <p className="text-sm font-bold text-foreground">{rec.label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{rec.desc}</p>
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Analysis</p>
        <p className="text-sm text-foreground leading-relaxed">{result.explanation}</p>
      </div>

      <p className="text-[10px] text-muted-foreground italic border-t border-border/50 pt-2">{result.disclaimer}</p>

      {result.recommendation === "file_grievance" && (
        <Link href={`/portal/grievances?${grievanceParams}`}>
          <div className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-red-600 text-white text-sm font-bold mt-1">
            <ArrowUpRight className="w-4 h-4" />
            Send to Grievance Assistant
          </div>
        </Link>
      )}
    </div>
  );
}

// ─── Complaint Row ─────────────────────────────────────────────────────────────

function MyComplaintCard({ c }: { c: Complaint }) {
  const [expanded, setExpanded] = useState(false);
  const stat = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.open;
  const StatIcon = stat.icon;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button className="w-full flex items-start gap-3 px-4 py-3 text-left" onClick={() => setExpanded(v => !v)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border flex items-center gap-0.5", stat.color)}>
              <StatIcon className="w-2.5 h-2.5" />{stat.label}
            </span>
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border bg-muted text-muted-foreground border-border">
              {CATEGORY_LABELS[c.category] ?? c.category}
            </span>
          </div>
          <p className="text-sm text-foreground leading-snug line-clamp-2">{c.description}</p>
          <p className="text-[11px] text-muted-foreground mt-1">{format(new Date(c.createdAt), "MMM d, yyyy")}</p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{c.description}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <p className="text-[11px] text-muted-foreground">Occurred: {c.occurredDate}</p>
            <p className="text-[11px] text-muted-foreground">Severity: {c.severity}</p>
          </div>
          {c.linkedGrievanceId && (
            <Link href={`/portal/grievances`}>
              <div className="flex items-center gap-1.5 text-xs font-bold text-primary mt-1">
                <ArrowUpRight className="w-3.5 h-3.5" /> Linked to a grievance
              </div>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function MemberPortalComplaints() {
  const [showForm, setShowForm] = useState(false);
  const [lastResult, setLastResult] = useState<SubmitResponse | null>(null);

  const { data: complaints, isLoading } = useQuery<Complaint[]>({
    queryKey: ["my-complaints"],
    queryFn: () => fetch("/api/complaints", { credentials: "include" }).then(r => r.json()),
    staleTime: 30_000,
  });

  function handleSubmitted(result: SubmitResponse) {
    setLastResult(result);
    setShowForm(false);
  }

  return (
    <MemberPortalLayout>
      <div className="p-4 space-y-4 pb-8">
        <header>
          <h1 className="text-2xl font-extrabold tracking-tight">My Complaints</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Report a workplace issue to your steward</p>
        </header>

        {/* Info banner */}
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/30 rounded-xl px-3.5 py-3">
          <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
            <strong>Privacy:</strong> Only your steward can see your complaints. Other members cannot view your information.
          </p>
        </div>

        {/* AI result from last submission */}
        {lastResult && (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Latest Submission Result</p>
            <AiResultCard
              result={lastResult.aiResult}
              complaintId={lastResult.complaint.id}
              category={lastResult.complaint.category}
            />
            <button onClick={() => setLastResult(null)}
              className="w-full py-2 text-xs text-muted-foreground font-semibold">
              Dismiss
            </button>
          </div>
        )}

        {/* Submit button / form */}
        {!showForm ? (
          <button onClick={() => setShowForm(true)}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-primary/30 text-primary font-bold text-sm hover:bg-primary/5 transition-colors">
            <Plus className="w-4 h-4" />
            Report a New Issue
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">New Complaint</p>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <ComplaintForm onSubmitted={handleSubmitted} />
          </div>
        )}

        {/* My complaints */}
        <section className="space-y-2.5">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">My Submitted Complaints</p>

          {isLoading ? (
            <div className="space-y-2">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : !complaints?.length ? (
            <div className="text-center py-10 border border-dashed border-border rounded-xl">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-20" />
              <p className="text-sm text-muted-foreground">No complaints submitted yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {complaints.map(c => <MyComplaintCard key={c.id} c={c} />)}
            </div>
          )}
        </section>
      </div>
    </MemberPortalLayout>
  );
}
