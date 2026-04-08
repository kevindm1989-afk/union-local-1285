import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2, ShieldCheck, CheckCircle, ChevronLeft, ChevronRight,
  User, Mail, Phone, Briefcase, Clock, MessageSquare, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Shift = "days" | "afternoons" | "nights" | "rotating";
type RequestedRole = "member" | "steward" | "co_chair";

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  employeeId: string;
  department: string;
  shift: Shift | "";
  requestedRole: RequestedRole;
  roleJustification: string;
  message: string;
}

const SHIFTS: { value: Shift; label: string }[] = [
  { value: "days", label: "Days" },
  { value: "afternoons", label: "Afternoons" },
  { value: "nights", label: "Nights" },
  { value: "rotating", label: "Rotating" },
];

const ROLES: { value: RequestedRole; label: string; desc: string }[] = [
  { value: "member", label: "Member", desc: "I am a bargaining unit member" },
  { value: "steward", label: "Steward", desc: "I am an elected union steward" },
  { value: "co_chair", label: "Co-Chair", desc: "I am a committee co-chair" },
];

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export default function RequestAccess() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<FormState>({
    firstName: "", lastName: "", email: "", phone: "",
    employeeId: "", department: "", shift: "",
    requestedRole: "member", roleJustification: "",
    message: "",
  });

  const set = (k: keyof FormState, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const needsJustification = form.requestedRole === "steward" || form.requestedRole === "co_chair";

  const step1Valid = form.firstName.trim().length > 0 && form.lastName.trim().length > 0 && isValidEmail(form.email);
  const step2Valid = !needsJustification || form.roleJustification.trim().length > 10;
  const canSubmit = step1Valid && step2Valid;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      const body: Record<string, string> = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        requestedRole: form.requestedRole,
      };
      if (form.phone.trim()) body.phone = form.phone.trim();
      if (form.employeeId.trim()) body.employeeId = form.employeeId.trim();
      if (form.department.trim()) body.department = form.department.trim();
      if (form.shift) body.shift = form.shift;
      if (needsJustification && form.roleJustification.trim()) body.roleJustification = form.roleJustification.trim();
      if (form.message.trim()) body.message = form.message.trim();

      const res = await fetch(`${BASE}/api/access-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) {
          setError("Too many requests. Please try again in an hour.");
        } else if (res.status === 409) {
          setError(data.error ?? "An account with this email already exists or is pending review.");
        } else if (res.status === 422) {
          const detail = data.details?.[0]?.message ?? data.error ?? "Please check your information and try again.";
          setError(detail);
        } else {
          setError(data.error ?? "Something went wrong. Please try again.");
        }
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-background p-6">
        <div className="w-full max-w-[380px] text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Request Submitted</h1>
            <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
              Your request has been submitted. An administrator will review it and contact you shortly.
              You'll receive an email at <strong>{form.email}</strong> once it's been processed.
            </p>
          </div>
          <a
            href={BASE + "/"}
            className="flex w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold text-sm items-center justify-center hover:bg-primary/90 transition-colors"
          >
            Back to Sign In
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <a
          href={BASE + "/"}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-card border border-border shadow-sm"
        >
          <ChevronLeft className="w-4 h-4" />
        </a>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-extrabold leading-none text-foreground">Union Local</p>
            <p className="text-[10px] text-muted-foreground">Membership Request</p>
          </div>
        </div>
        {/* Step indicator */}
        <div className="ml-auto flex items-center gap-1.5">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={cn(
                "h-1.5 rounded-full transition-all",
                s === step ? "w-6 bg-primary" : s < step ? "w-3 bg-primary/40" : "w-3 bg-muted"
              )}
            />
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 max-w-[480px] w-full mx-auto">

        {/* ── Step 1: Personal Information ───────────────────────────── */}
        {step === 1 && (
          <>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-foreground">Personal Information</h2>
              <p className="text-sm text-muted-foreground mt-1">Your contact details so we can reach you.</p>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">First Name *</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)}
                      placeholder="Jane" className="h-12 rounded-xl bg-card pl-9" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Last Name *</label>
                  <Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)}
                    placeholder="Smith" className="h-12 rounded-xl bg-card" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email Address *</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                    placeholder="jane@example.com" className="h-12 rounded-xl bg-card pl-9"
                    autoCapitalize="none" inputMode="email" />
                </div>
                <p className="text-[11px] text-muted-foreground pl-1">You'll receive your login credentials at this address.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Phone (optional)</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)}
                    placeholder="(555) 123-4567" className="h-12 rounded-xl bg-card pl-9" inputMode="tel" />
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Step 2: Employment & Role ────────────────────────────────── */}
        {step === 2 && (
          <>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-foreground">Employment & Role</h2>
              <p className="text-sm text-muted-foreground mt-1">Your workplace details and union role.</p>
            </div>
            <div className="space-y-4">
              {/* Employee info */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Employee ID (optional)</label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input value={form.employeeId} onChange={(e) => set("employeeId", e.target.value)}
                      placeholder="EMP-12345" className="h-12 rounded-xl bg-card pl-9 font-mono" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Department (optional)</label>
                  <Input value={form.department} onChange={(e) => set("department", e.target.value)}
                    placeholder="Assembly, Maintenance, Shipping..." className="h-12 rounded-xl bg-card" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Shift (optional)</label>
                  <div className="grid grid-cols-2 gap-2">
                    {SHIFTS.map(({ value, label }) => (
                      <button key={value} type="button"
                        onClick={() => set("shift", form.shift === value ? "" : value)}
                        className={cn(
                          "h-11 rounded-xl text-sm font-bold border transition-all",
                          form.shift === value
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card border-border text-muted-foreground hover:border-primary/40"
                        )}
                      >
                        <Clock className="w-3.5 h-3.5 inline mr-1.5" />{label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Role selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  Requested Role *
                </label>
                <div className="space-y-2">
                  {ROLES.map(({ value, label, desc }) => (
                    <button key={value} type="button"
                      onClick={() => set("requestedRole", value)}
                      className={cn(
                        "w-full text-left p-3.5 rounded-xl border transition-all",
                        form.requestedRole === value
                          ? value === "co_chair"
                            ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30"
                            : value === "steward"
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                            : "border-primary bg-primary/5"
                          : "border-border bg-card hover:border-primary/30"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                          form.requestedRole === value ? "border-primary" : "border-muted-foreground/40"
                        )}>
                          {form.requestedRole === value && (
                            <div className="w-2 h-2 rounded-full bg-primary" />
                          )}
                        </div>
                        <div>
                          <p className={cn(
                            "text-sm font-bold",
                            form.requestedRole === value ? "text-foreground" : "text-muted-foreground"
                          )}>
                            {label}
                          </p>
                          <p className="text-xs text-muted-foreground">{desc}</p>
                        </div>
                        {value === "steward" && (
                          <span className="ml-auto text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded">
                            ELECTED
                          </span>
                        )}
                        {value === "co_chair" && (
                          <span className="ml-auto text-[10px] font-bold bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 px-1.5 py-0.5 rounded">
                            OFFICER
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Role justification — conditional */}
              {needsJustification && (
                <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Role Justification *
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Please describe your role and how long you have held it.
                  </p>
                  <textarea
                    value={form.roleJustification}
                    onChange={(e) => set("roleJustification", e.target.value)}
                    placeholder="e.g. I was elected Shop Steward for Unit 4 in January 2023 and have been serving members in the Assembly department since then..."
                    maxLength={2000}
                    rows={4}
                    className="w-full rounded-xl border border-input bg-card px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <div className="flex items-center justify-between">
                    {form.roleJustification.trim().length > 0 && form.roleJustification.trim().length <= 10 && (
                      <p className="text-xs text-destructive">Please provide more detail</p>
                    )}
                    <p className="text-[11px] text-muted-foreground ml-auto">{form.roleJustification.length}/2000</p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Step 3: Review & Submit ──────────────────────────────────── */}
        {step === 3 && (
          <>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-foreground">Review & Submit</h2>
              <p className="text-sm text-muted-foreground mt-1">Confirm your details before submitting.</p>
            </div>

            {/* Summary */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Your Request Summary</p>
              <div className="space-y-1.5">
                <SummaryRow label="Name" value={`${form.firstName} ${form.lastName}`} />
                <SummaryRow label="Email" value={form.email} />
                {form.phone && <SummaryRow label="Phone" value={form.phone} />}
                {form.employeeId && <SummaryRow label="Employee ID" value={form.employeeId} />}
                {form.department && <SummaryRow label="Department" value={form.department} />}
                {form.shift && <SummaryRow label="Shift" value={form.shift.charAt(0).toUpperCase() + form.shift.slice(1)} />}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Requested Role</span>
                  <RoleBadge role={form.requestedRole} />
                </div>
              </div>
            </div>

            {/* Role justification summary */}
            {needsJustification && form.roleJustification && (
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1.5">Role Justification</p>
                <p className="text-sm text-foreground/80 italic leading-relaxed">&ldquo;{form.roleJustification}&rdquo;</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Message (optional)</label>
              <div className="relative">
                <MessageSquare className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground" />
                <textarea
                  value={form.message}
                  onChange={(e) => set("message", e.target.value)}
                  placeholder="Any additional context for the administrator reviewing your request..."
                  maxLength={1000}
                  rows={4}
                  className="w-full rounded-xl border border-input bg-card px-4 py-3 pl-9 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <p className="text-[11px] text-muted-foreground text-right">{form.message.length}/1000</p>
            </div>

            {error && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 text-sm text-destructive font-medium">
                {error}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer nav */}
      <div className="p-4 border-t border-border bg-background space-y-2">
        {error && step < 3 && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 text-sm text-destructive font-medium mb-2">
            {error}
          </div>
        )}
        <div className="flex gap-2.5 max-w-[480px] mx-auto">
          {step > 1 && (
            <Button variant="outline" className="h-12 rounded-xl flex-1 font-bold gap-1"
              onClick={() => setStep((s) => s - 1)} disabled={loading}>
              <ChevronLeft className="w-4 h-4" />Back
            </Button>
          )}
          {step < 3 ? (
            <Button className="h-12 rounded-xl flex-1 font-bold gap-1"
              onClick={() => setStep((s) => s + 1)}
              disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}>
              Continue<ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button className="h-12 rounded-xl flex-1 font-bold"
              onClick={handleSubmit} disabled={loading || !canSubmit}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit Request"}
            </Button>
          )}
        </div>
        {step === 1 && (
          <p className="text-center text-[11px] text-muted-foreground">
            Already have an account?{" "}
            <a href={BASE + "/"} className="font-bold text-primary underline">Sign in</a>
          </p>
        )}
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const label = role === "co_chair" ? "Co-Chair" : role === "steward" ? "Steward" : "Member";
  return (
    <span className={cn(
      "text-[11px] font-bold px-2 py-0.5 rounded",
      role === "co_chair" ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" :
      role === "steward" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
      "bg-muted text-muted-foreground"
    )}>
      {label}
    </span>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground text-right">{value}</span>
    </div>
  );
}
