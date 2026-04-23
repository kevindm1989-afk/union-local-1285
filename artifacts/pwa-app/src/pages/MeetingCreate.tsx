import { useState } from "react";
import { useLocation } from "wouter";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { ArrowLeft } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const MEETING_TYPES = [
  { value: "general", label: "General Membership" },
  { value: "executive", label: "Executive Board" },
  { value: "stewards", label: "Stewards Council" },
];

export default function MeetingCreate() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState({
    title: "",
    type: "general",
    date: "",
    time: "18:00",
    location: "",
    agenda: "",
  });
  const [saving, setSaving] = useState(false);

  const set = (field: string, value: string) =>
    setForm((p) => ({ ...p, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.date) {
      toast({ title: "Title and date are required", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const dateTime = new Date(`${form.date}T${form.time}:00`).toISOString();
      const r = await fetch(`${BASE}/api/meetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: form.title,
          type: form.type,
          date: dateTime,
          location: form.location || null,
          agenda: form.agenda || null,
        }),
      });

      if (!r.ok) throw new Error("Failed to create meeting");
      const meeting = await r.json();
      qc.invalidateQueries({ queryKey: ["meetings"] });
      toast({ title: "Meeting scheduled" });
      navigate(`/meetings/${meeting.id}`);
    } catch {
      toast({ title: "Failed to schedule meeting", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <MobileLayout>
      <div className="px-4 pt-4 pb-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/meetings">
            <button className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <div>
            <h1 className="text-lg font-black text-foreground">Schedule Meeting</h1>
            <p className="text-xs text-muted-foreground">Unionize</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              Meeting Title *
            </label>
            <input
              className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g. Monthly General Meeting"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              Meeting Type
            </label>
            <select
              className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              value={form.type}
              onChange={(e) => set("type", e.target.value)}
            >
              {MEETING_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Date *
              </label>
              <input
                type="date"
                className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Time
              </label>
              <input
                type="time"
                className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                value={form.time}
                onChange={(e) => set("time", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              Location
            </label>
            <input
              className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g. Union Hall, Room 101"
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              Agenda
            </label>
            <textarea
              className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              rows={6}
              placeholder="1. Call to order&#10;2. Approval of previous minutes&#10;3. Officer reports&#10;4. Old business&#10;5. New business&#10;6. Adjournment"
              value={form.agenda}
              onChange={(e) => set("agenda", e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-lg shadow-primary/30 disabled:opacity-50 active:scale-[0.98] transition-transform"
          >
            {saving ? "Scheduling..." : "Schedule Meeting"}
          </button>
        </form>
      </div>
    </MobileLayout>
  );
}
