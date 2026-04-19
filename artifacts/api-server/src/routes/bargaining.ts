import { Router } from "express";
import { db, grievancesTable, membersTable, bargainingReportsTable } from "@workspace/db";
import { desc, eq, isNotNull, sql } from "drizzle-orm";
import { requireSteward } from "../lib/permissions";
import { asyncHandler } from "../lib/asyncHandler";
import { ai } from "../lib/gemini/client";
import { GEMINI_FLASH_LITE_MODEL, GEMINI_MAX_TOKENS } from "../lib/anthropic/constants";
import { logger } from "../lib/logger";
// @ts-ignore
import cbaText from "../data/cba.txt";

const router = Router();
router.use(requireSteward);

const BARGAINING_SYSTEM_PROMPT = `You are a collective bargaining preparation assistant for Unifor Local 1285 operating under Ontario labor law. When given a list of member complaints and workplace issues, analyze them and produce a formal Bargaining Prep Report.

Your response MUST be valid JSON with exactly this structure:
{
  "topIssues": [
    {
      "rank": 1,
      "title": "Short title of the issue",
      "category": "Category name",
      "summary": "Plain language summary of the issue (2-3 sentences)",
      "affectedMembers": "Estimated number or description of affected members",
      "currentLanguage": "Current collective agreement language that is inadequate or missing (quote specific articles if possible)",
      "proposedLanguage": "Proposed new contract language written in standard collective agreement style",
      "articleReference": "Relevant CBA article numbers if applicable"
    }
  ],
  "bargainingStrategy": "Overall bargaining strategy recommendations (3-5 sentences)",
  "nationalPatternIssues": ["Issue 1 to escalate to Unifor National", "Issue 2", "..."]
}

Rules:
- Return EXACTLY 5 items in topIssues, ranked by frequency and severity
- Use formal collective agreement drafting language for all proposed articles
- Always note that final language must be reviewed by the Unifor National representative before tabling
- Base your analysis on Ontario labour law and the OLRA
- Reference specific CBA articles wherever possible using the collective agreement text provided`;

const CATEGORY_MAP: Record<string, string> = {
  scheduling: "Scheduling",
  discipline: "Discipline",
  overtime: "Overtime",
  benefits: "Benefits",
  seniority: "Seniority",
  working_conditions: "Working Conditions",
  harassment: "Harassment",
  health_safety: "Health & Safety",
  wages: "Wages",
  other: "Other",
};

// ─── GET /bargaining/issues — auto-pull grievances from DB ─────────────────────
router.get(
  "/issues",
  asyncHandler(async (req, res) => {
    const grievances = await db
      .select({
        id: grievancesTable.id,
        title: grievancesTable.title,
        description: grievancesTable.description,
        grievanceType: grievancesTable.grievanceType,
        status: grievancesTable.status,
        step: grievancesTable.step,
        remedyRequested: grievancesTable.remedyRequested,
        contractArticle: grievancesTable.contractArticle,
        memberId: grievancesTable.memberId,
        filedDate: grievancesTable.filedDate,
        memberName: membersTable.name,
        memberDepartment: membersTable.department,
      })
      .from(grievancesTable)
      .leftJoin(membersTable, eq(grievancesTable.memberId, membersTable.id))
      .orderBy(desc(grievancesTable.createdAt));

    // Group by category
    const grouped: Record<string, {
      category: string;
      count: number;
      issues: Array<{
        id: number;
        title: string;
        description: string | null;
        status: string;
        step: number;
        remedy: string | null;
        article: string | null;
        memberName: string | null;
        department: string | null;
        filedDate: string;
      }>;
    }> = {};

    for (const g of grievances) {
      const rawCat = g.grievanceType ?? "other";
      const cat = CATEGORY_MAP[rawCat] ?? CATEGORY_MAP.other;
      if (!grouped[rawCat]) {
        grouped[rawCat] = { category: cat, count: 0, issues: [] };
      }
      grouped[rawCat].count++;
      grouped[rawCat].issues.push({
        id: g.id,
        title: g.title,
        description: g.description,
        status: g.status,
        step: g.step,
        remedy: g.remedyRequested,
        article: g.contractArticle,
        memberName: g.memberName ?? null,
        department: g.memberDepartment ?? null,
        filedDate: g.filedDate,
      });
    }

    const categories = Object.entries(grouped)
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([key, val]) => ({ key, ...val }));

    res.json({ total: grievances.length, categories });
  })
);

// ─── POST /bargaining/analyze — generate AI report ────────────────────────────
router.post(
  "/analyze",
  asyncHandler(async (req, res) => {
    const { categories, manualIssues } = req.body as {
      categories: Array<{
        category: string;
        count: number;
        issues: Array<{ title: string; description?: string; remedy?: string; article?: string; department?: string }>;
      }>;
      manualIssues: string[];
    };

    if (!categories?.length && !manualIssues?.length) {
      res.status(400).json({ error: "No issues provided for analysis" });
      return;
    }

    // Build the issues summary for the prompt
    let issuesSummary = "MEMBER COMPLAINTS AND WORKPLACE ISSUES FROM DATABASE:\n\n";

    for (const cat of (categories ?? [])) {
      issuesSummary += `CATEGORY: ${cat.category} (${cat.count} grievance${cat.count !== 1 ? "s" : ""})\n`;
      for (const issue of cat.issues.slice(0, 8)) {
        issuesSummary += `  - ${issue.title}`;
        if (issue.department) issuesSummary += ` [${issue.department}]`;
        if (issue.description) issuesSummary += `\n    Description: ${issue.description.slice(0, 200)}`;
        if (issue.remedy) issuesSummary += `\n    Remedy sought: ${issue.remedy}`;
        if (issue.article) issuesSummary += `\n    Article cited: ${issue.article}`;
        issuesSummary += "\n";
      }
      issuesSummary += "\n";
    }

    if (manualIssues?.length) {
      issuesSummary += "ADDITIONAL ISSUES ADDED BY STEWARD:\n";
      for (const issue of manualIssues) {
        issuesSummary += `  - ${issue}\n`;
      }
      issuesSummary += "\n";
    }

    const cbaSnippet = typeof cbaText === "string" ? cbaText.slice(0, 12000) : "";
    const fullPrompt = `${issuesSummary}\nCOLLECTIVE AGREEMENT TEXT (excerpt):\n${cbaSnippet}\n\nGenerate the Bargaining Prep Report as valid JSON following the exact structure specified.`;

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_FLASH_LITE_MODEL,
        config: {
          systemInstruction: BARGAINING_SYSTEM_PROMPT,
          maxOutputTokens: GEMINI_MAX_TOKENS,
          temperature: 0.4,
          responseMimeType: "application/json",
        },
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
      });

      const rawText = response.text ?? "";
      let reportData: unknown;
      try {
        reportData = JSON.parse(rawText);
      } catch {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          reportData = JSON.parse(jsonMatch[0]);
        } else {
          logger.error({ rawText: rawText.slice(0, 500) }, "Bargaining AI returned non-JSON");
          res.status(502).json({ error: "AI returned an unexpected format. Please try again." });
          return;
        }
      }

      res.json({ reportData });
    } catch (err) {
      logger.error({ err }, "Bargaining Gemini call failed");
      res.status(502).json({ error: "AI analysis failed. Please try again." });
    }
  })
);

// ─── GET /bargaining/reports — list saved reports ─────────────────────────────
router.get(
  "/reports",
  asyncHandler(async (_req, res) => {
    const reports = await db
      .select({
        id: bargainingReportsTable.id,
        title: bargainingReportsTable.title,
        status: bargainingReportsTable.status,
        createdBy: bargainingReportsTable.createdBy,
        createdAt: bargainingReportsTable.createdAt,
        updatedAt: bargainingReportsTable.updatedAt,
      })
      .from(bargainingReportsTable)
      .orderBy(desc(bargainingReportsTable.createdAt));
    res.json(reports);
  })
);

// ─── POST /bargaining/reports — save a report ─────────────────────────────────
router.post(
  "/reports",
  asyncHandler(async (req, res) => {
    const { title, issuesData, reportData, editedLanguage } = req.body;
    if (!title || !reportData) {
      res.status(400).json({ error: "title and reportData are required" });
      return;
    }
    const userId = (req as any).session?.userId ?? null;
    const [report] = await db
      .insert(bargainingReportsTable)
      .values({ title, issuesData: issuesData ?? null, reportData, editedLanguage: editedLanguage ?? null, createdBy: userId, status: "saved" })
      .returning();
    res.status(201).json(report);
  })
);

// ─── GET /bargaining/reports/:id ──────────────────────────────────────────────
router.get(
  "/reports/:id",
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    const [report] = await db.select().from(bargainingReportsTable).where(eq(bargainingReportsTable.id, id));
    if (!report) { res.status(404).json({ error: "Report not found" }); return; }
    res.json(report);
  })
);

// ─── PATCH /bargaining/reports/:id ────────────────────────────────────────────
router.patch(
  "/reports/:id",
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    const { title, editedLanguage, status } = req.body;
    const [updated] = await db
      .update(bargainingReportsTable)
      .set({ title, editedLanguage, status, updatedAt: new Date() })
      .where(eq(bargainingReportsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Report not found" }); return; }
    res.json(updated);
  })
);

// ─── DELETE /bargaining/reports/:id ───────────────────────────────────────────
router.delete(
  "/reports/:id",
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    await db.delete(bargainingReportsTable).where(eq(bargainingReportsTable.id, id));
    res.json({ ok: true });
  })
);

export default router;
