import { useState } from "react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useLocation } from "wouter";
import {
  ChevronLeft,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Scale,
  ListChecks,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DetectResult {
  severity: "Minor" | "Moderate" | "Serious" | "Critical";
  summary: string;
  articles: { number: string; title: string; explanation: string }[];
  nextSteps: "Informal Resolution" | "File Grievance" | "Escalate Immediately";
  nextStepsRationale: string;
  esaImplicated: boolean;
  esaDetails: string | null;
  uniforPolicyImplicated: boolean;
  uniforPolicyDetails: string | null;
}

const SEVERITY_CONFIG = {
  Minor: {
    label: "Minor",
    bg: "bg-green-50 dark:bg-green-950/20",
    border: "border-green-200 dark:border-green-900/40",
    badge: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
    icon: "text-green-600 dark:text-green-400",
    bar: "bg-green-500",
  },
  Moderate: {
    label: "Moderate",
    bg: "bg-yellow-50 dark:bg-yellow-950/20",
    border: "border-yellow-200 dark:border-yellow-900/40",
    badge: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800",
    icon: "text-yellow-600 dark:text-yellow-400",
    bar: "bg-yellow-400",
  },
  Serious: {
    label: "Serious",
    bg: "bg-orange-50 dark:bg-orange-950/20",
    border: "border-orange-200 dark:border-orange-900/40",
    badge: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800",
    icon: "text-orange-600 dark:text-orange-400",
    bar: "bg-orange-500",
  },
  Critical: {
    label: "Critical",
    bg: "bg-red-50 dark:bg-red-950/20",
    border: "border-red-200 dark:border-red-900/40",
    badge: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
    icon: "text-red-600 dark:text-red-400",
    bar: "bg-red-500",
  },
};

const NEXT_STEPS_CONFIG = {
  "Informal Resolution": {
    icon: CheckCircle2,
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900/40",
  },
  "File Grievance": {
    icon: Scale,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/40",
  },
  "Escalate Immediately": {
    icon: AlertTriangle,
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40",
  },
};

function ArticleCard({ article }: { article: DetectResult["articles"][0] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between p-3.5 text-left active:bg-muted/50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">{article.number}</span>
          <p className="text-sm font-semibold text-foreground mt-0.5">{article.title}</p>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-2" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-2" />
        )}
      </button>
      {expanded && (
        <div className="px-3.5 pb-3.5 border-t border-border">
          <p className="text-sm text-muted-foreground leading-relaxed pt-2.5">{article.explanation}</p>
        </div>
      )}
    </div>
  );
}

export default function ContractViolationDetector() {
  const [, setLocation] = useLocation();

  const [phase, setPhase] = useState<"form" | "loading" | "result">("form");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DetectResult | null>(null);

  const [form, setForm] = useState({
    whatHappened: "",
    date: "",
    affected: "",
    department: "",
  });

  const canSubmit = form.whatHappened.trim().length >= 10;

  async function handleAnalyze() {
    if (!canSubmit) return;
    setError(null);
    setPhase("loading");

    try {
      const res = await fetch("/api/grievances/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          whatHappened: form.whatHappened.trim(),
          date: form.date || undefined,
          affected: form.affected.trim() || undefined,
          department: form.department.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).error || `Request failed (${res.status})`);
      }

      const data: DetectResult = await res.json();
      setResult(data);
      setPhase("result");
    } catch (e: any) {
      setError(e.message || "Analysis failed. Please try again.");
      setPhase("form");
    }
  }

  function handleSendToGrievanceDraft() {
    if (!result) return;
    const prefill = {
      whatHappened: form.whatHappened,
      incidentDate: form.date,
      membersInvolved: form.affected,
      department: form.department,
      grievanceType: result.nextSteps === "Escalate Immediately" ? "workplace" : "",
      _fromDetector: true,
    };
    try {
      sessionStorage.setItem("grievance_prefill", JSON.stringify(prefill));
    } catch {}
    setLocation("/grievances/new");
  }

  function handleReset() {
    setPhase("form");
    setResult(null);
    setError(null);
    setForm({ whatHappened: "", date: "", affected: "", department: "" });
  }

  const sev = result ? SEVERITY_CONFIG[result.severity] : null;
  const ns = result ? NEXT_STEPS_CONFIG[result.nextSteps] : null;
  const NsIcon = ns?.icon ?? CheckCircle2;

  return (
    <MobileLayout>
      <div className="p-4 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300 pb-8">
        {/* Header */}
        <div className="flex items-center gap-3 mt-4">
          <Link href="/grievances">
            <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
          </Link>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">Violation Detector</h1>
            <p className="text-xs text-muted-foreground">AI analysis against the collective agreement</p>
          </div>
        </div>

        {/* ── PHASE: FORM ──────────────────────────────────────── */}
        {phase === "form" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="whatHappened" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                What did management do or say? <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="whatHappened"
                placeholder="Describe the situation in plain language — what happened, what was said, what action management took…"
                value={form.whatHappened}
                onChange={(e) => setForm((f) => ({ ...f, whatHappened: e.target.value }))}
                className="min-h-[130px] rounded-xl bg-card resize-none text-sm"
                required
              />
              <p className="text-[11px] text-muted-foreground">
                {form.whatHappened.trim().length} characters — minimum 10 required
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                When did it happen?
              </Label>
              <Input
                id="date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="rounded-xl bg-card h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="affected" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Who was affected?
              </Label>
              <Input
                id="affected"
                placeholder='Member name, or "General — all members"'
                value={form.affected}
                onChange={(e) => setForm((f) => ({ ...f, affected: e.target.value }))}
                className="rounded-xl bg-card h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="department" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Department / Shift
              </Label>
              <Input
                id="department"
                placeholder="e.g. Assembly Line, Days shift"
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                className="rounded-xl bg-card h-11"
              />
            </div>

            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button
              onClick={handleAnalyze}
              disabled={!canSubmit}
              className="w-full h-12 rounded-xl font-bold text-sm gap-2"
            >
              <ShieldAlert className="w-4 h-4" />
              Analyze for Contract Violations
            </Button>

            <p className="text-[11px] text-center text-muted-foreground leading-snug">
              This AI analysis is to assist the steward. It is not legal advice. Steward judgment applies.
            </p>
          </div>
        )}

        {/* ── PHASE: LOADING ───────────────────────────────────── */}
        {phase === "loading" && (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="relative">
              <ShieldAlert className="w-14 h-14 text-primary/20" />
              <Loader2 className="w-6 h-6 text-primary animate-spin absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-foreground">Analyzing against the CBA…</p>
              <p className="text-xs text-muted-foreground">Reviewing articles, Ontario ESA, and Unifor policy</p>
            </div>
          </div>
        )}

        {/* ── PHASE: RESULT ────────────────────────────────────── */}
        {phase === "result" && result && sev && ns && (
          <div className="space-y-4">
            {/* Severity Card */}
            <div className={cn("rounded-xl border p-4 space-y-3", sev.bg, sev.border)}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                    Violation Severity
                  </p>
                  <span className={cn(
                    "inline-block text-sm font-black uppercase tracking-wider px-3 py-1 rounded-lg border",
                    sev.badge
                  )}>
                    {result.severity}
                  </span>
                </div>
                <AlertTriangle className={cn("w-9 h-9 flex-shrink-0", sev.icon)} />
              </div>

              <div className="flex gap-1 h-1.5 rounded-full overflow-hidden bg-muted/40">
                {["Minor", "Moderate", "Serious", "Critical"].map((s, i) => {
                  const levels = { Minor: 1, Moderate: 2, Serious: 3, Critical: 4 };
                  const filled = levels[result.severity as keyof typeof levels] > i;
                  return (
                    <div
                      key={s}
                      className={cn("flex-1 rounded-full transition-all", filled ? sev.bar : "bg-muted/30")}
                    />
                  );
                })}
              </div>

              <p className="text-sm text-foreground/80 leading-relaxed">{result.summary}</p>
            </div>

            {/* Potentially Violated Articles */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-primary" />
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Potentially Violated Articles
                </h2>
              </div>
              {result.articles.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card p-4 text-center text-sm text-muted-foreground">
                  No specific articles identified. Situation may not constitute a violation.
                </div>
              ) : (
                <div className="space-y-2">
                  {result.articles.map((a, i) => (
                    <ArticleCard key={i} article={a} />
                  ))}
                </div>
              )}
            </div>

            {/* Recommended Next Steps */}
            <div className={cn("rounded-xl border p-4 space-y-2", ns.bg)}>
              <div className="flex items-center gap-2">
                <NsIcon className={cn("w-4 h-4", ns.color)} />
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Recommended Action
                </h2>
              </div>
              <p className={cn("text-sm font-bold", ns.color)}>{result.nextSteps}</p>
              <p className="text-sm text-foreground/80 leading-relaxed">{result.nextStepsRationale}</p>
            </div>

            {/* ESA / Unifor Policy */}
            {(result.esaImplicated || result.uniforPolicyImplicated) && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Additional Considerations
                </h2>
                {result.esaImplicated && result.esaDetails && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1">
                      Ontario Employment Standards Act
                    </p>
                    <p className="text-sm text-foreground/80 leading-relaxed">{result.esaDetails}</p>
                  </div>
                )}
                {result.uniforPolicyImplicated && result.uniforPolicyDetails && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1">
                      Unifor National Policy
                    </p>
                    <p className="text-sm text-foreground/80 leading-relaxed">{result.uniforPolicyDetails}</p>
                  </div>
                )}
              </div>
            )}

            {/* Disclaimer */}
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                This is an AI analysis to assist the steward. It is not legal advice. Steward judgment applies.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              <Button
                onClick={handleSendToGrievanceDraft}
                className="w-full h-12 rounded-xl font-bold text-sm gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Send to Grievance Draft Assistant
              </Button>

              <Button
                variant="outline"
                onClick={handleReset}
                className="w-full h-11 rounded-xl font-semibold text-sm gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Analyze Another Situation
              </Button>
            </div>
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
