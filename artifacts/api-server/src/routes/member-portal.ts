import { Router, type Request, type Response } from "express";
import { db, pool, membersTable, grievancesTable, announcementsTable, usersTable, disciplineRecordsTable } from "@workspace/db";
import { eq, desc, asc } from "drizzle-orm";
import { ai } from "../lib/gemini/client";
import { GEMINI_MODEL, GEMINI_MAX_TOKENS } from "../lib/anthropic/constants";
import { z } from "zod/v4";
import { asyncHandler } from "../lib/asyncHandler";
import { aiChatLimiter, grievanceCreateLimiter } from "../lib/rateLimiters";
import { requireMemberAccess } from "../lib/permissions";
// @ts-ignore — .txt imported via esbuild text loader
import cbaText from "../data/cba.txt";

const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1).max(10000),
    }),
  ).min(1).max(50),
});

const MEMBER_AI_SYSTEM_PROMPT = `You are a knowledgeable union assistant for your union local. You help members understand their rights and entitlements under the Collective Agreement.

When answering questions:
- Quote the specific Article and clause number whenever possible (e.g. "Article 9.01 states...")
- Be accurate and grounded in the contract text — do not make up provisions
- If a question isn't covered by the CBA, say so clearly
- Keep answers practical and easy to understand for a regular member (not a lawyer)
- For serious issues, advise the member to contact their union steward

Here is the full Collective Agreement text:

---
${cbaText}
---`;

const router = Router();

/**
 * GET /member-portal/profile — get own member record (no sensitive admin fields)
 */
router.get("/profile", requireMemberAccess, asyncHandler(async (req: Request, res: Response) => {
  const memberId = req.session.linkedMemberId!;
  const [member] = await db
    .select({
      id: membersTable.id,
      name: membersTable.name,
      employeeId: membersTable.employeeId,
      department: membersTable.department,
      classification: membersTable.classification,
      phone: membersTable.phone,
      email: membersTable.email,
      joinDate: membersTable.joinDate,
      seniorityDate: membersTable.seniorityDate,
      duesStatus: membersTable.duesStatus,
      duesLastPaid: membersTable.duesLastPaid,
      shift: membersTable.shift,
      classificationDate: membersTable.classificationDate,
      isActive: membersTable.isActive,
      signedAt: membersTable.signedAt,
    })
    .from(membersTable)
    .where(eq(membersTable.id, memberId));

  if (!member) {
    res.status(404).json({ error: "Member record not found", code: "NOT_FOUND" });
    return;
  }
  res.json(member);
}));

/**
 * PATCH /member-portal/profile — update own phone/email only
 */
router.patch("/profile", requireMemberAccess, asyncHandler(async (req: Request, res: Response) => {
  const memberId = req.session.linkedMemberId!;
  const { phone, email } = req.body ?? {};

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (phone !== undefined) updates.phone = String(phone).trim() || null;
  if (email !== undefined) updates.email = String(email).trim().toLowerCase() || null;

  if (Object.keys(updates).length === 1) {
    res.status(400).json({ error: "Nothing to update", code: "NO_CHANGES" });
    return;
  }

  const [updated] = await db
    .update(membersTable)
    .set(updates)
    .where(eq(membersTable.id, memberId))
    .returning({
      id: membersTable.id,
      phone: membersTable.phone,
      email: membersTable.email,
    });

  res.json(updated);
}));

/**
 * GET /member-portal/grievances — own grievances (read-only, no steward notes)
 */
router.get("/grievances", requireMemberAccess, asyncHandler(async (req: Request, res: Response) => {
  const memberId = req.session.linkedMemberId!;
  const grievances = await db
    .select({
      id: grievancesTable.id,
      grievanceNumber: grievancesTable.grievanceNumber,
      title: grievancesTable.title,
      description: grievancesTable.description,
      step: grievancesTable.step,
      status: grievancesTable.status,
      filedDate: grievancesTable.filedDate,
      dueDate: grievancesTable.dueDate,
      resolvedDate: grievancesTable.resolvedDate,
      accommodationRequest: grievancesTable.accommodationRequest,
    })
    .from(grievancesTable)
    .where(eq(grievancesTable.memberId, memberId))
    .orderBy(desc(grievancesTable.filedDate));
  res.json(grievances);
}));

/**
 * POST /member-portal/grievances — submit a new grievance (simplified form)
 */
router.post("/grievances", requireMemberAccess, grievanceCreateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const memberId = req.session.linkedMemberId!;
  const { description, dateOfIncident, accommodationRequest } = req.body ?? {};

  if (!description || !dateOfIncident) {
    res.status(400).json({ error: "description and dateOfIncident are required", code: "MISSING_FIELDS" });
    return;
  }

  // Auto-generate grievance number
  const existing = await db.select({ id: grievancesTable.id }).from(grievancesTable).orderBy(desc(grievancesTable.id)).limit(1);
  const nextNum = existing.length > 0 ? existing[0].id + 1 : 1;
  const grievanceNumber = `GR-${String(nextNum).padStart(4, "0")}`;

  // Get member name for title
  const [member] = await db.select({ name: membersTable.name }).from(membersTable).where(eq(membersTable.id, memberId));
  const title = `Grievance request from ${member?.name ?? "Member"} — ${dateOfIncident}`;

  const [grievance] = await db
    .insert(grievancesTable)
    .values({
      grievanceNumber,
      memberId,
      title,
      description: String(description),
      step: 1,
      status: "member_requested",
      filedDate: dateOfIncident,
      accommodationRequest: accommodationRequest === true,
    })
    .returning({
      id: grievancesTable.id,
      grievanceNumber: grievancesTable.grievanceNumber,
      title: grievancesTable.title,
      status: grievancesTable.status,
      filedDate: grievancesTable.filedDate,
    });

  res.status(201).json(grievance);
}));

/**
 * GET /member-portal/bulletins — active bulletin feed (published, not expired)
 */
router.get("/bulletins", requireMemberAccess, asyncHandler(async (req: Request, res: Response) => {
  const memberId = req.session.linkedMemberId ?? req.session.userId ?? null;
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT a.id, a.title, a.content, a.category, a.is_urgent, a.urgency_level, a.published_at,
              a.expires_at,
              EXISTS(SELECT 1 FROM bulletin_acknowledgements ba WHERE ba.announcement_id = a.id AND ba.member_id = $1) AS is_acknowledged,
              (SELECT response FROM bulletin_responses br WHERE br.announcement_id = a.id AND br.member_id = $1 LIMIT 1) AS my_response
       FROM announcements a
       WHERE (a.is_published IS NULL OR a.is_published = TRUE)
         AND (a.expires_at IS NULL OR a.expires_at > NOW())
       ORDER BY a.published_at DESC
       LIMIT 60`,
      [memberId]
    );
    res.json(result.rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      category: r.category,
      isUrgent: r.is_urgent,
      urgencyLevel: r.urgency_level ?? "normal",
      publishedAt: r.published_at?.toISOString() ?? new Date().toISOString(),
      expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
      isMobilization: ["job_action", "strike_action", "action"].includes(r.category),
      isAcknowledged: r.is_acknowledged ?? false,
      myResponse: r.my_response ?? null,
    })));
  } finally {
    client.release();
  }
}));

/**
 * GET /member-portal/discipline — own discipline records (read-only)
 */
router.get("/discipline", requireMemberAccess, asyncHandler(async (req: Request, res: Response) => {
  const memberId = req.session.linkedMemberId!;
  const records = await db
    .select({
      id: disciplineRecordsTable.id,
      disciplineType: disciplineRecordsTable.disciplineType,
      incidentDate: disciplineRecordsTable.incidentDate,
      issuedDate: disciplineRecordsTable.issuedDate,
      description: disciplineRecordsTable.description,
      responseFiled: disciplineRecordsTable.responseFiled,
      grievanceId: disciplineRecordsTable.grievanceId,
      createdAt: disciplineRecordsTable.createdAt,
    })
    .from(disciplineRecordsTable)
    .where(eq(disciplineRecordsTable.memberId, memberId))
    .orderBy(asc(disciplineRecordsTable.incidentDate));
  res.json(records.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
}));

/**
 * POST /member-portal/sign-card — save e-signature (union card signing)
 */
router.post("/sign-card", requireMemberAccess, asyncHandler(async (req: Request, res: Response) => {
  const memberId = req.session.linkedMemberId!;
  const { signatureData } = req.body ?? {};

  if (!signatureData || typeof signatureData !== "string") {
    res.status(400).json({ error: "signatureData (base64 PNG) is required", code: "MISSING_SIGNATURE" });
    return;
  }

  if (!signatureData.startsWith("data:image/")) {
    res.status(400).json({ error: "signatureData must be a data URL (data:image/...)", code: "INVALID_SIGNATURE" });
    return;
  }

  const [updated] = await db
    .update(membersTable)
    .set({
      signatureData,
      signedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(membersTable.id, memberId))
    .returning({
      id: membersTable.id,
      signedAt: membersTable.signedAt,
    });

  res.json({ ok: true, signedAt: updated.signedAt });
}));

/**
 * POST /member-portal/ai/chat — stateless streaming CBA assistant for members
 * History is passed in-request and not persisted to the database.
 * Has its own try/catch for streaming error handling.
 */
router.post("/ai/chat", requireMemberAccess, aiChatLimiter, async (req: Request, res: Response) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Invalid request body", code: "VALIDATION_ERROR" });
    return;
  }

  const chatMessages = parsed.data.messages;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = await ai.models.generateContentStream({
      model: GEMINI_MODEL,
      contents: chatMessages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      config: {
        maxOutputTokens: GEMINI_MAX_TOKENS,
        systemInstruction: MEMBER_AI_SYSTEM_PROMPT,
      },
    });

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Member portal AI chat failed");
    if (!res.headersSent) {
      res.status(500).json({ error: "AI service unavailable" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Stream error" })}\n\n`);
      res.end();
    }
  }
});

// ─── Member Rights Explainer ──────────────────────────────────────────────────

const RIGHTS_SYSTEM_PROMPT = `You are a member rights assistant for Unifor Local 1285, a Canadian union operating under Ontario labor law. When a member asks a question about their rights, answer clearly and simply using: 1) The Unifor Local 1285 collective agreement as the primary source, 2) The Ontario Employment Standards Act as a secondary source. Structure every answer as: Direct Answer (1-2 sentences), Collective Agreement Reference (cite the specific article), ESA Reference (only if applicable). Use plain language a warehouse worker can understand. Maximum 3 paragraphs. Always end with: 'If this situation is serious or ongoing, contact your steward immediately.' Never provide legal advice — only explain what the collective agreement and ESA say.

Here is the full Collective Agreement text for reference:
---
${cbaText}
---

CRITICAL FORMATTING RULES:
- Return ONLY plain text with labeled sections. No markdown, no JSON, no asterisks, no backticks.
- Begin immediately with DIRECT_ANSWER: — no preamble.
- Use exactly these three labels in this order.`;

const rightsSchema = z.object({
  question: z.string().min(3).max(2000),
});

function extractRightsSection(text: string, label: string): string {
  const idx = text.indexOf(label + ":");
  if (idx === -1) return "";
  const start = idx + label.length + 1;
  const rest = text.slice(start);
  const nextLabel = rest.search(/\n[A-Z_]{3,}:/);
  return (nextLabel === -1 ? rest : rest.slice(0, nextLabel)).trim();
}

router.post("/rights", aiChatLimiter, asyncHandler(async (req: Request, res: Response) => {
  const parsed = rightsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Question must be between 3 and 2000 characters." });
    return;
  }

  const { question } = parsed.data;

  const userPrompt = `Member question: ${question}

Answer using ONLY these plain text labeled sections in this exact order:

DIRECT_ANSWER:
A clear, plain-language answer in 1-2 sentences.

CBA_REFERENCE:
The specific Collective Agreement article(s) that apply. Include the article number and a brief quote or summary.

ESA_REFERENCE:
The Ontario ESA section that applies, if relevant. If the ESA is not relevant to this question, write: Not applicable.`;

  let rawText = "";
  try {
    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: RIGHTS_SYSTEM_PROMPT,
        maxOutputTokens: 1024,
      },
    });
    rawText = result.text ?? "";
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err, model: GEMINI_MODEL }, "Member rights AI call failed");
    res.status(502).json({ error: `AI unavailable: ${msg}` });
    return;
  }

  if (!rawText.trim()) {
    res.status(502).json({ error: "AI returned an empty response. Please try again." });
    return;
  }

  const directAnswer = extractRightsSection(rawText, "DIRECT_ANSWER") || rawText.trim();
  const cbaReference = extractRightsSection(rawText, "CBA_REFERENCE");
  const esaRaw = extractRightsSection(rawText, "ESA_REFERENCE");
  const esaReference = esaRaw && !esaRaw.toLowerCase().includes("not applicable") ? esaRaw : null;

  res.json({
    question,
    directAnswer,
    cbaReference,
    esaReference,
    disclaimer: "If this situation is serious or ongoing, contact your steward immediately.",
  });
}));

export default router;
