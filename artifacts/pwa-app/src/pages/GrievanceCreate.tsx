import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLocation, Link } from "wouter";
import { MobileLayout } from "@/components/layout/MobileLayout";
import {
  useCreateGrievance,
  useListMembers,
  getListGrievancesQueryKey,
  getGetGrievancesSummaryQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetRecentActivityQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChevronLeft, Loader2, LayoutTemplate, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface GrievanceTemplate {
  id: number;
  title: string;
  violationType: string;
  descriptionTemplate: string;
  contractArticle: string | null;
  defaultStep: number;
}

interface AiDraftResult {
  suggestedTitle: string;
  suggestedArticles: string;
  suggestedRemedy: string;
  suggestedStep: number;
  draft: string;
}

interface AiIntakeForm {
  whatHappened: string;
  incidentDate: string;
  membersInvolved: string;
  managementInvolved: string;
  department: string;
  grievanceType: string;
}

const VIOLATION_TYPE_COLORS: Record<string, string> = {
  discipline: "bg-red-100 text-red-700 border-red-200",
  seniority_bypass: "bg-purple-100 text-purple-700 border-purple-200",
  scheduling: "bg-blue-100 text-blue-700 border-blue-200",
  wages: "bg-green-100 text-green-700 border-green-200",
  harassment: "bg-orange-100 text-orange-700 border-orange-200",
  benefits: "bg-amber-100 text-amber-700 border-amber-200",
  other: "bg-gray-100 text-gray-700 border-gray-200",
};

const GRIEVANCE_TYPES = [
  { value: "discipline", label: "Discipline / Termination" },
  { value: "seniority_bypass", label: "Seniority Bypass" },
  { value: "wages", label: "Wages / Pay" },
  { value: "scheduling", label: "Scheduling / Hours" },
  { value: "health_safety", label: "Health & Safety" },
  { value: "harassment", label: "Harassment / Bullying" },
  { value: "benefits", label: "Benefits" },
  { value: "accommodation", label: "Accommodation" },
  { value: "other", label: "Other" },
] as const;

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  memberId: z.string().optional(),
  grievanceType: z.string().optional(),
  incidentDate: z.string().optional(),
  remedyRequested: z.string().optional(),
  description: z.string().optional(),
  contractArticle: z.string().optional(),
  step: z.string().default("1"),
  status: z.enum(["open", "pending_response", "pending_hearing", "resolved", "withdrawn"]).default("open"),
  filedDate: z.string().min(1, "Filed date is required"),
  dueDate: z.string().optional(),
  accommodationRequest: z.boolean().default(false),
  notes: z.string().optional(),
});

export default function GrievanceCreate() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createGrievance = useCreateGrievance({
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
  const { data: members } = useListMembers();
  const [showTemplates, setShowTemplates] = useState(false);

  // ── AI Draft state ────────────────────────────────────────────────────────
  const [showAiSheet, setShowAiSheet] = useState(false);
  const [aiPhase, setAiPhase] = useState<"form" | "loading" | "preview">("form");
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AiDraftResult | null>(null);
  const [editableDraft, setEditableDraft] = useState("");
  const [isApprovingDraft, setIsApprovingDraft] = useState(false);
  const [aiIntake, setAiIntake] = useState<AiIntakeForm>({
    whatHappened: "",
    incidentDate: "",
    membersInvolved: "",
    managementInvolved: "",
    department: "",
    grievanceType: "",
  });

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("grievance_prefill");
      if (!raw) return;
      sessionStorage.removeItem("grievance_prefill");
      const prefill = JSON.parse(raw);
      if (prefill._fromDetector) {
        setAiIntake((prev) => ({
          ...prev,
          whatHappened: prefill.whatHappened ?? prev.whatHappened,
          incidentDate: prefill.incidentDate ?? prev.incidentDate,
          membersInvolved: prefill.membersInvolved ?? prev.membersInvolved,
          department: prefill.department ?? prev.department,
          grievanceType: prefill.grievanceType ?? prev.grievanceType,
        }));
        setShowAiSheet(true);
      }
    } catch {}
  }, []);

  const resetAiSheet = () => {
    setAiPhase("form");
    setAiError(null);
    setAiResult(null);
    setEditableDraft("");
    setAiIntake({ whatHappened: "", incidentDate: "", membersInvolved: "", managementInvolved: "", department: "", grievanceType: "" });
  };

  const handleAiGenerate = async () => {
    if (aiIntake.whatHappened.trim().length < 10) {
      setAiError("Please describe what happened in at least 10 characters.");
      return;
    }
    setAiError(null);
    setAiPhase("loading");
    try {
      const res = await fetch("/api/grievances/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(aiIntake),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || `Request failed (${res.status})`);
      }
      const data: AiDraftResult = await res.json();
      setAiResult(data);
      setEditableDraft(data.draft);
      setAiPhase("preview");
    } catch (e: any) {
      setAiError(e.message || "Failed to generate draft. Please try again.");
      setAiPhase("form");
    }
  };

  const handleApproveAndSubmit = async () => {
    if (!aiResult) return;
    setIsApprovingDraft(true);
    try {
      createGrievance.mutate({
        data: {
          title: aiResult.suggestedTitle || aiIntake.whatHappened.slice(0, 80),
          memberId: null,
          grievanceType: aiIntake.grievanceType || null,
          incidentDate: aiIntake.incidentDate || null,
          remedyRequested: aiResult.suggestedRemedy || null,
          description: editableDraft,
          contractArticle: aiResult.suggestedArticles || null,
          step: aiResult.suggestedStep ?? 1,
          status: "open",
          filedDate: todayStr,
          dueDate: null,
          notes: `AI-drafted grievance. Original incident description: ${aiIntake.whatHappened}`,
          accommodationRequest: false,
        } as any,
      });
    } finally {
      setIsApprovingDraft(false);
    }
  };

  const { data: templates = [] } = useQuery<GrievanceTemplate[]>({
    queryKey: ["grievance-templates"],
    queryFn: () => fetch("/api/grievance-templates", { credentials: "include" }).then((r) => r.json()),
    staleTime: 5 * 60_000,
  });

  const todayStr = new Date().toISOString().split("T")[0];

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      memberId: "",
      grievanceType: "",
      incidentDate: "",
      remedyRequested: "",
      description: "",
      contractArticle: "",
      step: "1",
      status: "open",
      filedDate: todayStr,
      dueDate: "",
      notes: "",
      accommodationRequest: false,
    },
  });

  const applyTemplate = (t: GrievanceTemplate) => {
    form.setValue("title", t.title);
    form.setValue("description", t.descriptionTemplate);
    if (t.contractArticle) form.setValue("contractArticle", t.contractArticle);
    form.setValue("step", String(t.defaultStep));
    setShowTemplates(false);
  };

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createGrievance.mutate({
      data: {
        title: values.title,
        memberId: values.memberId && values.memberId !== "none" ? parseInt(values.memberId) : null,
        grievanceType: values.grievanceType || null,
        incidentDate: values.incidentDate || null,
        remedyRequested: values.remedyRequested || null,
        description: values.description || null,
        contractArticle: values.contractArticle || null,
        step: parseInt(values.step),
        status: values.status,
        filedDate: values.filedDate,
        dueDate: values.dueDate || null,
        notes: values.notes || null,
        accommodationRequest: values.accommodationRequest,
      } as any,
    });
  };

  return (
    <MobileLayout>
      <div className="min-h-full flex flex-col bg-background">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 h-14 flex items-center justify-between">
          <Link href="/grievances" className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <span className="font-bold tracking-tight text-sm uppercase">File Grievance</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { resetAiSheet(); setShowAiSheet(true); }}
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors px-2 py-1 rounded-lg hover:bg-primary/5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI Draft
            </button>
            <button
              onClick={() => setShowTemplates(true)}
              className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted/50"
            >
              <LayoutTemplate className="w-3.5 h-3.5" />
              Templates
            </button>
          </div>
        </header>

        <div className="p-5 flex-1">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Grievance Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Brief description of the violation" className="h-12 rounded-xl bg-card" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="memberId" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Member (optional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-12 rounded-xl bg-card">
                        <SelectValue placeholder="General / Class grievance" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="none">General / Class Grievance</SelectItem>
                      {members?.map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="grievanceType" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-12 rounded-xl bg-card">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-xl">
                        {GRIEVANCE_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="incidentDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Incident Date</FormLabel>
                    <FormControl>
                      <Input type="date" className="h-12 rounded-xl bg-card" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="contractArticle" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Contract Article Violated</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Article 12, Section 4" className="h-12 rounded-xl bg-card" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Describe the violation in detail..." className="min-h-[100px] rounded-xl bg-card resize-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="step" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Step</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-12 rounded-xl bg-card">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="1">Step 1</SelectItem>
                        <SelectItem value="2">Step 2</SelectItem>
                        <SelectItem value="3">Step 3</SelectItem>
                        <SelectItem value="4">Step 4</SelectItem>
                        <SelectItem value="5">Step 5 — Arbitration</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-12 rounded-xl bg-card">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="pending_response">Pending Response</SelectItem>
                        <SelectItem value="pending_hearing">Pending Hearing</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="withdrawn">Withdrawn</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="filedDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Filed Date</FormLabel>
                    <FormControl>
                      <Input type="date" className="h-12 rounded-xl bg-card" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="dueDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Response Due</FormLabel>
                    <FormControl>
                      <Input type="date" className="h-12 rounded-xl bg-card" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="remedyRequested" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Remedy Requested</FormLabel>
                  <FormControl>
                    <Textarea placeholder="What remedy is the member seeking? (e.g. reinstatement, back pay, written apology...)" className="min-h-[70px] rounded-xl bg-card resize-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Steward Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Internal notes, witnesses, evidence..." className="min-h-[80px] rounded-xl bg-card resize-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="accommodationRequest" render={({ field }) => (
                <FormItem className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      id="accommodationRequest"
                    />
                  </FormControl>
                  <div>
                    <FormLabel htmlFor="accommodationRequest" className="text-sm font-semibold cursor-pointer">
                      ADA / Accommodation Request
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">Member has a disability accommodation involved</p>
                  </div>
                </FormItem>
              )} />

              <div className="pt-4">
                <Button type="submit" className="w-full h-14 rounded-xl text-base font-bold" disabled={createGrievance.isPending}>
                  {createGrievance.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "File Grievance"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>

      {/* ── AI Grievance Drafting Sheet ─────────────────────────────────────── */}
      <Sheet open={showAiSheet} onOpenChange={(open) => { setShowAiSheet(open); if (!open) resetAiSheet(); }}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[92dvh] flex flex-col p-0">
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div>
                <SheetTitle className="text-base">AI Grievance Drafting Assistant</SheetTitle>
                <p className="text-xs text-muted-foreground">Powered by Gemini · Unifor Local 1285</p>
              </div>
            </div>
            {aiPhase === "preview" && (
              <div className="flex items-center gap-1.5 mt-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">This is an AI draft — steward must review and approve before filing.</p>
              </div>
            )}
          </SheetHeader>

          <div className="overflow-y-auto flex-1 px-5 py-4">
            {/* Phase: Intake Form */}
            {(aiPhase === "form" || aiPhase === "loading") && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                    What happened? <span className="text-destructive">*</span>
                  </label>
                  <Textarea
                    placeholder="Describe the incident in plain language — what occurred, when, and why it's a violation of the collective agreement..."
                    className="min-h-[110px] rounded-xl bg-card resize-none"
                    value={aiIntake.whatHappened}
                    onChange={(e) => setAiIntake(p => ({ ...p, whatHappened: e.target.value }))}
                    disabled={aiPhase === "loading"}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Date of Incident</label>
                    <Input
                      type="date"
                      className="h-11 rounded-xl bg-card"
                      value={aiIntake.incidentDate}
                      onChange={(e) => setAiIntake(p => ({ ...p, incidentDate: e.target.value }))}
                      disabled={aiPhase === "loading"}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Grievance Type</label>
                    <Select value={aiIntake.grievanceType} onValueChange={(v) => setAiIntake(p => ({ ...p, grievanceType: v }))} disabled={aiPhase === "loading"}>
                      <SelectTrigger className="h-11 rounded-xl bg-card">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {GRIEVANCE_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Member(s) Involved</label>
                  <Input
                    placeholder="e.g. Jane Smith, Employee #4521"
                    className="h-11 rounded-xl bg-card"
                    value={aiIntake.membersInvolved}
                    onChange={(e) => setAiIntake(p => ({ ...p, membersInvolved: e.target.value }))}
                    disabled={aiPhase === "loading"}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Management Involved</label>
                  <Input
                    placeholder="e.g. Supervisor John Doe, Plant Manager"
                    className="h-11 rounded-xl bg-card"
                    value={aiIntake.managementInvolved}
                    onChange={(e) => setAiIntake(p => ({ ...p, managementInvolved: e.target.value }))}
                    disabled={aiPhase === "loading"}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">Department / Shift</label>
                  <Input
                    placeholder="e.g. Assembly Line B, Night Shift"
                    className="h-11 rounded-xl bg-card"
                    value={aiIntake.department}
                    onChange={(e) => setAiIntake(p => ({ ...p, department: e.target.value }))}
                    disabled={aiPhase === "loading"}
                  />
                </div>

                {aiError && (
                  <div className="flex items-start gap-2 px-3 py-2.5 bg-destructive/10 border border-destructive/20 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-destructive">{aiError}</p>
                  </div>
                )}

                <Button
                  className="w-full h-12 rounded-xl font-bold text-sm gap-2"
                  onClick={handleAiGenerate}
                  disabled={aiPhase === "loading" || aiIntake.whatHappened.trim().length < 10}
                >
                  {aiPhase === "loading" ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Drafting grievance…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Generate Draft
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Phase: Draft Preview */}
            {aiPhase === "preview" && aiResult && (
              <div className="space-y-4">
                {/* Suggested metadata */}
                <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
                  <div className="px-4 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Suggested Title</p>
                    <p className="text-sm font-semibold text-foreground">{aiResult.suggestedTitle}</p>
                  </div>
                  {aiResult.suggestedArticles && (
                    <div className="px-4 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Articles Violated</p>
                      <p className="text-sm text-foreground">{aiResult.suggestedArticles}</p>
                    </div>
                  )}
                  {aiResult.suggestedRemedy && (
                    <div className="px-4 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Remedy Sought</p>
                      <p className="text-sm text-foreground">{aiResult.suggestedRemedy}</p>
                    </div>
                  )}
                  <div className="px-4 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Step</p>
                    <p className="text-sm text-foreground">Step {aiResult.suggestedStep}</p>
                  </div>
                </div>

                {/* Editable draft body */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Grievance Draft</p>
                    <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-700">Draft</span>
                  </div>
                  <Textarea
                    className="min-h-[280px] rounded-xl bg-card resize-none text-sm font-mono leading-relaxed"
                    value={editableDraft}
                    onChange={(e) => setEditableDraft(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1.5">You may edit this draft before approving. All changes are yours — the AI will not re-generate.</p>
                </div>

                <div className="grid grid-cols-2 gap-3 pb-2">
                  <Button
                    variant="outline"
                    className="h-12 rounded-xl font-semibold"
                    onClick={() => setAiPhase("form")}
                  >
                    ← Revise Input
                  </Button>
                  <Button
                    className="h-12 rounded-xl font-bold gap-2 bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleApproveAndSubmit}
                    disabled={isApprovingDraft || createGrievance.isPending || !editableDraft.trim()}
                  >
                    {(isApprovingDraft || createGrievance.isPending) ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    Approve & File
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Templates Sheet */}
      <Sheet open={showTemplates} onOpenChange={setShowTemplates}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Grievance Templates</SheetTitle>
          </SheetHeader>
          <p className="text-xs text-muted-foreground mt-1 mb-4">Select a template to pre-fill the form. You can edit after applying.</p>
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No templates available.</p>
          ) : (
            <div className="space-y-2.5 pb-6">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t)}
                  className="w-full text-left p-4 rounded-xl bg-card border border-border hover:bg-muted/50 active:scale-[0.98] transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground">{t.title}</p>
                      {t.contractArticle && (
                        <p className="text-xs text-muted-foreground mt-0.5">{t.contractArticle}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
                        {t.descriptionTemplate}
                      </p>
                    </div>
                    <span className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border flex-shrink-0 mt-0.5", VIOLATION_TYPE_COLORS[t.violationType] ?? VIOLATION_TYPE_COLORS.other)}>
                      {t.violationType.replace(/_/g, " ")}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </MobileLayout>
  );
}
