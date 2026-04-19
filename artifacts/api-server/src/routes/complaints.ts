import { Router, type Request, type Response } from "express";
import { db, memberComplaintsTable, membersTable, usersTable } from "@workspace/db";
import { eq, desc, and, gte, sql, inArray } from "drizzle-orm";
import { requireSteward } from "../lib/permissions";
import { asyncHandler } from "../lib/asyncHandler";
import { ai } from "../lib/gemini/client";
import { GEMINI_FLASH_LITE_MODEL, GEMINI_MAX_TOKENS } from "../lib/anthropic/constants";
import { logger } from "../lib/logger";
import { z } from "zod/v4";

const router = Router();

const COMPLAINT_SYSTEM_PROMPT = `You are a member complaint analysis assistant for Unifor Local 1285. When given a complaint description, analyze it and provide: 1) Confirmed category, 2) Whether this complaint matches any patterns with similar recent complaints (based on the complaint summary provided), 3) A recommendation of one of three actions: Monitor Only (minor, isolated issue), Raise Informally with Management (ongoing but not yet grievance-worthy), or File Grievance (clear collective agreement violation or serious issue). 4) A brief plain language explanation of your recommendation. Keep the response concise and practical. Always note that the steward makes the final decision on next steps.

Respond ONLY with valid JSON in exactly this format:
{
  "confirmedCategory": "one of: scheduling|discipline|overtime|benefits|seniority|working_conditions|harassment|other",
  "patternMatch": true or false,
  "patternNote": "brief note about pattern if applicable, or null",
  "recommendation": "one of: monitor|raise_informally|file_grievance",
  "explanation": "2-3 sentence plain language explanation of recommendation",
  "disclaimer": "This analysis is to assist the steward. The steward makes all final decisions."
}`;

const CATEGORIES = ["scheduling", "discipline", "overtime", "benefits", "seniority", "working_conditions", "harassment", "other"] as const;
const SEVERITIES = ["minor", "ongoing", "serious"] as const;
const SCOPES = ["just_me", "multiple_members", "entire_shift", "entire_department"] as const;
const STATUSES = ["open", "monitoring", "resolved", "escalated"] as const;

const submitSchema = z.object({
  description: z.string().min(10).max(5000),
  category: z.enum(CATEGORIES),
  occurredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  affectedScope: z.enum(SCOPES),
  severity: z.enum(SEVERITIES),
});

const updateSchema = z.object({
  status: z.enum(STATUSES).optional(),
  stewardNotes: z.string().max(5000).optional(),
  linkedGrievanceId: z.number().int().optional(),
  severity: z.enum(SEVERITIES).optional(),
  category: z.enum(CATEGORIES).optional(),
});

function isStaff(req: Request): boolean {
  const role = (req as any).session?.role;
  return role && role !== "member";
}

// ─── POST / — submit complaint ─────────────────────────────────────────────────
router.post(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid complaint data", details: parsed.error.issues });
      return;
    }

    const { description, category, occurredDate, affectedScope, severity } = parsed.data;
    const userId = req.session?.userId ?? null;
    const linkedMemberId = req.session?.linkedMemberId ?? null;

    // Fetch recent complaints in same category for pattern context
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentSameCategory = await db
      .select({ id: memberComplaintsTable.id, description: memberComplaintsTable.description })
      .from(memberComplaintsTable)
      .where(
        and(
          eq(memberComplaintsTable.category, category),
          gte(memberComplaintsTable.createdAt, thirtyDaysAgo)
        )
      )
      .limit(5);

    // Build AI prompt
    let prompt = `New complaint submitted:\nCategory: ${category}\nSeverity: ${severity}\nScope: ${affectedScope}\nDate occurred: ${occurredDate}\nDescription: ${description}`;
    if (recentSameCategory.length > 0) {
      prompt += `\n\nRecent complaints in the same category (last 30 days — ${recentSameCategory.length} total):\n`;
      for (const rc of recentSameCategory) {
        prompt += `- ${rc.description.slice(0, 150)}\n`;
      }
    }

    // Call Gemini
    let aiCategory = category;
    let aiRecommendation = "monitor";
    let aiExplanation = "";
    let aiPatternFlag = false;

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_FLASH_LITE_MODEL,
        config: {
          systemInstruction: COMPLAINT_SYSTEM_PROMPT,
          maxOutputTokens: 512,
          temperature: 0.3,
          responseMimeType: "application/json",
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      const rawText = response.text ?? "";
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        const m = rawText.match(/\{[\s\S]*\}/);
        parsed = m ? JSON.parse(m[0]) : {};
      }

      aiCategory = ((parsed.confirmedCategory as string) ?? category) as typeof aiCategory;
      aiRecommendation = (parsed.recommendation as string) ?? "monitor";
      aiExplanation = (parsed.explanation as string) ?? "";
      aiPatternFlag = Boolean(parsed.patternMatch);
    } catch (err) {
      logger.warn({ err }, "Complaint AI analysis failed — saving without AI fields");
    }

    // Check pattern (3+ in same category in 30 days including this one)
    const patternCount = recentSameCategory.length + 1;
    const isPattern = patternCount >= 3;

    const [complaint] = await db
      .insert(memberComplaintsTable)
      .values({
        memberId: linkedMemberId,
        submittedByUserId: userId,
        description,
        category,
        occurredDate,
        affectedScope,
        severity,
        status: "open",
        aiCategory,
        aiRecommendation,
        aiExplanation,
        aiPatternFlag: aiPatternFlag || isPattern,
      })
      .returning();

    res.status(201).json({
      complaint,
      aiResult: {
        confirmedCategory: aiCategory,
        recommendation: aiRecommendation,
        explanation: aiExplanation,
        patternFlag: aiPatternFlag || isPattern,
        patternCount,
        disclaimer: "This analysis is to assist the steward. The steward makes all final decisions.",
      },
    });
  })
);

// ─── GET /patterns — steward-only pattern analysis ─────────────────────────────
router.get(
  "/patterns",
  requireSteward,
  asyncHandler(async (_req: Request, res: Response) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const rows = await db
      .select({
        category: memberComplaintsTable.category,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(memberComplaintsTable)
      .where(gte(memberComplaintsTable.createdAt, thirtyDaysAgo))
      .groupBy(memberComplaintsTable.category)
      .orderBy(desc(sql`count(*)`));

    const patterns = rows
      .filter((r) => r.count >= 3)
      .map((r) => ({ category: r.category, count: r.count, isPattern: true }));

    const all = rows.map((r) => ({ category: r.category, count: r.count, isPattern: r.count >= 3 }));

    res.json({ patterns, all, windowDays: 30 });
  })
);

// ─── GET / — list complaints ────────────────────────────────────────────────────
router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const { category, severity, status } = req.query as Record<string, string | undefined>;
    const staff = isStaff(req);
    const userId = req.session?.userId;
    const linkedMemberId = req.session?.linkedMemberId;

    const conditions: ReturnType<typeof eq>[] = [];

    if (!staff) {
      // Members see only their own
      if (linkedMemberId) {
        conditions.push(eq(memberComplaintsTable.memberId, linkedMemberId));
      } else if (userId) {
        conditions.push(eq(memberComplaintsTable.submittedByUserId, userId));
      }
    }

    if (category) conditions.push(eq(memberComplaintsTable.category, category));
    if (severity) conditions.push(eq(memberComplaintsTable.severity, severity));
    if (status) conditions.push(eq(memberComplaintsTable.status, status));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const complaints = await db
      .select({
        id: memberComplaintsTable.id,
        memberId: memberComplaintsTable.memberId,
        description: memberComplaintsTable.description,
        category: memberComplaintsTable.category,
        occurredDate: memberComplaintsTable.occurredDate,
        affectedScope: memberComplaintsTable.affectedScope,
        severity: memberComplaintsTable.severity,
        status: memberComplaintsTable.status,
        linkedGrievanceId: memberComplaintsTable.linkedGrievanceId,
        aiCategory: memberComplaintsTable.aiCategory,
        aiRecommendation: memberComplaintsTable.aiRecommendation,
        aiExplanation: staff ? memberComplaintsTable.aiExplanation : sql<null>`null`,
        aiPatternFlag: memberComplaintsTable.aiPatternFlag,
        stewardNotes: staff ? memberComplaintsTable.stewardNotes : sql<null>`null`,
        followUpNote: memberComplaintsTable.followUpNote,
        followUpAt: memberComplaintsTable.followUpAt,
        createdAt: memberComplaintsTable.createdAt,
        updatedAt: memberComplaintsTable.updatedAt,
        memberName: membersTable.name,
      })
      .from(memberComplaintsTable)
      .leftJoin(membersTable, eq(memberComplaintsTable.memberId, membersTable.id))
      .where(whereClause)
      .orderBy(
        sql`CASE severity WHEN 'serious' THEN 1 WHEN 'ongoing' THEN 2 ELSE 3 END`,
        desc(memberComplaintsTable.createdAt)
      );

    res.json(complaints);
  })
);

// ─── GET /:id ────────────────────────────────────────────────────────────────
router.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const staff = isStaff(req);
    const linkedMemberId = req.session?.linkedMemberId;

    const [complaint] = await db
      .select()
      .from(memberComplaintsTable)
      .leftJoin(membersTable, eq(memberComplaintsTable.memberId, membersTable.id))
      .where(eq(memberComplaintsTable.id, id));

    if (!complaint) { res.status(404).json({ error: "Not found" }); return; }

    // Members can only see their own
    if (!staff && complaint.member_complaints.memberId !== linkedMemberId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    res.json({
      ...complaint.member_complaints,
      memberName: complaint.members?.name ?? null,
      stewardNotes: staff ? complaint.member_complaints.stewardNotes : undefined,
    });
  })
);

// ─── PATCH /:id — steward update ──────────────────────────────────────────────
router.patch(
  "/:id",
  requireSteward,
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid data" }); return; }

    const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
    if (parsed.data.status === "resolved") updates.resolvedAt = new Date();

    const [updated] = await db
      .update(memberComplaintsTable)
      .set(updates)
      .where(eq(memberComplaintsTable.id, id))
      .returning();

    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json(updated);
  })
);

// ─── DELETE /:id ─────────────────────────────────────────────────────────────
router.delete(
  "/:id",
  requireSteward,
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    await db.delete(memberComplaintsTable).where(eq(memberComplaintsTable.id, id));
    res.json({ ok: true });
  })
);

export default router;
