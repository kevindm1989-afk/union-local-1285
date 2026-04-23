import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Calendar, MapPin, Trash2, Edit3, Check, X, Plus,
  CheckCircle2, Circle, Users, Printer, UserCheck, UserX, HelpCircle,
} from "lucide-react";
import { Link } from "wouter";
import { usePermissions } from "@/App";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type MeetingType = "executive" | "general" | "stewards";
type AttendanceStatus = "present" | "absent" | "excused";

interface AgendaItem {
  id: string;
  text: string;
  done: boolean;
}

interface Meeting {
  id: number;
  title: string;
  type: MeetingType;
  date: string;
  location: string | null;
  agenda: string | null;
  agendaItems: AgendaItem[] | null;
  minutes: string | null;
  minutesPublished: string;
  attendees: number[];
  attendanceData: Record<string, AttendanceStatus>;
}

const TYPE_COLORS: Record<MeetingType, string> = {
  executive: "bg-purple-100 text-purple-700",
  general: "bg-blue-100 text-blue-700",
  stewards: "bg-emerald-100 text-emerald-700",
};

const TYPE_LABELS: Record<MeetingType, string> = {
  executive: "Executive Board",
  general: "General Membership",
  stewards: "Stewards Council",
};

const ATTENDANCE_CONFIG: Record<AttendanceStatus, { label: string; icon: typeof UserCheck; color: string; bg: string }> = {
  present: { label: "Present", icon: UserCheck, color: "text-green-600", bg: "bg-green-100 border-green-300" },
  absent:  { label: "Absent",  icon: UserX,    color: "text-red-500",   bg: "bg-red-50 border-red-200" },
  excused: { label: "Excused", icon: HelpCircle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
};

function useMeeting(id: string) {
  return useQuery<Meeting>({
    queryKey: ["meeting", id],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/meetings/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error("Not found");
      return r.json();
    },
    enabled: !!id,
  });
}

export default function MeetingDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { can } = usePermissions();

  const { data: meeting, isLoading } = useMeeting(id!);
  const [tab, setTab] = useState<"agenda" | "minutes" | "attendance">("agenda");
  const [editingMinutes, setEditingMinutes] = useState(false);
  const [minutesDraft, setMinutesDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [newItemText, setNewItemText] = useState("");
  const [savingAgenda, setSavingAgenda] = useState(false);
  const [newAttendeeName, setNewAttendeeName] = useState("");
  const [savingAttendance, setSavingAttendance] = useState(false);

  const canManage = can("meetings.manage");

  const handleSaveMinutes = async (publish: boolean) => {
    setSaving(true);
    try {
      const r = await fetch(`${BASE}/api/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          minutes: minutesDraft,
          minutesPublished: publish ? "published" : "draft",
        }),
      });
      if (!r.ok) throw new Error();
      qc.invalidateQueries({ queryKey: ["meeting", id] });
      qc.invalidateQueries({ queryKey: ["meetings"] });
      setEditingMinutes(false);
      toast({ title: publish ? "Minutes published" : "Draft saved" });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const patchAgendaItems = async (items: AgendaItem[]) => {
    setSavingAgenda(true);
    try {
      const r = await fetch(`${BASE}/api/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ agendaItems: items }),
      });
      if (!r.ok) throw new Error();
      qc.invalidateQueries({ queryKey: ["meeting", id] });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSavingAgenda(false);
    }
  };

  const patchAttendance = async (data: Record<string, AttendanceStatus>) => {
    setSavingAttendance(true);
    try {
      const r = await fetch(`${BASE}/api/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ attendanceData: data }),
      });
      if (!r.ok) throw new Error();
      qc.invalidateQueries({ queryKey: ["meeting", id] });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSavingAttendance(false);
    }
  };

  const agendaItems: AgendaItem[] = meeting?.agendaItems ?? [];
  const attendanceData: Record<string, AttendanceStatus> = meeting?.attendanceData ?? {};

  const addAgendaItem = () => {
    if (!newItemText.trim()) return;
    const updated = [...agendaItems, { id: crypto.randomUUID(), text: newItemText.trim(), done: false }];
    setNewItemText("");
    patchAgendaItems(updated);
  };

  const toggleAgendaItem = (itemId: string) => {
    const updated = agendaItems.map((item) => item.id === itemId ? { ...item, done: !item.done } : item);
    patchAgendaItems(updated);
  };

  const deleteAgendaItem = (itemId: string) => {
    const updated = agendaItems.filter((item) => item.id !== itemId);
    patchAgendaItems(updated);
  };

  const addAttendee = () => {
    const name = newAttendeeName.trim();
    if (!name || attendanceData[name]) return;
    setNewAttendeeName("");
    patchAttendance({ ...attendanceData, [name]: "present" });
  };

  const setAttendanceStatus = (name: string, status: AttendanceStatus) => {
    patchAttendance({ ...attendanceData, [name]: status });
  };

  const removeAttendee = (name: string) => {
    const next = { ...attendanceData };
    delete next[name];
    patchAttendance(next);
  };

  const handleDelete = async () => {
    if (!confirm("Delete this meeting?")) return;
    setDeleting(true);
    try {
      await fetch(`${BASE}/api/meetings/${id}`, { method: "DELETE", credentials: "include" });
      qc.invalidateQueries({ queryKey: ["meetings"] });
      navigate("/meetings");
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handlePrint = () => {
    if (!meeting) return;
    const date = new Date(meeting.date);
    const dateStr = date.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const agendaHtml = agendaItems.length
      ? `<ol>${agendaItems.map(i => `<li style="${i.done ? "text-decoration:line-through;color:#888" : ""}">${i.text}</li>`).join("")}</ol>`
      : meeting.agenda ? `<pre style="white-space:pre-wrap;font-family:inherit">${meeting.agenda}</pre>` : "<p><em>No agenda items</em></p>";

    const attendanceHtml = Object.keys(attendanceData).length
      ? `<table style="width:100%;border-collapse:collapse">
          <thead><tr><th style="text-align:left;border-bottom:1px solid #ccc;padding:4px 8px">Name</th><th style="text-align:left;border-bottom:1px solid #ccc;padding:4px 8px">Status</th></tr></thead>
          <tbody>${Object.entries(attendanceData).map(([name, status]) =>
            `<tr><td style="padding:4px 8px">${name}</td><td style="padding:4px 8px;text-transform:capitalize">${status}</td></tr>`
          ).join("")}</tbody>
        </table>`
      : "<p><em>No attendance recorded</em></p>";

    const minutesHtml = meeting.minutes
      ? `<pre style="white-space:pre-wrap;font-family:inherit;font-size:14px">${meeting.minutes}</pre>`
      : "<p><em>No minutes recorded</em></p>";

    const html = `<!DOCTYPE html><html><head><title>${meeting.title}</title>
      <style>
        body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #111; }
        h1 { font-size: 22px; margin-bottom: 4px; }
        .meta { color: #666; font-size: 14px; margin-bottom: 24px; }
        h2 { font-size: 16px; border-bottom: 2px solid #eee; padding-bottom: 6px; margin-top: 28px; }
        ol { padding-left: 20px; } li { margin: 6px 0; font-size: 14px; }
        table { font-size: 14px; }
        @media print { body { margin: 20px; } }
      </style></head><body>
      <h1>${meeting.title}</h1>
      <div class="meta">${TYPE_LABELS[meeting.type] ?? meeting.type} &nbsp;·&nbsp; ${dateStr} at ${timeStr}${meeting.location ? ` &nbsp;·&nbsp; ${meeting.location}` : ""}</div>
      <h2>Agenda</h2>${agendaHtml}
      <h2>Attendance (${Object.values(attendanceData).filter(s => s === "present").length} present)</h2>${attendanceHtml}
      <h2>Minutes</h2>${minutesHtml}
    </body></html>`;

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      win.print();
    }
  };

  if (isLoading) {
    return (
      <MobileLayout>
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </MobileLayout>
    );
  }

  if (!meeting) {
    return (
      <MobileLayout>
        <div className="px-4 pt-8 text-center">
          <p className="text-muted-foreground text-sm">Meeting not found.</p>
          <Link href="/meetings"><a className="text-primary text-sm font-bold mt-2 inline-block">← Back</a></Link>
        </div>
      </MobileLayout>
    );
  }

  const date = new Date(meeting.date);
  const isPast = date < new Date();
  const presentCount = Object.values(attendanceData).filter(s => s === "present").length;
  const totalCount = Object.keys(attendanceData).length;

  return (
    <MobileLayout>
      <div className="px-4 pt-4 pb-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Link href="/meetings">
            <button className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <div className="flex-1 min-w-0">
            <span className={cn(
              "text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
              TYPE_COLORS[meeting.type] ?? "bg-muted text-muted-foreground"
            )}>
              {TYPE_LABELS[meeting.type] ?? meeting.type}
            </span>
            <h1 className="text-base font-black text-foreground leading-tight mt-0.5 truncate">
              {meeting.title}
            </h1>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canManage && (
              <button
                onClick={handlePrint}
                className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-muted-foreground"
                title="Print / Export PDF"
              >
                <Printer className="w-4 h-4" />
              </button>
            )}
            {canManage && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Meta */}
        <div className="bg-muted rounded-2xl p-4 space-y-2 mb-4">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-primary shrink-0" />
            <span className="font-semibold">{date.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-4 h-4 shrink-0 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-primary" />
            </div>
            <span>{date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          {meeting.location && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="w-4 h-4 shrink-0 text-primary" />
              <span>{meeting.location}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="w-4 h-4 shrink-0 text-primary" />
            <span>{totalCount > 0 ? `${presentCount} of ${totalCount} present` : "No attendance recorded"}</span>
          </div>
          {isPast && (
            <span className="inline-block text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted-foreground/20 text-muted-foreground">
              Past Meeting
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-muted rounded-xl p-1">
          {(["agenda", "attendance", "minutes"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 py-2 rounded-lg text-xs font-bold transition-all capitalize",
                tab === t
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground"
              )}
            >
              {t}
              {t === "minutes" && meeting.minutesPublished === "published" && (
                <span className="ml-1 text-[8px] text-green-600">✓</span>
              )}
              {t === "attendance" && totalCount > 0 && (
                <span className="ml-1 text-[8px] text-muted-foreground opacity-70">{totalCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Agenda Tab ── */}
        {tab === "agenda" && (
          <div className="space-y-3">
            {agendaItems.length > 0 ? (
              <div className="space-y-2">
                {agendaItems.map((item, idx) => (
                  <div key={item.id} className={cn(
                    "flex items-start gap-3 p-3.5 rounded-xl border transition-colors",
                    item.done ? "bg-muted/40 border-muted" : "bg-card border-border"
                  )}>
                    <button
                      onClick={() => canManage && toggleAgendaItem(item.id)}
                      className={cn("shrink-0 mt-0.5", !canManage && "pointer-events-none")}
                    >
                      {item.done
                        ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                        : <Circle className="w-5 h-5 text-muted-foreground" />
                      }
                    </button>
                    <span className={cn("flex-1 text-sm leading-snug", item.done && "line-through text-muted-foreground")}>
                      <span className="text-[10px] font-bold text-muted-foreground mr-1.5">{idx + 1}.</span>
                      {item.text}
                    </span>
                    {canManage && (
                      <button onClick={() => deleteAgendaItem(item.id)} className="shrink-0 text-muted-foreground hover:text-destructive transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              !canManage && <div className="bg-card border border-border rounded-2xl p-4 min-h-[120px] flex items-center justify-center">
                <p className="text-sm text-muted-foreground italic">No agenda items set</p>
              </div>
            )}

            {!agendaItems.length && meeting.agenda && (
              <div className="bg-muted rounded-2xl p-4">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Agenda Notes</p>
                <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">{meeting.agenda}</pre>
              </div>
            )}

            {canManage && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAgendaItem(); } }}
                  placeholder="Add agenda item..."
                  className="flex-1 h-11 px-4 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  onClick={addAgendaItem}
                  disabled={!newItemText.trim() || savingAgenda}
                  className="h-11 w-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 disabled:opacity-50 transition-opacity"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            )}

            {agendaItems.length > 0 && (
              <p className="text-xs text-muted-foreground text-center">
                {agendaItems.filter(i => i.done).length} of {agendaItems.length} items covered
              </p>
            )}
          </div>
        )}

        {/* ── Attendance Tab ── */}
        {tab === "attendance" && (
          <div className="space-y-3">
            {/* Summary chips */}
            {totalCount > 0 && (
              <div className="flex gap-2 flex-wrap">
                {(["present", "absent", "excused"] as const).map((status) => {
                  const count = Object.values(attendanceData).filter(s => s === status).length;
                  if (!count) return null;
                  const cfg = ATTENDANCE_CONFIG[status];
                  return (
                    <span key={status} className={cn("text-[11px] font-bold px-2.5 py-1 rounded-full border", cfg.bg, cfg.color)}>
                      {count} {cfg.label}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Attendee list */}
            {totalCount === 0 ? (
              <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
                <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-20" />
                <p className="text-sm text-muted-foreground">No attendees recorded yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(attendanceData).map(([name, status]) => {
                  const cfg = ATTENDANCE_CONFIG[status];
                  return (
                    <div key={name} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{name}</p>
                      </div>
                      {canManage ? (
                        <div className="flex items-center gap-1 shrink-0">
                          {(["present", "absent", "excused"] as const).map((s) => {
                            const c = ATTENDANCE_CONFIG[s];
                            return (
                              <button
                                key={s}
                                onClick={() => setAttendanceStatus(name, s)}
                                disabled={savingAttendance}
                                className={cn(
                                  "text-[9px] font-bold uppercase px-2 py-1 rounded-lg border transition-colors",
                                  status === s
                                    ? cn(c.bg, c.color)
                                    : "bg-muted text-muted-foreground border-transparent"
                                )}
                              >
                                {s}
                              </button>
                            );
                          })}
                          <button
                            onClick={() => removeAttendee(name)}
                            className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span className={cn("text-[10px] font-bold uppercase px-2 py-1 rounded-lg border", ATTENDANCE_CONFIG[status].bg, ATTENDANCE_CONFIG[status].color)}>
                          {cfg.label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add attendee input */}
            {canManage && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newAttendeeName}
                  onChange={(e) => setNewAttendeeName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAttendee(); } }}
                  placeholder="Add member name..."
                  className="flex-1 h-11 px-4 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  onClick={addAttendee}
                  disabled={!newAttendeeName.trim() || savingAttendance}
                  className="h-11 w-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 disabled:opacity-50 transition-opacity"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Minutes Tab ── */}
        {tab === "minutes" && (
          <div className="space-y-3">
            {meeting.minutesPublished === "published" && !editingMinutes && (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-xl">
                <Check className="w-4 h-4 text-green-600 shrink-0" />
                <span className="text-xs font-bold text-green-700">Minutes Published</span>
              </div>
            )}

            {editingMinutes ? (
              <>
                <textarea
                  className="w-full rounded-2xl border border-border bg-muted px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  rows={14}
                  placeholder="Record the meeting minutes here..."
                  value={minutesDraft}
                  onChange={(e) => setMinutesDraft(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEditingMinutes(false); }}
                    className="flex-1 py-3 rounded-xl border border-border text-sm font-bold text-muted-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleSaveMinutes(false)}
                    disabled={saving}
                    className="flex-1 py-3 rounded-xl bg-muted border border-border text-sm font-bold disabled:opacity-50"
                  >
                    Save Draft
                  </button>
                  <button
                    onClick={() => handleSaveMinutes(true)}
                    disabled={saving}
                    className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50 shadow-lg shadow-primary/30"
                  >
                    Publish
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-card border border-border rounded-2xl p-4 min-h-[200px]">
                  {meeting.minutes ? (
                    <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">
                      {meeting.minutes}
                    </pre>
                  ) : (
                    <p className="text-sm text-muted-foreground italic text-center py-8">No minutes recorded yet</p>
                  )}
                </div>
                <div className="flex gap-2">
                  {canManage && (
                    <button
                      onClick={() => { setMinutesDraft(meeting.minutes ?? ""); setEditingMinutes(true); }}
                      className="flex-1 py-3 rounded-xl border border-primary text-primary text-sm font-bold flex items-center justify-center gap-2"
                    >
                      <Edit3 className="w-4 h-4" />
                      {meeting.minutes ? "Edit Minutes" : "Record Minutes"}
                    </button>
                  )}
                  {(meeting.minutes || agendaItems.length > 0) && (
                    <button
                      onClick={handlePrint}
                      className="py-3 px-4 rounded-xl border border-border text-muted-foreground text-sm font-bold flex items-center justify-center gap-2"
                    >
                      <Printer className="w-4 h-4" />
                      Export PDF
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
