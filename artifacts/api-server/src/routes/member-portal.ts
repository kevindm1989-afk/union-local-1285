import { Router, type Request, type Response } from "express";
import { db, membersTable, grievancesTable, announcementsTable, usersTable, disciplineRecordsTable } from "@workspace/db";
import { eq, desc, asc } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { ANTHROPIC_MODEL } from "../lib/anthropic/constants";
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
 * GET /member-portal/bulletins — bulletin feed (active announcements)
 */
router.get("/bulletins", requireMemberAccess, asyncHandler(async (_req: Request, res: Response) => {
  const bulletins = await db
    .select({
      id: announcementsTable.id,
      title: announcementsTable.title,
      content: announcementsTable.content,
      category: announcementsTable.category,
      isUrgent: announcementsTable.isUrgent,
      publishedAt: announcementsTable.publishedAt,
    })
    .from(announcementsTable)
    .orderBy(desc(announcementsTable.publishedAt))
    .limit(50);
  res.json(bulletins);
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
    const stream = anthropic.messages.stream({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      system: MEMBER_AI_SYSTEM_PROMPT,
      messages: chatMessages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
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

export default router;
