import { Router } from "express";
import { db, grievancesTable, membersTable, localSettingsTable, grievanceNotesTable, usersTable, documentsTable, pool } from "@workspace/db";
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
import { GEMINI_MODEL, GEMINI_FLASH_LITE_MODEL, GEMINI_MAX_TOKENS } from "../lib/anthropic/constants";
import { logger } from "../lib/logger";
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

You have access to the collective agreement text. Reference specific article numbers wherever possible.

CRITICAL FORMATTING RULES — YOU MUST FOLLOW THESE EXACTLY:
- Return ONLY plain text. No JSON. No markdown. No backticks. No asterisks. No code blocks. No formatting symbols of any kind.
- Begin your response immediately with the label GRIEVANCE_TITLE: — no preamble, no introduction.
- Use exactly the labeled sections below in exactly this order.
- Do not add any commentary, explanation, or extra text before or after the sections.`;

function extractSection(text: string, label: string): string {
  const idx = text.indexOf(label + ":");
  if (idx === -1) return "";
  const start = idx + label.length + 1;
  const rest = text.slice(start);
  // Find the next label or end of string
  const nextLabel = rest.search(/\n[A-Z_]{3,}:/);
  const content = nextLabel === -1 ? rest : rest.slice(0, nextLabel);
  return content.trim();
}

router.post("/draft", requirePermission("grievances.view"), asyncHandler(async (req, res) => {
  const { whatHappened, incidentDate, membersInvolved, managementInvolved, department, grievanceType } = req.body;

  if (!whatHappened || typeof whatHappened !== "string" || whatHappened.trim().length < 10) {
    res.status(400).json({ error: "whatHappened must be at least 10 characters" });
    return;
  }

  const userPrompt = `Draft a formal Unifor grievance for the following incident. Return ONLY plain text using the labeled sections below — no JSON, no markdown, no backticks, no formatting symbols.

INCIDENT DETAILS:
WHAT HAPPENED: ${whatHappened.trim()}
DATE OF INCIDENT: ${incidentDate || "Not specified"}
MEMBER(S) INVOLVED: ${membersInvolved || "Not specified"}
MANAGEMENT INVOLVED: ${managementInvolved || "Not specified"}
DEPARTMENT / SHIFT: ${department || "Not specified"}
GRIEVANCE TYPE: ${grievanceType || "Not specified"}

COLLECTIVE AGREEMENT TEXT FOR REFERENCE:
${cbaText}

Respond using ONLY these plain text labels in this exact order. Put content on the lines immediately after each label:

GRIEVANCE_TITLE:
A concise grievance title (max 80 characters)

ARTICLES_VIOLATED:
Comma-separated list of CBA article references that were violated

REMEDY_SOUGHT:
The remedy sought in formal grievance language

PROCEDURAL_STEP:
The recommended step number (1, 2, 3, 4, or 5)

GRIEVANCE_DRAFT:
The full formal grievance text. Plain text only. Label each section: STATEMENT OF GRIEVANCE, ARTICLES VIOLATED, JUST CAUSE PRINCIPLES BREACHED, REMEDY SOUGHT, PROCEDURAL STEP`;

  logger.info({ model: GEMINI_MODEL, maxOutputTokens: GEMINI_MAX_TOKENS, bodyKeys: Object.keys(req.body) }, "grievance /draft: calling Gemini");

  let rawText = "";
  try {
    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: GRIEVANCE_DRAFT_SYSTEM_PROMPT,
        maxOutputTokens: GEMINI_MAX_TOKENS,
      },
    });
    rawText = result.text ?? "";
    logger.info({ rawLength: rawText.length, preview: rawText.slice(0, 300) }, "grievance /draft raw Gemini response");
  } catch (geminiErr: unknown) {
    const msg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
    const stack = geminiErr instanceof Error ? geminiErr.stack : undefined;
    logger.error({ err: geminiErr, message: msg, stack, model: GEMINI_MODEL }, "grievance /draft: Gemini API call failed");
    res.status(502).json({ error: `AI draft failed: ${msg}` });
    return;
  }

  if (!rawText.trim()) {
    logger.warn({ model: GEMINI_MODEL }, "grievance /draft: Gemini returned empty response");
    res.status(502).json({ error: "AI draft unavailable — please try again or draft manually" });
    return;
  }

  const suggestedTitle    = extractSection(rawText, "GRIEVANCE_TITLE").slice(0, 80);
  const suggestedArticles = extractSection(rawText, "ARTICLES_VIOLATED");
  const suggestedRemedy   = extractSection(rawText, "REMEDY_SOUGHT");
  const stepRaw           = extractSection(rawText, "PROCEDURAL_STEP");
  const suggestedStep     = parseInt(stepRaw, 10) || 1;
  const draft             = extractSection(rawText, "GRIEVANCE_DRAFT") || rawText.trim();

  res.json({
    suggestedTitle,
    suggestedArticles,
    suggestedRemedy,
    suggestedStep,
    draft,
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
  const rawBody = req.body as Record<string, unknown>;
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
      accommodationRequest: rawBody.accommodationRequest as boolean ?? false,
      grievanceType: rawBody.grievanceType as string ?? null,
      incidentDate: rawBody.incidentDate
        ? new Date(rawBody.incidentDate as string).toISOString().split("T")[0]
        : null,
      remedyRequested: rawBody.remedyRequested as string ?? null,
      outcome: rawBody.outcome as string ?? "pending",
    })
    .returning();

  // Auto-populate cba_document_id with the current CBA document (version protection)
  try {
    const cbaRes = await db
      .select({ id: documentsTable.id })
      .from(documentsTable)
      .where(and(eq(documentsTable.isCurrent, true), eq(documentsTable.category, "cba")))
      .orderBy(desc(documentsTable.uploadedAt))
      .limit(1);
    if (cbaRes.length > 0) {
      await pool.connect().then(async (client) => {
        try {
          await client.query(`UPDATE grievances SET cba_document_id = $1 WHERE id = $2`, [cbaRes[0].id, grievance.id]);
        } finally { client.release(); }
      });
    }
  } catch { /* non-fatal */ }

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
  const raw = req.body as Record<string, unknown>;
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
  if (raw.accommodationRequest !== undefined) updates.accommodationRequest = raw.accommodationRequest;
  if (raw.grievanceType !== undefined) updates.grievanceType = raw.grievanceType;
  if (raw.incidentDate !== undefined) {
    updates.incidentDate = raw.incidentDate ? new Date(raw.incidentDate as string).toISOString().split("T")[0] : null;
  }
  if (raw.remedyRequested !== undefined) updates.remedyRequested = raw.remedyRequested;
  if (raw.outcome !== undefined) updates.outcome = raw.outcome;

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

// ─── Arbitration Referral Package ─────────────────────────────────────────────

const ARBITRATION_SYSTEM_PROMPT = `You are an arbitration referral assistant for Unifor Local 1285. When given a complete grievance file, generate a professional arbitration referral cover summary for Unifor National that includes: 1) A plain language summary of the grievance and why it is being referred to arbitration, 2) The union's position statement, 3) Key facts and timeline of events, 4) Collective agreement articles violated, 5) Remedy being sought, 6) Any procedural issues or deadline concerns the National rep should be aware of. Write in a professional, formal tone suitable for submission to Unifor National. Always end with: 'This referral package has been prepared by the Local steward and is submitted for review and action by the Unifor National Representative.'`;

router.get("/:id/referral-package", requireSteward, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }
  const result = await db.execute(sql`SELECT * FROM arbitration_packages WHERE grievance_id = ${id} LIMIT 1`);
  const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
  const row = rows[0];
  if (!row) { res.status(404).json({ error: "No referral package generated yet" }); return; }
  res.json({
    id: row.id,
    grievanceId: row.grievance_id,
    coverSummary: row.cover_summary,
    assembledData: row.assembled_data,
    generatedAt: row.generated_at,
    updatedAt: row.updated_at,
  });
}));

router.post("/:id/referral-package", requireSteward, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [grievance] = await db.select().from(grievancesTable).where(eq(grievancesTable.id, id));
  if (!grievance) { res.status(404).json({ error: "Grievance not found" }); return; }

  let member: { name: string | null; department: string | null; shift: string | null; employeeId: string | null } | null = null;
  if (grievance.memberId) {
    const [m] = await db.select({
      name: membersTable.name,
      department: membersTable.department,
      shift: membersTable.shift,
      employeeId: membersTable.employeeId,
    }).from(membersTable).where(eq(membersTable.id, grievance.memberId));
    member = m ?? null;
  }

  const notes = await db.select().from(grievanceNotesTable)
    .where(eq(grievanceNotesTable.grievanceId, id))
    .orderBy(grievanceNotesTable.createdAt);

  const journalResult = await db.execute(sql`
    SELECT content, entry_type, author_name, created_at FROM case_journal_entries
    WHERE grievance_id = ${id} ORDER BY created_at ASC
  `);
  const journalRows = Array.isArray(journalResult) ? journalResult : (journalResult as any).rows ?? [];

  const jcResult = await db.execute(sql`
    SELECT * FROM just_cause_assessments WHERE grievance_id = ${id} LIMIT 1
  `);
  const jcRows = Array.isArray(jcResult) ? jcResult : (jcResult as any).rows ?? [];
  const jc = (jcRows as any[])[0] ?? null;

  const commResult = await db.execute(sql`
    SELECT contact_method, summary, contact_date, logged_by_name FROM member_communication_log
    WHERE grievance_id = ${id} ORDER BY contact_date ASC
  `);
  const commRows = Array.isArray(commResult) ? commResult : (commResult as any).rows ?? [];

  const assembledData = {
    grievance: {
      number: grievance.grievanceNumber,
      title: grievance.title,
      description: grievance.description,
      contractArticle: grievance.contractArticle,
      grievanceType: grievance.grievanceType,
      incidentDate: grievance.incidentDate,
      filedDate: grievance.filedDate,
      dueDate: grievance.dueDate,
      step: grievance.step,
      status: grievance.status,
      outcome: grievance.outcome,
      remedyRequested: grievance.remedyRequested,
      notes: grievance.notes,
      accommodationRequest: grievance.accommodationRequest,
    },
    member: member ?? null,
    activityNotes: notes.map(n => ({ content: n.content, type: n.noteType, author: n.authorName, date: n.createdAt })),
    journalEntries: (journalRows as any[]).map(j => ({ content: j.content, type: j.entry_type, author: j.author_name, date: j.created_at })),
    justCause: jc ? {
      adequateNotice: jc.adequate_notice, reasonableRule: jc.reasonable_rule,
      investigationConducted: jc.investigation_conducted, investigationFair: jc.investigation_fair,
      proofSufficient: jc.proof_sufficient, penaltyConsistent: jc.penalty_consistent,
      penaltyProgressive: jc.penalty_progressive, notes: jc.notes,
    } : null,
    communicationLog: (commRows as any[]).map(c => ({ method: c.contact_method, summary: c.summary, date: c.contact_date, author: c.logged_by_name })),
  };

  const stepNotes = notes.map(n => `[${n.noteType.toUpperCase()}] ${n.authorName ?? "System"}: ${n.content}`).join("\n") || "No activity recorded";
  const journalText = (journalRows as any[]).map((j: any) => `[${j.entry_type}] ${j.author_name ?? "Steward"}: ${j.content}`).join("\n") || "No journal entries";
  const commText = (commRows as any[]).map((c: any) => `${c.contact_date} via ${c.contact_method}: ${c.summary}`).join("\n") || "None";
  const jcText = jc
    ? `Adequate Notice: ${jc.adequate_notice ? "Yes" : "No"}\nReasonable Rule: ${jc.reasonable_rule ? "Yes" : "No"}\nInvestigation Conducted: ${jc.investigation_conducted ? "Yes" : "No"}\nInvestigation Fair: ${jc.investigation_fair ? "Yes" : "No"}\nProof Sufficient: ${jc.proof_sufficient ? "Yes" : "No"}\nPenalty Consistent: ${jc.penalty_consistent ? "Yes" : "No"}\nProgressive Discipline: ${jc.penalty_progressive ? "Yes" : "No"}\nAssessment Notes: ${jc.notes ?? "None"}`
    : "Not assessed";
  const memberText = member
    ? `Name: ${member.name ?? "Unknown"}\nDepartment: ${member.department ?? "Not specified"}\nShift: ${member.shift ?? "Not specified"}\nEmployee ID: ${member.employeeId ?? "Not specified"}`
    : "No member linked";

  const userPrompt = `Generate a professional arbitration referral cover summary for the following Unifor Local 1285 grievance.

GRIEVANCE FILE:
===============
Grievance Number: ${grievance.grievanceNumber}
Title: ${grievance.title}
Type: ${grievance.grievanceType ?? "Not specified"}
Filed Date: ${grievance.filedDate}
Incident Date: ${grievance.incidentDate ?? "Not specified"}
Current Step: Step ${grievance.step}
Status: ${grievance.status}

MEMBER:
${memberText}

GRIEVANCE DESCRIPTION:
${grievance.description ?? "No description provided"}

CONTRACT ARTICLES CITED:
${grievance.contractArticle ?? "Not specified"}

REMEDY REQUESTED:
${grievance.remedyRequested ?? "Not specified"}

STEWARD NOTES:
${grievance.notes ?? "None"}

ACTIVITY TIMELINE (${notes.length} entries):
${stepNotes}

STEWARD JOURNAL (${(journalRows as any[]).length} entries):
${journalText}

JUST CAUSE ASSESSMENT:
${jcText}

MEMBER CONTACTS LOGGED (${(commRows as any[]).length}):
${commText}

Generate the complete arbitration referral cover summary now.`;

  logger.info({ grievanceId: id, model: GEMINI_FLASH_LITE_MODEL }, "Generating arbitration referral package");

  const result = await ai.models.generateContent({
    model: GEMINI_FLASH_LITE_MODEL,
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: { systemInstruction: ARBITRATION_SYSTEM_PROMPT, maxOutputTokens: GEMINI_MAX_TOKENS },
  });

  const coverSummary = result.text ?? "";
  if (!coverSummary.trim()) {
    res.status(502).json({ error: "AI returned empty response. Please try again." });
    return;
  }

  const userId = req.session?.userId ?? null;
  await db.execute(sql`
    INSERT INTO arbitration_packages (grievance_id, cover_summary, assembled_data, generated_by, generated_at, updated_at)
    VALUES (${id}, ${coverSummary}, ${JSON.stringify(assembledData)}::jsonb, ${userId}, NOW(), NOW())
    ON CONFLICT (grievance_id)
    DO UPDATE SET cover_summary = EXCLUDED.cover_summary,
                  assembled_data = EXCLUDED.assembled_data,
                  generated_at = NOW(),
                  updated_at = NOW()
  `);

  res.json({ grievanceId: id, coverSummary, assembledData, generatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
}));

router.patch("/:id/referral-package", requireSteward, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { coverSummary } = req.body;
  if (!coverSummary || typeof coverSummary !== "string") {
    res.status(400).json({ error: "coverSummary is required" });
    return;
  }
  const chkResult = await db.execute(sql`SELECT id FROM arbitration_packages WHERE grievance_id = ${id} LIMIT 1`);
  const chkRows = Array.isArray(chkResult) ? chkResult : (chkResult as any).rows ?? [];
  if (!chkRows.length) { res.status(404).json({ error: "No package found — generate one first" }); return; }
  await db.execute(sql`
    UPDATE arbitration_packages SET cover_summary = ${coverSummary}, updated_at = NOW()
    WHERE grievance_id = ${id}
  `);
  res.json({ ok: true, grievanceId: id, updatedAt: new Date().toISOString() });
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
