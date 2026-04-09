import { Router } from "express";
import { db, grievanceTemplatesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireSteward } from "../lib/permissions";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

router.use(requireSteward);

const STARTER_TEMPLATES = [
  {
    title: "Unjust Discipline",
    violationType: "discipline" as const,
    descriptionTemplate: "Management has imposed discipline without just cause. The employee was issued [type of discipline] on [date] for alleged [reason]. The discipline is not supported by the facts and violates the collective agreement.",
    contractArticle: "Article 7 — Discipline",
    defaultStep: 1,
  },
  {
    title: "Seniority Bypass",
    violationType: "seniority_bypass" as const,
    descriptionTemplate: "Management failed to follow seniority provisions when filling [position/overtime/shift]. Senior employee [name] was bypassed in favour of [junior employee] without a valid contractual reason.",
    contractArticle: "Article 14 — Seniority",
    defaultStep: 1,
  },
  {
    title: "Scheduling Violation",
    violationType: "scheduling" as const,
    descriptionTemplate: "The Employer violated the scheduling provisions of the collective agreement when [describe the violation]. The schedule change/assignment was made without proper notice and contrary to established practice.",
    contractArticle: "Article 15 — Hours of Work",
    defaultStep: 1,
  },
  {
    title: "Wage Discrepancy",
    violationType: "wages" as const,
    descriptionTemplate: "The Employer failed to properly compensate the employee for [work performed]. The employee is entitled to [rate/premium] pursuant to the collective agreement but was paid only [amount/rate paid].",
    contractArticle: "Article 18 — Wages and Classifications",
    defaultStep: 1,
  },
  {
    title: "Failure to Accommodate",
    violationType: "benefits" as const,
    descriptionTemplate: "The Employer has failed to accommodate the employee's [disability/medical/religious] needs to the point of undue hardship as required by the collective agreement and applicable human rights legislation.",
    contractArticle: "Article 9 — Non-Discrimination",
    defaultStep: 1,
  },
  {
    title: "Harassment/Bullying",
    violationType: "harassment" as const,
    descriptionTemplate: "The employee has been subjected to workplace harassment and/or bullying by [management/co-worker] contrary to the collective agreement's harassment provisions and the Employer's own policy. The conduct includes [describe].",
    contractArticle: "Article 9 — Non-Discrimination and Harassment",
    defaultStep: 1,
  },
];

router.get("/", asyncHandler(async (_req, res) => {
  const templates = await db
    .select()
    .from(grievanceTemplatesTable)
    .where(eq(grievanceTemplatesTable.isActive, true));

  res.json(templates.map((t) => ({
    id: t.id,
    title: t.title,
    violationType: t.violationType,
    descriptionTemplate: t.descriptionTemplate,
    contractArticle: t.contractArticle,
    defaultStep: t.defaultStep,
    createdBy: t.createdBy,
    createdAt: t.createdAt.toISOString(),
  })));
}));

router.post("/", asyncHandler(async (req, res) => {
  if (req.session?.role !== "admin" && req.session?.role !== "chair") {
    res.status(403).json({ error: "Admin only", code: "FORBIDDEN" }); return;
  }
  const { title, violationType, descriptionTemplate, contractArticle, defaultStep } = req.body as Record<string, unknown>;
  if (!title || !descriptionTemplate) {
    res.status(400).json({ error: "title and descriptionTemplate required", code: "INVALID_BODY" }); return;
  }
  const [t] = await db.insert(grievanceTemplatesTable).values({
    title: title as string,
    violationType: (violationType as "discipline" | "scheduling" | "seniority_bypass" | "harassment" | "health_safety" | "wages" | "benefits" | "other") ?? "other",
    descriptionTemplate: descriptionTemplate as string,
    contractArticle: (contractArticle as string) ?? null,
    defaultStep: typeof defaultStep === "number" ? defaultStep : 1,
    createdBy: req.session?.userId ?? null,
  }).returning();
  res.status(201).json(t);
}));

router.patch("/:id", asyncHandler(async (req, res) => {
  if (req.session?.role !== "admin" && req.session?.role !== "chair") {
    res.status(403).json({ error: "Admin only", code: "FORBIDDEN" }); return;
  }
  const id = parseInt(req.params.id as string, 10);
  const { title, violationType, descriptionTemplate, contractArticle, defaultStep } = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  if (title) updates.title = title;
  if (violationType) updates.violationType = violationType;
  if (descriptionTemplate) updates.descriptionTemplate = descriptionTemplate;
  if (contractArticle !== undefined) updates.contractArticle = contractArticle;
  if (defaultStep !== undefined) updates.defaultStep = defaultStep;
  const [t] = await db.update(grievanceTemplatesTable).set(updates).where(eq(grievanceTemplatesTable.id, id)).returning();
  if (!t) { res.status(404).json({ error: "Not found", code: "NOT_FOUND" }); return; }
  res.json(t);
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  if (req.session?.role !== "admin" && req.session?.role !== "chair") {
    res.status(403).json({ error: "Admin only", code: "FORBIDDEN" }); return;
  }
  const id = parseInt(req.params.id as string, 10);
  await db.update(grievanceTemplatesTable).set({ isActive: false }).where(eq(grievanceTemplatesTable.id, id));
  res.status(204).end();
}));

export { STARTER_TEMPLATES };
export default router;
