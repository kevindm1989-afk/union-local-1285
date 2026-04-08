import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Calendar, MapPin, Trash2, Edit3, Check, X } from "lucide-react";
import { Link } from "wouter";
import { usePermissions } from "@/App";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type MeetingType = "executive" | "general" | "stewards";

interface Meeting {
  id: number;
  title: string;
  type: MeetingType;
  date: string;
  location: string | null;
  agenda: string | null;
  minutes: string | null;
  minutesPublished: string;
  attendees: number[];
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
  const [tab, setTab] = useState<"agenda" | "minutes">("agenda");
  const [editingMinutes, setEditingMinutes] = useState(false);
  const [minutesDraft, setMinutesDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
          {isPast && (
            <span className="inline-block text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted-foreground/20 text-muted-foreground">
              Past Meeting
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-muted rounded-xl p-1">
          {(["agenda", "minutes"] as const).map((t) => (
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
            </button>
          ))}
        </div>

        {/* Agenda */}
        {tab === "agenda" && (
          <div className="bg-card border border-border rounded-2xl p-4 min-h-[200px]">
            {meeting.agenda ? (
              <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">
                {meeting.agenda}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground italic text-center py-8">No agenda set</p>
            )}
          </div>
        )}

        {/* Minutes */}
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
                {canManage && (
                  <button
                    onClick={() => { setMinutesDraft(meeting.minutes ?? ""); setEditingMinutes(true); }}
                    className="w-full py-3 rounded-xl border border-primary text-primary text-sm font-bold flex items-center justify-center gap-2"
                  >
                    <Edit3 className="w-4 h-4" />
                    {meeting.minutes ? "Edit Minutes" : "Record Minutes"}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
