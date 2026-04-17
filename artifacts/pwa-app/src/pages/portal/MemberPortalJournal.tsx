import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MemberPortalLayout } from "@/components/layout/MemberPortalLayout";
import { cn } from "@/lib/utils";
import {
  NotebookPen, Plus, ChevronDown, ChevronUp, Share2, Trash2,
  FileDown, AlertTriangle, CheckCircle2, WifiOff, Clock, X,
  Lock, PenLine, ShieldAlert, TriangleAlert,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type IncidentType = "harassment" | "denied_rights" | "scheduling" | "discipline" | "overtime" | "seniority" | "other";
type Shift = "days" | "afternoons" | "nights" | "rotating";

interface Addendum {
  id: number;
  journal_entry_id: number;
  content: string;
  created_at: string;
}

interface JournalEntry {
  id: number;
  member_id: number;
  incident_type: IncidentType;
  incident_date: string;
  incident_time: string | null;
  shift: Shift;
  location: string;
  department: string | null;
  description: string;
  persons_involved: string | null;
  management_documentation_issued: boolean;
  union_rep_present: boolean;
  steward_notified: boolean;
  attachment_url: string | null;
  urgent: boolean;
  shared: boolean;
  shared_at: string | null;
  locked: boolean;
  created_at: string;
  updated_at: string;
  addendums: Addendum[];
}

interface PendingEntry {
  tempId: string;
  createdAt: number;
  incident_type: IncidentType;
  incident_date: string;
  incident_time?: string;
  shift: Shift;
  location: string;
  department?: string;
  description: string;
  persons_involved?: string;
  management_documentation_issued: boolean;
  union_rep_present: boolean;
  steward_notified: boolean;
  urgent: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INCIDENT_LABELS: Record<IncidentType, string> = {
  harassment: "Harassment",
  denied_rights: "Denied Rights",
  scheduling: "Scheduling",
  discipline: "Discipline",
  overtime: "Overtime",
  seniority: "Seniority",
  other: "Other",
};

const INCIDENT_COLORS: Record<IncidentType, string> = {
  harassment: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  denied_rights: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  scheduling: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  discipline: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  overtime: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  seniority: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  other: "bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-300",
};

const SHIFT_LABELS: Record<Shift, string> = {
  days: "Days",
  afternoons: "Afternoons",
  nights: "Nights",
  rotating: "Rotating",
};

const SOL_DAYS = 25;

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

const IDB_NAME = "member-journal-offline";
const IDB_STORE = "pending_entries";
const IDB_VERSION = 1;

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE, { keyPath: "tempId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAll(): Promise<PendingEntry[]> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = () => resolve(req.result as PendingEntry[]);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(entry: PendingEntry): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const req = tx.objectStore(IDB_STORE).put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(tempId: string): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const req = tx.objectStore(IDB_STORE).delete(tempId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function fmtDate(d: string) {
  try {
    return new Date(d + "T00:00:00Z").toLocaleDateString("en-CA", {
      year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
    });
  } catch { return d; }
}

function fmtDateTime(d: string) {
  try {
    return new Date(d).toLocaleString("en-CA", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "UTC",
    }) + " UTC";
  } catch { return d; }
}

// ─── Create Entry Form ────────────────────────────────────────────────────────

interface EntryFormProps {
  onClose: () => void;
  onSaved: () => void;
  isOnline: boolean;
}

function EntryForm({ onClose, onSaved, isOnline }: EntryFormProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    incidentType: "" as IncidentType | "",
    incidentDate: "",
    incidentTime: "",
    shift: "" as Shift | "",
    location: "",
    department: "",
    description: "",
    personsInvolved: "",
    managementDocumentationIssued: false,
    unionRepPresent: false,
    stewardNotified: false,
    urgent: false,
  });

  const [saving, setSaving] = useState(false);
  const descLen = form.description.length;

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.incidentType || !form.incidentDate || !form.shift || !form.location || !form.description) {
      toast({ title: "Required fields missing", variant: "destructive" });
      return;
    }
    if (form.description.length < 10) {
      toast({ title: "Description too short (minimum 10 characters)", variant: "destructive" });
      return;
    }

    setSaving(true);
    const payload = {
      incidentType: form.incidentType,
      incidentDate: form.incidentDate,
      incidentTime: form.incidentTime || null,
      shift: form.shift,
      location: form.location,
      department: form.department || null,
      description: form.description,
      personsInvolved: form.personsInvolved || null,
      managementDocumentationIssued: form.managementDocumentationIssued,
      unionRepPresent: form.unionRepPresent,
      stewardNotified: form.stewardNotified,
      urgent: form.urgent,
    };

    if (!isOnline) {
      // Save to IndexedDB (snake_case to match PendingEntry / DB schema)
      const pending: PendingEntry = {
        tempId: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        createdAt: Date.now(),
        incident_type: payload.incidentType,
        incident_date: payload.incidentDate,
        incident_time: payload.incidentTime ?? undefined,
        shift: payload.shift,
        location: payload.location,
        department: payload.department ?? undefined,
        description: payload.description,
        persons_involved: payload.personsInvolved ?? undefined,
        management_documentation_issued: payload.managementDocumentationIssued,
        union_rep_present: payload.unionRepPresent,
        steward_notified: payload.stewardNotified,
        urgent: payload.urgent,
      };
      try {
        await idbPut(pending);
        toast({ title: "Saved offline — will sync when connected" });
        onSaved();
      } catch {
        toast({ title: "Failed to save offline", variant: "destructive" });
      } finally {
        setSaving(false);
      }
      return;
    }

    try {
      const res = await fetch("/api/member-journal", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Save failed");
      }
      await qc.invalidateQueries({ queryKey: ["member-journal"] });
      toast({ title: "Entry saved and locked" });
      onSaved();
    } catch (err: any) {
      toast({ title: err.message ?? "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto">
      <div className="max-w-[480px] mx-auto px-4 py-4 pb-24">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <NotebookPen className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold">New Incident Entry</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mb-3 p-2.5 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
          <div className="flex items-start gap-2">
            <Lock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
              Entries are <strong>locked immediately on save</strong> — no edits. You can add addendums after saving.
              Your journal is <strong>completely private</strong> until you choose to share it with your steward.
            </p>
          </div>
        </div>

        {!isOnline && (
          <div className="mb-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 flex items-center gap-2">
            <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <p className="text-[11px] text-amber-700 dark:text-amber-300">You're offline — entry will be saved locally and synced when you reconnect.</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Incident Type <span className="text-destructive">*</span></label>
              <select
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={form.incidentType}
                onChange={(e) => set("incidentType", e.target.value)}
                required
              >
                <option value="">Select type…</option>
                {(Object.keys(INCIDENT_LABELS) as IncidentType[]).map((t) => (
                  <option key={t} value={t}>{INCIDENT_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Shift <span className="text-destructive">*</span></label>
              <select
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={form.shift}
                onChange={(e) => set("shift", e.target.value)}
                required
              >
                <option value="">Select shift…</option>
                <option value="days">Days</option>
                <option value="afternoons">Afternoons</option>
                <option value="nights">Nights</option>
                <option value="rotating">Rotating</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Incident Date <span className="text-destructive">*</span></label>
              <input
                type="date"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={form.incidentDate}
                onChange={(e) => set("incidentDate", e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Time (optional)</label>
              <input
                type="time"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={form.incidentTime}
                onChange={(e) => set("incidentTime", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Location <span className="text-destructive">*</span></label>
              <input
                type="text"
                placeholder="e.g. Line 3, Lunchroom"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                maxLength={255}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Department</label>
              <input
                type="text"
                placeholder="Optional"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={form.department}
                onChange={(e) => set("department", e.target.value)}
                maxLength={255}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">
              Description <span className="text-destructive">*</span>
              <span className={cn("ml-1 font-normal", descLen > 1900 ? "text-destructive" : "text-muted-foreground")}>
                {descLen}/2000
              </span>
            </label>
            <textarea
              placeholder="Describe what happened, as specifically as possible. Include times, exact words used, witnesses present…"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none leading-relaxed"
              rows={5}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              maxLength={2000}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Persons Involved</label>
            <input
              type="text"
              placeholder="Management names, witness names (comma separated)"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={form.personsInvolved}
              onChange={(e) => set("personsInvolved", e.target.value)}
              maxLength={500}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold mb-0.5">Additional Details</label>
            {[
              { key: "managementDocumentationIssued", label: "Management issued written documentation" },
              { key: "unionRepPresent", label: "Union rep was present (Weingarten Rights)" },
              { key: "stewardNotified", label: "Steward has already been notified verbally" },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-border accent-primary"
                  checked={form[key as keyof typeof form] as boolean}
                  onChange={(e) => set(key, e.target.checked)}
                />
                <span className="text-xs text-foreground">{label}</span>
              </label>
            ))}
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none p-2.5 rounded-lg border border-destructive/30 bg-destructive/5">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-destructive accent-destructive"
              checked={form.urgent}
              onChange={(e) => set("urgent", e.target.checked)}
            />
            <div>
              <span className="text-xs font-semibold text-destructive">Mark as urgent</span>
              <p className="text-[10px] text-muted-foreground">When shared, your steward will receive an immediate notification.</p>
            </div>
          </label>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <Lock className="w-3.5 h-3.5" />
              {saving ? "Saving…" : "Save & Lock Entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Entry Card ───────────────────────────────────────────────────────────────

interface EntryCardProps {
  entry: JournalEntry;
  isPending?: false;
  onRefresh: () => void;
}

interface PendingCardProps {
  entry: PendingEntry;
  isPending: true;
  onSynced: () => void;
}

function EntryCard({ entry, onRefresh }: EntryCardProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [showAddendum, setShowAddendum] = useState(false);
  const [addendumText, setAddendumText] = useState("");
  const [addendumSaving, setAddendumSaving] = useState(false);
  const [shareConfirm, setShareConfirm] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const age = daysSince(entry.created_at);
  const showSolNudge = !entry.shared && age >= SOL_DAYS;

  const handleAddendum = async () => {
    if (!addendumText.trim() || addendumText.trim().length < 3) {
      toast({ title: "Addendum must be at least 3 characters", variant: "destructive" });
      return;
    }
    setAddendumSaving(true);
    try {
      const res = await fetch(`/api/member-journal/${entry.id}/addendum`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: addendumText.trim() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      await qc.invalidateQueries({ queryKey: ["member-journal"] });
      setAddendumText("");
      setShowAddendum(false);
      toast({ title: "Addendum added" });
    } catch (err: any) {
      toast({ title: err.message ?? "Failed to save addendum", variant: "destructive" });
    } finally {
      setAddendumSaving(false);
    }
  };

  const handleShare = async () => {
    setSharing(true);
    try {
      const res = await fetch(`/api/member-journal/${entry.id}/share`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      await qc.invalidateQueries({ queryKey: ["member-journal"] });
      setShareConfirm(false);
      toast({
        title: entry.urgent ? "Shared — steward notified urgently" : "Shared with your steward",
        description: "This entry is now visible to your steward in the complaint tracker.",
      });
    } catch (err: any) {
      toast({ title: err.message ?? "Share failed", variant: "destructive" });
    } finally {
      setSharing(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/member-journal/${entry.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      await qc.invalidateQueries({ queryKey: ["member-journal"] });
      toast({ title: "Entry deleted" });
    } catch (err: any) {
      toast({ title: err.message ?? "Delete failed", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = () => {
    window.open(`/api/member-journal/${entry.id}/export`, "_blank");
  };

  return (
    <div className={cn(
      "rounded-2xl border bg-card shadow-sm overflow-hidden transition-all",
      entry.urgent && !entry.shared ? "border-destructive/40" : "border-border"
    )}>
      {/* Statute of limitations nudge */}
      {showSolNudge && (
        <div className="flex items-start gap-2 px-3 py-2 bg-yellow-50 border-b border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800">
          <TriangleAlert className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-yellow-700 dark:text-yellow-300 leading-relaxed">
            This incident may be approaching the grievance filing window. Consider sharing with your steward.
          </p>
        </div>
      )}

      {/* Card header */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full px-3 py-3 flex items-start gap-2 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", INCIDENT_COLORS[entry.incident_type])}>
              {INCIDENT_LABELS[entry.incident_type]}
            </span>
            {entry.urgent && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive flex items-center gap-1">
                <ShieldAlert className="w-2.5 h-2.5" /> URGENT
              </span>
            )}
            {entry.shared ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5" /> Shared ✓
              </span>
            ) : (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" /> Private
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{fmtDate(entry.incident_date)}</span>
            {entry.incident_time && (
              <span className="text-xs text-muted-foreground">{entry.incident_time}</span>
            )}
            <span className="text-xs text-muted-foreground">· {SHIFT_LABELS[entry.shift]}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{entry.location}{entry.department ? ` — ${entry.department}` : ""}</p>
          {!expanded && (
            <p className="text-xs text-foreground/70 mt-1 line-clamp-2">{entry.description}</p>
          )}
        </div>
        <div className="flex-shrink-0 mt-0.5 text-muted-foreground">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          <div className="text-sm text-foreground bg-muted/30 rounded-xl p-3 whitespace-pre-wrap leading-relaxed">
            {entry.description}
          </div>

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {entry.persons_involved && (
              <div className="col-span-2">
                <span className="font-semibold text-muted-foreground">Persons involved: </span>
                <span>{entry.persons_involved}</span>
              </div>
            )}
            <div>
              <span className="font-semibold text-muted-foreground">Mgmt docs issued: </span>
              <span>{entry.management_documentation_issued ? "Yes" : "No"}</span>
            </div>
            <div>
              <span className="font-semibold text-muted-foreground">Union rep present: </span>
              <span>{entry.union_rep_present ? "Yes" : "No"}</span>
            </div>
            <div>
              <span className="font-semibold text-muted-foreground">Steward notified: </span>
              <span>{entry.steward_notified ? "Yes" : "No"}</span>
            </div>
            <div>
              <span className="font-semibold text-muted-foreground">Recorded: </span>
              <span>{fmtDateTime(entry.created_at)}</span>
            </div>
            {entry.shared_at && (
              <div className="col-span-2">
                <span className="font-semibold text-muted-foreground">Shared: </span>
                <span>{fmtDateTime(entry.shared_at)}</span>
              </div>
            )}
          </div>

          {/* Addendums */}
          {entry.addendums.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Addendums</p>
              {entry.addendums.map((a) => (
                <div key={a.id} className="border-l-2 border-primary/40 pl-3 py-1">
                  <p className="text-[10px] text-muted-foreground mb-0.5">{fmtDateTime(a.created_at)}</p>
                  <p className="text-xs text-foreground whitespace-pre-wrap">{a.content}</p>
                </div>
              ))}
            </div>
          )}

          {/* Addendum input */}
          {showAddendum && (
            <div className="space-y-2">
              <textarea
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                placeholder="Add a note or correction to this entry…"
                rows={3}
                value={addendumText}
                onChange={(e) => setAddendumText(e.target.value)}
                maxLength={2000}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowAddendum(false); setAddendumText(""); }}
                  className="flex-1 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddendum}
                  disabled={addendumSaving}
                  className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {addendumSaving ? "Saving…" : "Save Addendum"}
                </button>
              </div>
            </div>
          )}

          {/* Share confirm */}
          {shareConfirm && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-amber-800 dark:text-amber-200">Share with steward?</p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5 leading-relaxed">
                    Once shared, this cannot be undone. Your steward will see this entry in the complaint tracker.
                    {entry.urgent && " They will also receive an immediate push notification."}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShareConfirm(false)}
                  className="flex-1 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleShare}
                  disabled={sharing}
                  className="flex-1 py-2 rounded-xl bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-1"
                >
                  <Share2 className="w-3 h-3" />
                  {sharing ? "Sharing…" : "Confirm Share"}
                </button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {!showAddendum && (
              <button
                onClick={() => setShowAddendum(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs font-semibold hover:bg-muted transition-colors"
              >
                <PenLine className="w-3 h-3" />
                Add Note
              </button>
            )}
            {!entry.shared && !shareConfirm && (
              <button
                onClick={() => setShareConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-primary/40 bg-primary/5 text-primary text-xs font-semibold hover:bg-primary/10 transition-colors"
              >
                <Share2 className="w-3 h-3" />
                Share with Steward
              </button>
            )}
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs font-semibold hover:bg-muted transition-colors"
            >
              <FileDown className="w-3 h-3" />
              Export
            </button>
            {!entry.shared && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-destructive/30 text-destructive text-xs font-semibold hover:bg-destructive/5 transition-colors disabled:opacity-60 ml-auto"
              >
                <Trash2 className="w-3 h-3" />
                {deleting ? "Deleting…" : "Delete"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PendingEntryCard({ entry, onSynced }: PendingCardProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/member-journal", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentType: entry.incident_type,
          incidentDate: entry.incident_date,
          incidentTime: entry.incident_time ?? null,
          shift: entry.shift,
          location: entry.location,
          department: entry.department ?? null,
          description: entry.description,
          personsInvolved: entry.persons_involved ?? null,
          managementDocumentationIssued: entry.management_documentation_issued,
          unionRepPresent: entry.union_rep_present,
          stewardNotified: entry.steward_notified,
          urgent: entry.urgent,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Sync failed");
      await idbDelete(entry.tempId);
      await qc.invalidateQueries({ queryKey: ["member-journal"] });
      toast({ title: "Entry synced successfully" });
      onSynced();
    } catch (err: any) {
      toast({ title: err.message ?? "Sync failed", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 overflow-hidden">
      <div className="px-3 py-2.5 flex items-start gap-2">
        <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", INCIDENT_COLORS[entry.incident_type])}>
              {INCIDENT_LABELS[entry.incident_type]}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200">
              Pending sync
            </span>
          </div>
          <p className="text-xs font-semibold">{fmtDate(entry.incident_date)} · {SHIFT_LABELS[entry.shift]}</p>
          <p className="text-xs text-muted-foreground truncate">{entry.location}</p>
          <p className="text-xs text-foreground/70 mt-1 line-clamp-2">{entry.description}</p>
        </div>
      </div>
      <div className="px-3 pb-2.5">
        <button
          onClick={handleSync}
          disabled={syncing}
          className="w-full py-1.5 rounded-xl bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors disabled:opacity-60"
        >
          {syncing ? "Syncing…" : "Sync Now"}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MemberPortalJournal() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingEntries, setPendingEntries] = useState<PendingEntry[]>([]);
  const syncAttemptedRef = useRef(false);

  // Online/offline tracking
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Load pending entries from IndexedDB
  const loadPending = useCallback(async () => {
    try {
      const entries = await idbGetAll();
      setPendingEntries(entries.sort((a, b) => b.createdAt - a.createdAt));
    } catch {
      // IDB not available
    }
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  // Auto-attempt sync when back online
  useEffect(() => {
    if (isOnline && pendingEntries.length > 0 && !syncAttemptedRef.current) {
      syncAttemptedRef.current = true;
      toast({
        title: `${pendingEntries.length} offline entr${pendingEntries.length > 1 ? "ies" : "y"} ready to sync`,
        description: "Tap 'Sync Now' on each entry to upload.",
      });
    }
    if (!isOnline) syncAttemptedRef.current = false;
  }, [isOnline, pendingEntries.length, toast]);

  // Fetch server entries
  const { data: entries = [], isLoading, error } = useQuery<JournalEntry[]>({
    queryKey: ["member-journal"],
    queryFn: async () => {
      const res = await fetch("/api/member-journal", { credentials: "include" });
      if (!res.ok) {
        if (res.status === 403) throw new Error("no-member-link");
        throw new Error("Failed to load journal");
      }
      return res.json();
    },
    retry: false,
  });

  const handleExportAll = () => {
    window.open("/api/member-journal/export", "_blank");
  };

  const noMemberLink = (error as Error)?.message === "no-member-link";

  return (
    <MemberPortalLayout>
      {showForm && (
        <EntryForm
          isOnline={isOnline}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            loadPending();
            qc.invalidateQueries({ queryKey: ["member-journal"] });
          }}
        />
      )}

      <div className="px-4 py-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <NotebookPen className="w-5 h-5 text-primary" />
            <div>
              <h1 className="text-base font-bold leading-tight">Incident Journal</h1>
              <p className="text-[10px] text-muted-foreground">Private — visible only to you</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isOnline && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <WifiOff className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">Offline</span>
              </div>
            )}
            {entries.length > 0 && (
              <button
                onClick={handleExportAll}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-border text-xs font-semibold hover:bg-muted transition-colors"
              >
                <FileDown className="w-3 h-3" />
                Export All
              </button>
            )}
          </div>
        </div>

        {/* Privacy notice */}
        <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3">
          <div className="flex items-start gap-2">
            <Lock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
              All entries are <strong>encrypted at rest</strong> and visible only to you. Stewards cannot browse your journal.
              Entries are only shared with your steward when you explicitly tap <em>"Share with Steward."</em>
            </p>
          </div>
        </div>

        {/* No member link error */}
        {noMemberLink && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
            <p className="text-sm font-semibold text-destructive mb-1">Member profile not linked</p>
            <p className="text-xs text-muted-foreground">Your account isn't linked to a member profile yet. Contact your steward.</p>
          </div>
        )}

        {/* Loading state */}
        {isLoading && !noMemberLink && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-border bg-card p-3 animate-pulse">
                <div className="h-3 bg-muted rounded w-1/3 mb-2" />
                <div className="h-4 bg-muted rounded w-1/2 mb-1.5" />
                <div className="h-3 bg-muted rounded w-2/3" />
              </div>
            ))}
          </div>
        )}

        {/* Pending offline entries */}
        {pendingEntries.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400 tracking-wider">
              Offline — pending sync ({pendingEntries.length})
            </p>
            {pendingEntries.map((p) => (
              <PendingEntryCard
                key={p.tempId}
                entry={p}
                isPending={true}
                onSynced={loadPending}
              />
            ))}
          </div>
        )}

        {/* Server entries */}
        {!isLoading && !noMemberLink && entries.length === 0 && pendingEntries.length === 0 && (
          <div className="text-center py-10 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <NotebookPen className="w-7 h-7 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">No journal entries yet</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-[280px] mx-auto">
                Record incidents as they happen. Entries are private, locked on save, and only shared when you choose.
              </p>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Record First Incident
            </button>
          </div>
        )}

        {!isLoading && entries.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                {entries.length} entr{entries.length === 1 ? "y" : "ies"}
              </p>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="w-3 h-3" />
                Newest first
              </div>
            </div>
            {entries.map((entry) => (
              <EntryCard key={entry.id} entry={entry} onRefresh={() => qc.invalidateQueries({ queryKey: ["member-journal"] })} />
            ))}
          </div>
        )}
      </div>

      {/* FAB */}
      {!showForm && !noMemberLink && (
        <button
          onClick={() => setShowForm(true)}
          className="fixed bottom-[84px] right-4 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all active:scale-95 max-w-[calc(480px-2rem)] left-1/2 -translate-x-1/2 w-fit"
          style={{ maxWidth: "calc(min(480px, 100vw) - 2rem)", left: "auto", transform: "none", right: "max(1rem, calc(50% - 240px + 1rem))" }}
        >
          <Plus className="w-4 h-4" />
          <span className="text-sm font-semibold">New Entry</span>
        </button>
      )}
    </MemberPortalLayout>
  );
}
