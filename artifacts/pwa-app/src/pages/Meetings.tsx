import { useState } from "react";
import { Link } from "wouter";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { useAuth, usePermissions } from "@/App";
import { useQuery } from "@tanstack/react-query";
import { Plus, Calendar, MapPin, Users, Clock, ChevronRight, BookOpen, GanttChartSquare } from "lucide-react";
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
  createdBy: number | null;
}

const TYPE_LABELS: Record<MeetingType, string> = {
  executive: "Executive",
  general: "General",
  stewards: "Stewards",
};

const TYPE_COLORS: Record<MeetingType, string> = {
  executive: "bg-purple-100 text-purple-700",
  general: "bg-blue-100 text-blue-700",
  stewards: "bg-emerald-100 text-emerald-700",
};

function useMeetings(upcoming?: boolean) {
  return useQuery<Meeting[]>({
    queryKey: ["meetings", upcoming],
    queryFn: async () => {
      const url = upcoming
        ? `${BASE}/api/meetings?upcoming=true`
        : `${BASE}/api/meetings`;
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load meetings");
      return r.json();
    },
  });
}

function MeetingCard({ meeting }: { meeting: Meeting }) {
  const date = new Date(meeting.date);
  const isPast = date < new Date();

  return (
    <Link href={`/meetings/${meeting.id}`}>
      <div className={cn(
        "bg-card border border-border rounded-2xl p-4 flex gap-3 active:scale-[0.98] transition-transform",
        isPast && "opacity-70"
      )}>
        {/* Date column */}
        <div className="flex flex-col items-center justify-center min-w-[48px] h-14 rounded-xl bg-primary/10 text-primary">
          <span className="text-[10px] font-bold uppercase tracking-widest">
            {date.toLocaleString("default", { month: "short" })}
          </span>
          <span className="text-xl font-black leading-none">{date.getDate()}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={cn(
              "text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
              TYPE_COLORS[meeting.type as MeetingType] ?? "bg-muted text-muted-foreground"
            )}>
              {TYPE_LABELS[meeting.type as MeetingType] ?? meeting.type}
            </span>
            {meeting.minutesPublished === "published" && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                Minutes ✓
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-foreground truncate">{meeting.title}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="w-3 h-3" />
              {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            {meeting.location && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground truncate">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{meeting.location}</span>
              </span>
            )}
          </div>
        </div>

        <ChevronRight className="w-4 h-4 text-muted-foreground self-center shrink-0" />
      </div>
    </Link>
  );
}

export default function Meetings() {
  const { can } = usePermissions();
  const [tab, setTab] = useState<"upcoming" | "all">("upcoming");

  const upcomingQ = useMeetings(true);
  const allQ = useMeetings(false);

  const isLoading = tab === "upcoming" ? upcomingQ.isLoading : allQ.isLoading;
  const meetings = tab === "upcoming" ? (upcomingQ.data ?? []) : (allQ.data ?? []);

  const upcoming = meetings.filter((m) => new Date(m.date) >= new Date());
  const past = meetings.filter((m) => new Date(m.date) < new Date());

  return (
    <MobileLayout>
      <div className="px-4 pt-4 pb-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-black text-foreground tracking-tight">Meetings</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Unionize</p>
          </div>
          {can("meetings.manage") && (
            <Link href="/meetings/new">
              <button className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold shadow-lg shadow-primary/30 active:scale-95 transition-transform">
                <Plus className="w-4 h-4" />
                Schedule
              </button>
            </Link>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-muted rounded-xl p-1">
          {(["upcoming", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 py-2 rounded-lg text-xs font-bold transition-all",
                tab === t
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "upcoming" ? "Upcoming" : "All Meetings"}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : meetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
              <GanttChartSquare className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-muted-foreground">
              {tab === "upcoming" ? "No upcoming meetings scheduled" : "No meetings yet"}
            </p>
            {can("meetings.manage") && (
              <Link href="/meetings/new">
                <button className="mt-1 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold">
                  Schedule First Meeting
                </button>
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {tab === "all" && upcoming.length > 0 && (
              <>
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1">Upcoming</h2>
                {upcoming.map((m) => <MeetingCard key={m.id} meeting={m} />)}
                {past.length > 0 && (
                  <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1 pt-2">Past</h2>
                )}
              </>
            )}
            {tab === "upcoming"
              ? meetings.map((m) => <MeetingCard key={m.id} meeting={m} />)
              : past.map((m) => <MeetingCard key={m.id} meeting={m} />)
            }
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
