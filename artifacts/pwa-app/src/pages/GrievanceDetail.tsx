import { useState, useEffect, useRef } from "react";
import { useParams, useLocation, Link } from "wouter";
import { MobileLayout } from "@/components/layout/MobileLayout";
import {
  useGetGrievance,
  useUpdateGrievance,
  useDeleteGrievance,
  getGetGrievanceQueryKey,
  getListGrievancesQueryKey,
  getGetGrievancesSummaryQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetRecentActivityQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ChevronLeft, Trash2, MessageSquare, ArrowRightCircle, Layers, Plus, Loader2,
  BookOpen, ChevronDown, ChevronUp, Phone, ShieldCheck, Users,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  open: "bg-blue-100 text-blue-800 border-blue-200",
  pending_response: "bg-amber-100 text-amber-800 border-amber-200",
  pending_hearing: "bg-orange-100 text-orange-800 border-orange-200",
  resolved: "bg-green-100 text-green-800 border-green-200",
  withdrawn: "bg-gray-100 text-gray-600 border-gray-200",
};

interface GrievanceNote {
  id: number;
  grievanceId: number;
  userId: number | null;
  authorName: string | null;
  content: string;
  noteType: string;
  createdAt: string;
}

interface JournalEntry {
  id: number;
  grievanceId: number;
  authorId: number;
  authorName: string | null;
  entryType: string;
  content: string;
  isPrivate: boolean;
  createdAt: string;
}

interface JustCause {
  id: number;
  grievanceId: number;
  assessedBy: number;
  assessedAt: string;
  adequateNotice: boolean;
  reasonableRule: boolean;
  investigationConducted: boolean;
  investigationFair: boolean;
  proofSufficient: boolean;
  penaltyConsistent: boolean;
  penaltyProgressive: boolean;
  notes: string | null;
}

interface CommLog {
  id: number;
  loggedByName: string | null;
  contactMethod: string;
  summary: string;
  contactDate: string;
}

function renderContent(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>,
  );
}

function NoteIcon({ type }: { type: string }) {
  if (type === "status_change") return <ArrowRightCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />;
  if (type === "step_change") return <Layers className="w-4 h-4 text-blue-500 flex-shrink-0" />;
  return <MessageSquare className="w-4 h-4 text-muted-foreground flex-shrink-0" />;
}

const fetchJson = async (url: string, opts?: RequestInit) => {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
};

const JUST_CAUSE_FIELDS: Array<{ key: keyof JustCause; label: string; description: string }> = [
  { key: "adequateNotice", label: "Adequate Notice", description: "Was the employee aware the conduct was prohibited?" },
  { key: "reasonableRule", label: "Reasonable Rule", description: "Is the rule/standard reasonably related to job performance?" },
  { key: "investigationConducted", label: "Investigation Conducted", description: "Was a fair investigation conducted before discipline?" },
  { key: "investigationFair", label: "Investigation Fair", description: "Was the investigation objective and thorough?" },
  { key: "proofSufficient", label: "Proof Sufficient", description: "Is there substantial evidence to support the charge?" },
  { key: "penaltyConsistent", label: "Penalty Consistent", description: "Is the penalty consistent with similar past cases?" },
  { key: "penaltyProgressive", label: "Progressive Discipline", description: "Was progressive discipline applied before termination?" },
];

const METHOD_LABELS: Record<string, string> = {
  in_person: "In Person", phone: "Phone", text: "Text", email: "Email", voicemail: "Voicemail", no_answer: "No Answer",
};
const ENTRY_TYPE_LABELS: Record<string, string> = {
  note: "Note", call: "Call", meeting: "Meeting", email: "Email", management_contact: "Mgmt Contact",
};

// ─── Collapsible Panel ────────────────────────────────────────────────────────
function Panel({ title, icon, children, defaultOpen = false }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="border-t border-border">{children}</div>}
    </div>
  );
}

export default function GrievanceDetail() {
  const { id } = useParams<{ id: string }>();
  const grievanceId = parseInt(id || "0", 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: grievance, isLoading } = useGetGrievance(grievanceId, {
    query: { enabled: !!grievanceId, queryKey: getGetGrievanceQueryKey(grievanceId) },
  });

  const updateGrievance = useUpdateGrievance({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetGrievanceQueryKey(grievanceId) });
        queryClient.invalidateQueries({ queryKey: getListGrievancesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetGrievancesSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
        setTimeout(() => refetchNotes(), 300);
      },
    },
  });

  const deleteGrievance = useDeleteGrievance({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGrievancesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetGrievancesSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
        setLocation("/grievances");
      },
    },
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contractArticle, setContractArticle] = useState("");
  const [notes, setNotes] = useState("");
  const [resolution, setResolution] = useState("");
  const [status, setStatus] = useState("open");
  const [step, setStep] = useState("1");
  const [dueDate, setDueDate] = useState("");
  const [accommodationRequest, setAccommodationRequest] = useState(false);
  const [outcome, setOutcome] = useState("");
  const initialized = useRef(false);

  const [newNote, setNewNote] = useState("");

  // Journal state
  const [newJournalContent, setNewJournalContent] = useState("");
  const [newJournalType, setNewJournalType] = useState("note");

  // Communication log state
  const [newCommSummary, setNewCommSummary] = useState("");
  const [newCommMethod, setNewCommMethod] = useState("in_person");
  const [newCommDate, setNewCommDate] = useState(new Date().toISOString().split("T")[0]);

  useEffect(() => {
    if (grievance && !initialized.current) {
      initialized.current = true;
      setTitle(grievance.title);
      setDescription(grievance.description || "");
      setContractArticle(grievance.contractArticle || "");
      setNotes(grievance.notes || "");
      setResolution(grievance.resolution || "");
      setStatus(grievance.status);
      setStep(String(grievance.step));
      setDueDate(grievance.dueDate || "");
      setAccommodationRequest((grievance as any).accommodationRequest ?? false);
      setOutcome((grievance as any).outcome || "");
    }
  }, [grievance]);

  const notesKey = ["grievance-notes", grievanceId];
  const journalKey = ["grievance-journal", grievanceId];
  const justCauseKey = ["grievance-just-cause", grievanceId];
  const commLogKey = ["grievance-comm-log", grievanceId];

  const { data: activityNotes = [], refetch: refetchNotes } = useQuery<GrievanceNote[]>({
    queryKey: notesKey,
    queryFn: () => fetchJson(`/api/grievances/${grievanceId}/notes`),
    enabled: !!grievanceId,
  });

  const { data: journalEntries = [], refetch: refetchJournal } = useQuery<JournalEntry[]>({
    queryKey: journalKey,
    queryFn: () => fetchJson(`/api/grievances/${grievanceId}/journal`),
    enabled: !!grievanceId,
  });

  const { data: justCause, refetch: refetchJustCause } = useQuery<JustCause | null>({
    queryKey: justCauseKey,
    queryFn: () => fetchJson(`/api/grievances/${grievanceId}/just-cause`),
    enabled: !!grievanceId,
  });

  const { data: commLog = [], refetch: refetchCommLog } = useQuery<CommLog[]>({
    queryKey: commLogKey,
    queryFn: () => fetchJson(`/api/grievances/${grievanceId}/communications`),
    enabled: !!grievanceId,
  });

  const addNote = useMutation({
    mutationFn: (content: string) =>
      fetchJson(`/api/grievances/${grievanceId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => { setNewNote(""); refetchNotes(); },
  });

  const addJournalEntry = useMutation({
    mutationFn: () =>
      fetchJson(`/api/grievances/${grievanceId}/journal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newJournalContent.trim(), entryType: newJournalType }),
      }),
    onSuccess: () => { setNewJournalContent(""); refetchJournal(); },
  });

  const saveJustCause = useMutation({
    mutationFn: (data: Partial<JustCause>) =>
      fetchJson(`/api/grievances/${grievanceId}/just-cause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => refetchJustCause(),
  });

  const addCommLog = useMutation({
    mutationFn: () =>
      fetchJson(`/api/grievances/${grievanceId}/communications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: newCommSummary.trim(),
          contactMethod: newCommMethod,
          contactDate: newCommDate,
          memberId: (grievance as any)?.memberId ?? null,
        }),
      }),
    onSuccess: () => { setNewCommSummary(""); refetchCommLog(); },
  });

  const handleUpdate = (field: string, value: unknown) => {
    updateGrievance.mutate({ id: grievanceId, data: { [field]: value } });
  };

  const handleDelete = () => {
    deleteGrievance.mutate({ id: grievanceId });
  };

  // Just cause toggle helper
  const toggleJustCause = (field: keyof JustCause) => {
    const current = justCause ?? {};
    const newVal = !((current as Record<string, unknown>)[field]);
    saveJustCause.mutate({ ...current, [field]: newVal } as Partial<JustCause>);
  };

  if (isLoading) {
    return (
      <MobileLayout>
        <div className="p-5 space-y-4">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </MobileLayout>
    );
  }

  if (!grievance) return null;

  const jcScore = justCause
    ? JUST_CAUSE_FIELDS.filter((f) => Boolean((justCause as unknown as Record<string, unknown>)[f.key])).length
    : 0;

  return (
    <MobileLayout>
      <div className="min-h-full flex flex-col bg-background">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 h-14 flex items-center justify-between">
          <Link href="/grievances" className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <div className="text-center">
            <span className="font-bold text-xs tracking-wider uppercase block">{grievance.grievanceNumber}</span>
            <div className="flex items-center gap-1 justify-center">
              <span className={cn("text-[9px] uppercase font-bold px-2 py-0.5 rounded border", statusColors[grievance.status])}>
                {grievance.status.replace(/_/g, " ")}
              </span>
              {(grievance as any).isOverdue && (
                <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded border bg-red-100 text-red-700 border-red-200">
                  Overdue
                </span>
              )}
            </div>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10">
                <Trash2 className="w-5 h-5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-[320px] rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this grievance?</AlertDialogTitle>
                <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-col gap-2">
                <AlertDialogCancel className="w-full">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive w-full">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </header>

        <div className="p-5 space-y-5 flex-1">
          {/* Step Progress Tracker */}
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Grievance Progress</p>
            <div className="relative">
              <div className="absolute top-3 left-4 right-4 h-0.5 bg-muted" />
              <div
                className="absolute top-3 left-4 h-0.5 bg-primary transition-all duration-500"
                style={{ width: `${Math.min(((parseInt(step) - 1) / 4) * 100, 100)}%` }}
              />
              <div className="relative flex justify-between">
                {[
                  { n: 1, label: "Step 1" },
                  { n: 2, label: "Step 2" },
                  { n: 3, label: "Step 3" },
                  { n: 4, label: "Step 4" },
                  { n: 5, label: "Arb." },
                ].map(({ n, label }) => {
                  const cur = parseInt(step);
                  const done = cur > n;
                  const active = cur === n;
                  return (
                    <div key={n} className="flex flex-col items-center gap-1">
                      <div className={cn(
                        "w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-black transition-all",
                        done ? "bg-primary border-primary text-primary-foreground" :
                        active ? "bg-background border-primary text-primary" :
                        "bg-background border-muted text-muted-foreground"
                      )}>
                        {done ? "✓" : n}
                      </div>
                      <span className={cn("text-[9px] font-semibold", active ? "text-primary" : "text-muted-foreground")}>
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {grievance.memberName && (
            <div className="bg-primary/10 border border-primary/20 rounded-xl px-4 py-2.5">
              <p className="text-xs font-bold text-primary uppercase tracking-wider">Member</p>
              <p className="text-sm font-semibold text-foreground">{grievance.memberName}</p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)}
              onBlur={() => { if (title !== grievance.title && title.trim()) handleUpdate("title", title); else if (!title.trim()) setTitle(grievance.title); }}
              className="h-12 rounded-xl bg-card font-semibold" />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Contract Article</label>
            <Input value={contractArticle} onChange={(e) => setContractArticle(e.target.value)}
              onBlur={() => { if (contractArticle !== (grievance.contractArticle || "")) handleUpdate("contractArticle", contractArticle || null); }}
              placeholder="e.g. Article 12, Section 4" className="h-12 rounded-xl bg-card" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Step</label>
              <Select value={step} onValueChange={(v) => { setStep(v); handleUpdate("step", parseInt(v)); }}>
                <SelectTrigger className="h-12 rounded-xl bg-card"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="1">Step 1</SelectItem>
                  <SelectItem value="2">Step 2</SelectItem>
                  <SelectItem value="3">Step 3</SelectItem>
                  <SelectItem value="4">Step 4</SelectItem>
                  <SelectItem value="5">Step 5 — Arbitration</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</label>
              <Select value={status} onValueChange={(v) => { setStatus(v); handleUpdate("status", v); }}>
                <SelectTrigger className="h-12 rounded-xl bg-card"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="pending_response">Pending Response</SelectItem>
                  <SelectItem value="pending_hearing">Pending Hearing</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="withdrawn">Withdrawn</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Outcome</label>
            <Select value={outcome || "pending"} onValueChange={(v) => { const val = v === "pending" ? "" : v; setOutcome(val); handleUpdate("outcome", val || null); }}>
              <SelectTrigger className="h-12 rounded-xl bg-card"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="pending">Pending / In Progress</SelectItem>
                <SelectItem value="settled">Settled</SelectItem>
                <SelectItem value="arbitration">Sent to Arbitration</SelectItem>
                <SelectItem value="withdrawn">Withdrawn</SelectItem>
                <SelectItem value="denied">Denied</SelectItem>
                <SelectItem value="won">Won</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Response Due Date</label>
            <Input type="date" value={dueDate} onChange={(e) => { setDueDate(e.target.value); handleUpdate("dueDate", e.target.value || null); }}
              className="h-12 rounded-xl bg-card" />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
              onBlur={() => { if (description !== (grievance.description || "")) handleUpdate("description", description || null); }}
              placeholder="Describe the violation..." className="min-h-[100px] rounded-xl bg-card resize-none" />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Steward Notes</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              onBlur={() => { if (notes !== (grievance.notes || "")) handleUpdate("notes", notes || null); }}
              placeholder="Witnesses, evidence, next steps..." className="min-h-[80px] rounded-xl bg-card resize-none" />
          </div>

          <div
            className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border cursor-pointer"
            onClick={() => {
              const next = !accommodationRequest;
              setAccommodationRequest(next);
              handleUpdate("accommodationRequest", next);
            }}
          >
            <Checkbox checked={accommodationRequest} />
            <div>
              <p className="text-sm font-semibold">ADA / Accommodation Request</p>
              <p className="text-xs text-muted-foreground">Member has a disability accommodation involved</p>
            </div>
          </div>

          {(status === "resolved" || status === "withdrawn") && (
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Resolution</label>
              <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)}
                onBlur={() => { if (resolution !== (grievance.resolution || "")) handleUpdate("resolution", resolution || null); }}
                placeholder="How was this resolved?" className="min-h-[80px] rounded-xl bg-card resize-none" />
            </div>
          )}

          {/* ── Activity Timeline ─────────────────────────────────────────── */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Activity</span>
            </div>

            <div className="flex gap-2">
              <Textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Add a note…"
                className="min-h-[60px] rounded-xl bg-card resize-none text-sm flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && newNote.trim()) {
                    addNote.mutate(newNote.trim());
                  }
                }}
              />
              <Button
                size="sm"
                className="self-end rounded-xl h-9 w-9 p-0 flex-shrink-0"
                disabled={!newNote.trim() || addNote.isPending}
                onClick={() => { if (newNote.trim()) addNote.mutate(newNote.trim()); }}
              >
                {addNote.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </Button>
            </div>

            {activityNotes.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">No activity yet.</p>
            ) : (
              <div className="space-y-2">
                {activityNotes.map((note) => (
                  <div key={note.id} className="flex gap-3 p-3 rounded-xl bg-card border border-border">
                    <NoteIcon type={note.noteType} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-xs font-semibold">{note.authorName ?? "System"}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {format(parseISO(note.createdAt), "MMM d 'at' h:mm a")}
                        </span>
                      </div>
                      <p className="text-sm mt-0.5 text-foreground leading-snug">
                        {renderContent(note.content)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Steward Case Journal ───────────────────────────────────────── */}
          <Panel title={`Steward Journal (${journalEntries.length})`} icon={<BookOpen className="w-4 h-4 text-muted-foreground" />}>
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                <Select value={newJournalType} onValueChange={setNewJournalType}>
                  <SelectTrigger className="h-9 rounded-xl bg-background text-xs w-36 flex-shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="note">Note</SelectItem>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="management_contact">Mgmt Contact</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Textarea
                  value={newJournalContent}
                  onChange={(e) => setNewJournalContent(e.target.value)}
                  placeholder="Add a private journal entry…"
                  className="min-h-[60px] rounded-xl bg-background resize-none text-sm flex-1"
                />
                <Button
                  size="sm"
                  className="self-end rounded-xl h-9 w-9 p-0 flex-shrink-0"
                  disabled={!newJournalContent.trim() || addJournalEntry.isPending}
                  onClick={() => { if (newJournalContent.trim()) addJournalEntry.mutate(); }}
                >
                  {addJournalEntry.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </Button>
              </div>
              {journalEntries.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">No journal entries yet. These are private steward notes.</p>
              ) : (
                <div className="space-y-2">
                  {journalEntries.map((e) => (
                    <div key={e.id} className="p-3 rounded-xl bg-background border border-border space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{ENTRY_TYPE_LABELS[e.entryType] ?? e.entryType}</span>
                          <span className="text-xs font-semibold">{e.authorName ?? "Steward"}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{format(parseISO(e.createdAt), "MMM d, h:mm a")}</span>
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{e.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>

          {/* ── Just Cause Assessment ──────────────────────────────────────── */}
          <Panel
            title={justCause ? `Just Cause Assessment (${jcScore}/7)` : "Just Cause Assessment"}
            icon={<ShieldCheck className="w-4 h-4 text-muted-foreground" />}
          >
            <div className="p-4 space-y-3">
              {jcScore > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className={cn("h-2 rounded-full transition-all", jcScore >= 6 ? "bg-green-500" : jcScore >= 4 ? "bg-amber-500" : "bg-red-500")}
                      style={{ width: `${(jcScore / 7) * 100}%` }}
                    />
                  </div>
                  <span className={cn("text-xs font-bold", jcScore >= 6 ? "text-green-600" : jcScore >= 4 ? "text-amber-600" : "text-red-600")}>
                    {jcScore}/7
                  </span>
                </div>
              )}
              <div className="space-y-2.5">
                {JUST_CAUSE_FIELDS.map((f) => {
                  const checked = Boolean(justCause && (justCause as unknown as Record<string, unknown>)[f.key]);
                  return (
                    <div
                      key={f.key}
                      className="flex items-start gap-3 p-3 rounded-xl bg-background border border-border cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => toggleJustCause(f.key)}
                    >
                      <Checkbox checked={checked} className="mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold">{f.label}</p>
                        <p className="text-xs text-muted-foreground">{f.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {justCause && (
                <div className="space-y-2 pt-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Assessment Notes</label>
                  <Textarea
                    defaultValue={justCause.notes ?? ""}
                    placeholder="Additional notes on just cause analysis..."
                    className="min-h-[60px] rounded-xl bg-background resize-none text-sm"
                    onBlur={(e) => {
                      if (e.target.value !== (justCause.notes ?? "")) {
                        saveJustCause.mutate({ ...justCause, notes: e.target.value || null });
                      }
                    }}
                  />
                </div>
              )}
            </div>
          </Panel>

          {/* ── Member Communication Log ───────────────────────────────────── */}
          <Panel title={`Contact Log (${commLog.length})`} icon={<Users className="w-4 h-4 text-muted-foreground" />}>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Select value={newCommMethod} onValueChange={setNewCommMethod}>
                  <SelectTrigger className="h-9 rounded-xl bg-background text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="in_person">In Person</SelectItem>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="voicemail">Voicemail</SelectItem>
                    <SelectItem value="no_answer">No Answer</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="date" value={newCommDate} onChange={(e) => setNewCommDate(e.target.value)} className="h-9 rounded-xl bg-background text-xs" />
              </div>
              <div className="flex gap-2">
                <Textarea
                  value={newCommSummary}
                  onChange={(e) => setNewCommSummary(e.target.value)}
                  placeholder="Brief summary of contact with member..."
                  className="min-h-[60px] rounded-xl bg-background resize-none text-sm flex-1"
                />
                <Button
                  size="sm"
                  className="self-end rounded-xl h-9 w-9 p-0 flex-shrink-0"
                  disabled={!newCommSummary.trim() || addCommLog.isPending}
                  onClick={() => { if (newCommSummary.trim()) addCommLog.mutate(); }}
                >
                  {addCommLog.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </Button>
              </div>
              {commLog.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">No contacts logged yet.</p>
              ) : (
                <div className="space-y-2">
                  {commLog.map((c) => (
                    <div key={c.id} className="p-3 rounded-xl bg-background border border-border space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{METHOD_LABELS[c.contactMethod] ?? c.contactMethod}</span>
                          <span className="text-xs font-semibold">{c.loggedByName ?? "Steward"}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{c.contactDate}</span>
                      </div>
                      <p className="text-sm text-foreground">{c.summary}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>

          <div className="pt-2 text-center text-xs text-muted-foreground space-y-0.5 pb-6">
            <p>Filed {format(new Date(grievance.filedDate), "MMMM d, yyyy")}</p>
            <p>Last updated {format(new Date(grievance.updatedAt), "MMM d 'at' h:mm a")}</p>
          </div>
        </div>
      </div>
    </MobileLayout>
  );
}
