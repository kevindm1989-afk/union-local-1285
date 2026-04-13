import { useState } from "react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  AlertTriangle, ChevronDown, ChevronUp, Filter, X,
  MessageSquareWarning, CheckCircle2, ArrowUpRight,
  StickyNote, Link2, Trash2, ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Complaint {
  id: number;
  memberId: number | null;
  memberName: string | null;
  description: string;
  category: string;
  occurredDate: string;
  affectedScope: string;
  severity: string;
  status: string;
  linkedGrievanceId: number | null;
  aiCategory: string | null;
  aiRecommendation: string | null;
  aiExplanation: string | null;
  aiPatternFlag: boolean | null;
  stewardNotes: string | null;
  createdAt: string;
}

interface Pattern {
  category: string;
  count: number;
  isPattern: boolean;
}

interface PatternsData {
  patterns: Pattern[];
  all: Pattern[];
  windowDays: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  scheduling: "Scheduling", discipline: "Discipline", overtime: "Overtime",
  benefits: "Benefits", seniority: "Seniority", working_conditions: "Working Conditions",
  harassment: "Harassment", other: "Other",
};

const SEVERITY_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  serious: { label: "Serious", color: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400", dot: "bg-red-500" },
  ongoing: { label: "Ongoing Problem", color: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400", dot: "bg-amber-500" },
  minor: { label: "Minor", color: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800/50 dark:text-gray-300", dot: "bg-gray-400" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  open: { label: "Open", color: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400" },
  monitoring: { label: "Monitoring", color: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400" },
  resolved: { label: "Resolved", color: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400" },
  escalated: { label: "Escalated", color: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400" },
};

const REC_CONFIG: Record<string, { label: string; color: string }> = {
  monitor: { label: "Monitor Only", color: "text-gray-600" },
  raise_informally: { label: "Raise Informally", color: "text-amber-600" },
  file_grievance: { label: "File Grievance", color: "text-red-600" },
};

const SCOPE_LABELS: Record<string, string> = {
  just_me: "Just me", multiple_members: "Multiple members",
  entire_shift: "Entire shift", entire_department: "Entire department",
};

// ─── Complaint Card ─────────────────────────────────────────────────────────────

function ComplaintCard({ complaint, onUpdate, onDelete }: {
  complaint: Complaint;
  onUpdate: (id: number, data: Record<string, unknown>) => void;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(complaint.stewardNotes ?? "");
  const [status, setStatus] = useState(complaint.status);

  const sev = SEVERITY_CONFIG[complaint.severity] ?? SEVERITY_CONFIG.minor;
  const stat = STATUS_CONFIG[status] ?? STATUS_CONFIG.open;
  const rec = REC_CONFIG[complaint.aiRecommendation ?? "monitor"];

  const grievanceParams = new URLSearchParams({
    prefill_title: `Grievance re: ${CATEGORY_LABELS[complaint.category] ?? complaint.category} issue`,
    prefill_description: complaint.description.slice(0, 1000),
    prefill_type: complaint.category,
    prefill_incident: complaint.occurredDate,
    complaint_id: String(complaint.id),
  });

  return (
    <div className={cn(
      "bg-card border rounded-xl overflow-hidden transition-all",
      complaint.aiPatternFlag ? "border-red-300 dark:border-red-800" : "border-border"
    )}>
      <button className="w-full flex items-start gap-3 px-4 py-3.5 text-left" onClick={() => setExpanded(v => !v)}>
        <div className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", sev.dot)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border", sev.color)}>
              {sev.label}
            </span>
            <span className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border", stat.color)}>
              {stat.label}
            </span>
            {complaint.aiPatternFlag && (
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 flex items-center gap-0.5">
                <AlertTriangle className="w-2.5 h-2.5" /> Pattern
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
            {complaint.description}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {CATEGORY_LABELS[complaint.category] ?? complaint.category}
            {complaint.memberName ? ` · ${complaint.memberName}` : ""}
            {" · "}{format(new Date(complaint.createdAt), "MMM d, yyyy")}
          </p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
      </button>

      {expanded && (
        <div className="border-t border-border divide-y divide-border/60">
          {/* Full description */}
          <div className="px-4 py-3">
            <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{complaint.description}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              <p className="text-[11px] text-muted-foreground">Occurred: {complaint.occurredDate}</p>
              <p className="text-[11px] text-muted-foreground">Scope: {SCOPE_LABELS[complaint.affectedScope] ?? complaint.affectedScope}</p>
            </div>
          </div>

          {/* AI Analysis */}
          {complaint.aiExplanation && (
            <div className="px-4 py-3 bg-muted/30">
              <div className="flex items-center gap-1.5 mb-1.5">
                <MessageSquareWarning className="w-3.5 h-3.5 text-primary" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">AI Recommendation</p>
                {rec && <span className={cn("text-[10px] font-bold ml-auto", rec.color)}>{rec.label}</span>}
              </div>
              <p className="text-xs text-foreground leading-relaxed">{complaint.aiExplanation}</p>
              <p className="text-[10px] text-muted-foreground italic mt-1.5">
                This analysis is to assist the steward. The steward makes all final decisions.
              </p>
            </div>
          )}

          {/* Steward notes */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <StickyNote className="w-3 h-3" /> Steward Notes
              </p>
              {!editingNotes && (
                <button onClick={() => setEditingNotes(true)} className="text-[10px] font-bold text-primary uppercase">Edit</button>
              )}
            </div>
            {editingNotes ? (
              <div className="space-y-2">
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add private steward notes…"
                  className="w-full text-xs bg-background border border-border rounded-lg p-2.5 min-h-[80px] focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
                <div className="flex gap-2">
                  <button onClick={() => { onUpdate(complaint.id, { stewardNotes: notes }); setEditingNotes(false); }}
                    className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold">Save</button>
                  <button onClick={() => { setNotes(complaint.stewardNotes ?? ""); setEditingNotes(false); }}
                    className="px-3 py-2 rounded-xl bg-muted text-xs font-bold">Cancel</button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">{notes || "No steward notes yet"}</p>
            )}
          </div>

          {/* Status update + actions */}
          <div className="px-4 py-3 space-y-2.5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Update Status</p>
              <div className="flex flex-wrap gap-1.5">
                {(["open", "monitoring", "resolved", "escalated"] as const).map(s => (
                  <button key={s} onClick={() => { setStatus(s); onUpdate(complaint.id, { status: s }); }}
                    className={cn(
                      "text-[10px] font-bold uppercase px-2.5 py-1.5 rounded-lg border transition-colors",
                      status === s ? "bg-foreground text-background border-foreground" : "bg-muted border-border text-muted-foreground"
                    )}>
                    {STATUS_CONFIG[s].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {complaint.aiRecommendation === "file_grievance" && (
                <Link href={`/grievances/new?${grievanceParams.toString()}`} className="flex-1">
                  <div className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-600 text-white text-xs font-bold">
                    <ArrowUpRight className="w-3.5 h-3.5" /> File Grievance
                  </div>
                </Link>
              )}
              {complaint.linkedGrievanceId && (
                <Link href={`/grievances/${complaint.linkedGrievanceId}`} className="flex-1">
                  <div className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-muted text-foreground text-xs font-bold">
                    <Link2 className="w-3.5 h-3.5" /> Grievance #{complaint.linkedGrievanceId}
                  </div>
                </Link>
              )}
              <button onClick={() => onDelete(complaint.id)}
                className="p-2.5 rounded-xl bg-muted text-destructive hover:bg-destructive/10 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function Complaints() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [filterCategory, setFilterCategory] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const params = new URLSearchParams();
  if (filterCategory) params.set("category", filterCategory);
  if (filterSeverity) params.set("severity", filterSeverity);
  if (filterStatus) params.set("status", filterStatus);

  const { data: complaints, isLoading } = useQuery<Complaint[]>({
    queryKey: ["complaints", filterCategory, filterSeverity, filterStatus],
    queryFn: () => fetch(`/api/complaints?${params}`, { credentials: "include" }).then(r => r.json()),
    staleTime: 30_000,
  });

  const { data: patternsData } = useQuery<PatternsData>({
    queryKey: ["complaints-patterns"],
    queryFn: () => fetch("/api/complaints/patterns", { credentials: "include" }).then(r => r.json()),
    staleTime: 60_000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      fetch(`/api/complaints/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["complaints"] }),
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/complaints/${id}`, { method: "DELETE", credentials: "include" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["complaints"] });
      qc.invalidateQueries({ queryKey: ["complaints-patterns"] });
      toast({ title: "Complaint deleted" });
    },
  });

  const activeFilters = [filterCategory, filterSeverity, filterStatus].filter(Boolean).length;

  return (
    <MobileLayout>
      <div className="p-4 space-y-4 pb-8">
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Complaints</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Member complaint tracker</p>
          </div>
          <button onClick={() => setShowFilters(v => !v)}
            className={cn(
              "flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition-colors",
              showFilters || activeFilters > 0
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border"
            )}>
            <Filter className="w-3.5 h-3.5" />
            Filters{activeFilters > 0 ? ` (${activeFilters})` : ""}
          </button>
        </header>

        {/* Pattern Alerts */}
        {patternsData?.patterns && patternsData.patterns.length > 0 && (
          <div className="space-y-2">
            {patternsData.patterns.map(p => (
              <div key={p.category} className="flex items-start gap-2.5 bg-red-50 dark:bg-red-950/20 border border-red-300 dark:border-red-800 rounded-xl px-3.5 py-3">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-red-800 dark:text-red-300">
                    Pattern Detected — {CATEGORY_LABELS[p.category] ?? p.category}
                  </p>
                  <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                    {p.count} complaints in this category within the last 30 days
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        {showFilters && (
          <div className="bg-card border border-border rounded-xl p-3.5 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Category</p>
                <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                  className="w-full text-xs bg-background border border-border rounded-lg px-2 py-1.5 focus:outline-none">
                  <option value="">All</option>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Severity</p>
                <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}
                  className="w-full text-xs bg-background border border-border rounded-lg px-2 py-1.5 focus:outline-none">
                  <option value="">All</option>
                  <option value="serious">Serious</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="minor">Minor</option>
                </select>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Status</p>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                  className="w-full text-xs bg-background border border-border rounded-lg px-2 py-1.5 focus:outline-none">
                  <option value="">All</option>
                  <option value="open">Open</option>
                  <option value="monitoring">Monitoring</option>
                  <option value="resolved">Resolved</option>
                  <option value="escalated">Escalated</option>
                </select>
              </div>
            </div>
            {activeFilters > 0 && (
              <button onClick={() => { setFilterCategory(""); setFilterSeverity(""); setFilterStatus(""); }}
                className="flex items-center gap-1 text-xs font-bold text-destructive">
                <X className="w-3 h-3" /> Clear all filters
              </button>
            )}
          </div>
        )}

        {/* List */}
        {isLoading ? (
          <div className="space-y-2">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
        ) : !complaints?.length ? (
          <div className="text-center py-14 border border-dashed border-border rounded-xl">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-20" />
            <p className="text-sm text-muted-foreground font-medium">No complaints{activeFilters > 0 ? " matching filters" : " on file"}</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{complaints.length} complaint{complaints.length !== 1 ? "s" : ""}</p>
            {complaints.map(c => (
              <ComplaintCard key={c.id} complaint={c}
                onUpdate={(id, data) => updateMutation.mutate({ id, data })}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
            ))}
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
