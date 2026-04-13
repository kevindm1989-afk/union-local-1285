import { Router } from "express";
import { db, grievancesTable, membersTable, localSettingsTable, grievanceNotesTable, usersTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requirePermission, requireSteward } from "../lib/permissions";
import { logAudit } from "../lib/auditLog";
import {
  sendGrievanceFiledNotification,
  sendGrievanceStatusNotification,
} from "../lib/email";
import {
  CreateGrievanceBody,
  UpdateGrievanceBody,
  ListGrievancesQueryParams,
  GetGrievanceParams,
  UpdateGrievanceParams,
  DeleteGrievanceParams,
} from "@workspace/api-zod";
import { asyncHandler } from "../lib/asyncHandler";
import { ai } from "../lib/gemini/client";
import { GEMINI_MODEL, GEMINI_MAX_TOKENS } from "../lib/anthropic/constants";
// @ts-ignore — .txt imported via esbuild text loader
import cbaText from "../data/cba.txt";

const router = Router();

// ─── helpers ──────────────────────────────────────────────────────────────────

async function lookupMemberName(memberId: number | null | undefined): Promise<string | null> {
  if (!memberId) return null;
  const [m] = await db.select({ name: membersTable.name }).from(membersTable).where(eq(membersTable.id, memberId));
  return m?.name ?? null;
}

async function getDeadlineDays(step: number): Promise<number> {
  const defaults: Record<number, number> = { 1: 5, 2: 10, 3: 15, 4: 20, 5: 30 };
  try {
    const key = `grievance_deadline_step_${step}`;
    const [row] = await db
      .select({ value: localSettingsTable.value })
      .from(localSettingsTable)
      .where(eq(localSettingsTable.key, key));
    if (row) return parseInt(row.value, 10) || defaults[step] || 30;
  } catch {
    // fall through to default
  }
  return defaults[step] ?? 30;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

const TERMINAL_STATUSES = ["resolved", "withdrawn"] as const;

function isOverdue(g: typeof grievancesTable.$inferSelect): boolean {
  if (!g.dueDate) return false;
  if ((TERMINAL_STATUSES as readonly string[]).includes(g.status)) return false;
  return new Date(g.dueDate) < new Date(new Date().toISOString().split("T")[0]);
}

function formatGrievance(g: typeof grievancesTable.$inferSelect, memberName?: string | null) {
  return {
    id: g.id,
    grievanceNumber: g.grievanceNumber,
    memberId: g.memberId ?? null,
    memberName: memberName ?? null,
    title: g.title,
    description: g.description ?? null,
    contractArticle: g.contractArticle ?? null,
    step: g.step,
    status: g.status,
    accommodationRequest: g.accommodationRequest ?? false,
    grievanceType: g.grievanceType ?? null,
    incidentDate: g.incidentDate ?? null,
    remedyRequested: g.remedyRequested ?? null,
    outcome: g.outcome ?? "pending",
    filedDate: g.filedDate,
    dueDate: g.dueDate ?? null,
    resolvedDate: g.resolvedDate ?? null,
    resolution: g.resolution ?? null,
    notes: g.notes ?? null,
    isOverdue: isOverdue(g),
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}

function generateGrievanceNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `GRV-${year}-${rand}`;
}

// ─── routes ───────────────────────────────────────────────────────────────────

const GRIEVANCE_DRAFT_SYSTEM_PROMPT = `You are a formal grievance drafting assistant for Unifor Local 1285, a Canadian union operating under Ontario labor law. When given a description of a workplace incident, draft a formal grievance that includes: a clear statement of the grievance, the specific collective agreement articles violated, the just cause principles breached, the remedy sought, and the procedural step (Step 1, Step 2, or Arbitration). Always use formal union grievance language. Never file or send anything — output is a draft for steward review only.

You have access to the collective agreement text. Reference specific article numbers wherever possible. Structure the grievance formally with labelled sections. Respond only with a JSON object — no markdown, no backticks.`;

router.post("/draft", requirePermission("grievances.view"), asyncHandler(async (req, res) => {
  const { whatHappened, incidentDate, membersInvolved, managementInvolved, department, grievanceType } = req.body;

  if (!whatHappened || typeof whatHappened !== "string" || whatHappened.trim().length < 10) {
    res.status(400).json({ error: "whatHappened must be at least 10 characters" });
    return;
  }

  const userPrompt = `Please draft a formal Unifor grievance based on the following incident:

WHAT HAPPENED: ${whatHappened.trim()}
DATE OF INCIDENT: ${incidentDate || "Not specified"}
MEMBER(S) INVOLVED: ${membersInvolved || "Not specified"}
MANAGEMENT INVOLVED: ${managementInvolved || "Not specified"}
DEPARTMENT / SHIFT: ${department || "Not specified"}
GRIEVANCE TYPE: ${grievanceType || "Not specified"}

COLLECTIVE AGREEMENT TEXT FOR REFERENCE:
${cbaText}

Respond with a JSON object using exactly these keys:
{
  "suggestedTitle": "A concise grievance title (max 80 chars)",
  "suggestedArticles": "Comma-separated CBA article references violated",
  "suggestedRemedy": "The remedy sought in formal language",
  "suggestedStep": 1,
  "draft": "The full formal grievance text with labelled sections: STATEMENT OF GRIEVANCE, ARTICLES VIOLATED, JUST CAUSE PRINCIPLES BREACHED, REMEDY SOUGHT, PROCEDURAL STEP"
}`;

  const result = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction: GRIEVANCE_DRAFT_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      maxOutputTokens: GEMINI_MAX_TOKENS,
    },
  });

  const text = result.text ?? "";

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    res.status(502).json({ error: "AI returned an unparseable response. Please try again." });
    return;
  }

  res.json({
    suggestedTitle: parsed.suggestedTitle ?? "",
    suggestedArticles: parsed.suggestedArticles ?? "",
    suggestedRemedy: parsed.suggestedRemedy ?? "",
    suggestedStep: parsed.suggestedStep ?? 1,
    draft: parsed.draft ?? "",
  });
}));

const VIOLATION_DETECTOR_SYSTEM_PROMPT = `You are a contract violation analysis assistant for Unifor Local 1285 operating under Ontario labor law and the Unifor collective agreement. When given a description of a workplace situation, analyze it against the collective agreement and identify: 1) Which specific articles may have been violated, 2) The severity of the violation (Minor, Moderate, Serious, Critical), 3) A plain language explanation of why each article applies, 4) Recommended next steps (Informal Resolution, File Grievance, or Escalate Immediately), 5) Whether Ontario ESA or Unifor national policy is also implicated. Be precise and cite specific article numbers. Always clarify this is an analysis to assist the steward, not legal advice. Respond only with a JSON object — no markdown, no backticks.`;

router.post("/detect", requirePermission("grievances.view"), asyncHandler(async (req, res) => {
  const { whatHappened, date, affected, department } = req.body;

  if (!whatHappened || typeof whatHappened !== "string" || whatHappened.trim().length < 10) {
    res.status(400).json({ error: "Please describe what happened in at least 10 characters." });
    return;
  }

  const userPrompt = `Analyze the following workplace situation against the collective agreement and Ontario labor law:

SITUATION: ${whatHappened.trim()}
DATE: ${date || "Not specified"}
AFFECTED: ${affected || "Not specified"}
DEPARTMENT / SHIFT: ${department || "Not specified"}

COLLECTIVE AGREEMENT TEXT FOR REFERENCE:
${cbaText}

Respond with a JSON object using exactly these keys:
{
  "severity": "Minor" | "Moderate" | "Serious" | "Critical",
  "summary": "1-2 sentence plain language overview of the potential violation",
  "articles": [
    {
      "number": "Article X.Y",
      "title": "Article title or subject",
      "explanation": "Plain language explanation of why this article applies to the situation"
    }
  ],
  "nextSteps": "Informal Resolution" | "File Grievance" | "Escalate Immediately",
  "nextStepsRationale": "Plain language explanation of why this next step is recommended",
  "esaImplicated": true | false,
  "esaDetails": "Description of relevant Ontario ESA provisions, or null if not implicated",
  "uniforPolicyImplicated": true | false,
  "uniforPolicyDetails": "Description of relevant Unifor national policy, or null if not implicated"
}`;

  const result = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction: VIOLATION_DETECTOR_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      maxOutputTokens: GEMINI_MAX_TOKENS,
    },
  });

  const text = result.text ?? "";

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    res.status(502).json({ error: "AI returned an unparseable response. Please try again." });
    return;
  }

  const articles = Array.isArray(parsed.articles)
    ? parsed.articles.map((a: any) => ({
        number: a.number ?? "",
        title: a.title ?? "",
        explanation: a.explanation ?? "",
      }))
    : [];

  res.json({
    severity: parsed.severity ?? "Minor",
    summary: parsed.summary ?? "",
    articles,
    nextSteps: parsed.nextSteps ?? "Informal Resolution",
    nextStepsRationale: parsed.nextStepsRationale ?? "",
    esaImplicated: parsed.esaImplicated === true,
    esaDetails: parsed.esaDetails ?? null,
    uniforPolicyImplicated: parsed.uniforPolicyImplicated === true,
    uniforPolicyDetails: parsed.uniforPolicyDetails ?? null,
  });
}));

router.get("/", asyncHandler(async (req, res) => {
  const parsed = ListGrievancesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }

  const { status, step, memberId } = parsed.data;
  const conditions = [];
  if (status) conditions.push(eq(grievancesTable.status, status));
  if (step !== undefined) conditions.push(eq(grievancesTable.step, step));
  if (memberId !== undefined) conditions.push(eq(grievancesTable.memberId, memberId));

  const grievances = await db
    .select()
    .from(grievancesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(grievancesTable.filedDate));

  const withNames = await Promise.all(
    grievances.map(async (g) => {
      const name = await lookupMemberName(g.memberId);
      return formatGrievance(g, name);
    }),
  );

  res.json(withNames);
}));

router.post("/", requirePermission("grievances.file"), asyncHandler(async (req, res) => {
  const parsed = CreateGrievanceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const d = parsed.data;
  const step = d.step ?? 1;

  // Auto-calculate due_date from local_settings if not provided
  let dueDate = d.dueDate ? new Date(d.dueDate as unknown as string).toISOString().split("T")[0] : null;
  if (!dueDate && d.filedDate) {
    const days = await getDeadlineDays(step);
    const filedStr = new Date(d.filedDate as unknown as string).toISOString().split("T")[0];
    dueDate = addDays(filedStr, days);
  }

  const [grievance] = await db
    .insert(grievancesTable)
    .values({
      grievanceNumber: generateGrievanceNumber(),
      memberId: d.memberId ?? null,
      title: d.title,
      description: d.description ?? null,
      contractArticle: d.contractArticle ?? null,
      step,
      status: d.status ?? "open",
      filedDate: new Date(d.filedDate as unknown as string).toISOString().split("T")[0],
      dueDate,
      notes: d.notes ?? null,
      accommodationRequest: (d as Record<string, unknown>).accommodationRequest as boolean ?? false,
      grievanceType: (d as Record<string, unknown>).grievanceType as string ?? null,
      incidentDate: (d as Record<string, unknown>).incidentDate
        ? new Date((d as Record<string, unknown>).incidentDate as string).toISOString().split("T")[0]
        : null,
      remedyRequested: (d as Record<string, unknown>).remedyRequested as string ?? null,
      outcome: (d as Record<string, unknown>).outcome as string ?? "pending",
    })
    .returning();

  await logAudit(req, "create", "grievance", grievance.id, null, formatGrievance(grievance));

  const memberName = await lookupMemberName(grievance.memberId);

  // Fire-and-forget notification
  sendGrievanceFiledNotification({
    grievanceId: grievance.id,
    grievanceNumber: grievance.grievanceNumber,
    title: grievance.title,
    memberName,
    step: grievance.step,
    dueDate: grievance.dueDate ?? null,
    isAda: grievance.accommodationRequest ?? false,
  }).catch(() => undefined);

  res.status(201).json(formatGrievance(grievance, memberName));
}));

router.get("/stats/summary", requireSteward, asyncHandler(async (_req, res) => {
  const today = new Date().toISOString().split("T")[0];

  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where status = 'open')::int`,
      pending_response: sql<number>`count(*) filter (where status = 'pending_response')::int`,
      pending_hearing: sql<number>`count(*) filter (where status = 'pending_hearing')::int`,
      resolved: sql<number>`count(*) filter (where status = 'resolved')::int`,
      withdrawn: sql<number>`count(*) filter (where status = 'withdrawn')::int`,
      overdue: sql<number>`count(*) filter (where due_date < ${today} and status not in ('resolved','withdrawn'))::int`,
      step1: sql<number>`count(*) filter (where step = 1)::int`,
      step2: sql<number>`count(*) filter (where step = 2)::int`,
      step3: sql<number>`count(*) filter (where step = 3)::int`,
      step4: sql<number>`count(*) filter (where step = 4)::int`,
      step5: sql<number>`count(*) filter (where step = 5)::int`,
      accommodation: sql<number>`count(*) filter (where accommodation_request = true)::int`,
    })
    .from(grievancesTable);

  res.json(row);
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const parsed = GetGrievanceParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [grievance] = await db
    .select()
    .from(grievancesTable)
    .where(eq(grievancesTable.id, parsed.data.id));

  if (!grievance) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const memberName = await lookupMemberName(grievance.memberId);
  res.json(formatGrievance(grievance, memberName));
}));

router.patch("/:id", requirePermission("grievances.file"), asyncHandler(async (req, res) => {
  const paramParsed = UpdateGrievanceParams.safeParse({ id: Number(req.params.id) });
  if (!paramParsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const bodyParsed = UpdateGrievanceBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const [existing] = await db
    .select()
    .from(grievancesTable)
    .where(eq(grievancesTable.id, paramParsed.data.id));

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const d = bodyParsed.data;
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (d.memberId !== undefined) updates.memberId = d.memberId;
  if (d.title !== undefined) updates.title = d.title;
  if (d.description !== undefined) updates.description = d.description;
  if (d.contractArticle !== undefined) updates.contractArticle = d.contractArticle;
  if (d.status !== undefined) updates.status = d.status;
  if (d.filedDate !== undefined) updates.filedDate = new Date(d.filedDate as unknown as string).toISOString().split("T")[0];
  if (d.resolvedDate !== undefined) updates.resolvedDate = d.resolvedDate ? new Date(d.resolvedDate as unknown as string).toISOString().split("T")[0] : null;
  if (d.resolution !== undefined) updates.resolution = d.resolution;
  if (d.notes !== undefined) updates.notes = d.notes;
  if ((d as Record<string, unknown>).accommodationRequest !== undefined) {
    updates.accommodationRequest = (d as Record<string, unknown>).accommodationRequest;
  }
  if ((d as Record<string, unknown>).grievanceType !== undefined) {
    updates.grievanceType = (d as Record<string, unknown>).grievanceType;
  }
  if ((d as Record<string, unknown>).incidentDate !== undefined) {
    const raw = (d as Record<string, unknown>).incidentDate;
    updates.incidentDate = raw ? new Date(raw as string).toISOString().split("T")[0] : null;
  }
  if ((d as Record<string, unknown>).remedyRequested !== undefined) {
    updates.remedyRequested = (d as Record<string, unknown>).remedyRequested;
  }
  if ((d as Record<string, unknown>).outcome !== undefined) {
    updates.outcome = (d as Record<string, unknown>).outcome;
  }

  // Handle step change — recalculate due_date unless explicitly provided
  if (d.step !== undefined) {
    updates.step = d.step;
    if (d.dueDate !== undefined) {
      updates.dueDate = d.dueDate ? new Date(d.dueDate as unknown as string).toISOString().split("T")[0] : null;
    } else {
      const days = await getDeadlineDays(d.step);
      updates.dueDate = addDays(new Date().toISOString().split("T")[0], days);
    }
  } else if (d.dueDate !== undefined) {
    updates.dueDate = d.dueDate ? new Date(d.dueDate as unknown as string).toISOString().split("T")[0] : null;
  }

  const [grievance] = await db
    .update(grievancesTable)
    .set(updates)
    .where(eq(grievancesTable.id, paramParsed.data.id))
    .returning();

  if (!grievance) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await logAudit(req, "update", "grievance", grievance.id, formatGrievance(existing), formatGrievance(grievance));

  const memberName = await lookupMemberName(grievance.memberId);

  // Auto-create timeline notes for status / step changes
  const actorId = req.session?.userId ?? null;
  let actorName: string | null = null;
  if (actorId) {
    const [u] = await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, actorId));
    actorName = u?.displayName ?? null;
  }
  if (d.status !== undefined && d.status !== existing.status) {
    const LABELS: Record<string, string> = {
      open: "Open", pending_response: "Pending Response", pending_hearing: "Pending Hearing",
      resolved: "Resolved", withdrawn: "Withdrawn",
    };
    db.insert(grievanceNotesTable).values({
      grievanceId: grievance.id,
      userId: actorId,
      authorName: actorName,
      content: `Status changed from **${LABELS[existing.status] ?? existing.status}** to **${LABELS[grievance.status] ?? grievance.status}**.`,
      noteType: "status_change",
    }).catch(() => undefined);
  }
  if (d.step !== undefined && d.step !== existing.step) {
    const STEP_NAMES: Record<number, string> = {
      1: "Step 1 — Informal", 2: "Step 2 — Written", 3: "Step 3 — Meeting",
      4: "Step 4 — Mediation", 5: "Step 5 — Arbitration",
    };
    db.insert(grievanceNotesTable).values({
      grievanceId: grievance.id,
      userId: actorId,
      authorName: actorName,
      content: `Grievance advanced to **${STEP_NAMES[grievance.step] ?? `Step ${grievance.step}`}**.`,
      noteType: "step_change",
    }).catch(() => undefined);
  }

  // Fire-and-forget status change notification
  if (d.status !== undefined && d.status !== existing.status) {
    sendGrievanceStatusNotification({
      grievanceId: grievance.id,
      grievanceNumber: grievance.grievanceNumber,
      title: grievance.title,
      memberName,
      oldStatus: existing.status,
      newStatus: grievance.status,
      step: grievance.step,
    }).catch(() => undefined);
  }

  res.json(formatGrievance(grievance, memberName));
}));

router.delete("/:id", requirePermission("grievances.manage"), asyncHandler(async (req, res) => {
  const parsed = DeleteGrievanceParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [existing] = await db
    .select()
    .from(grievancesTable)
    .where(eq(grievancesTable.id, parsed.data.id));

  if (existing) {
    await logAudit(req, "delete", "grievance", existing.id, formatGrievance(existing), null);
  }

  await db.delete(grievancesTable).where(eq(grievancesTable.id, parsed.data.id));
  res.status(204).end();
}));

export default router;
