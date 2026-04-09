import { Router } from "express";
import { db, pollsTable, pollResponsesTable, usersTable } from "@workspace/db";
import { eq, and, lte, gte, sql } from "drizzle-orm";
import { sendPushToAll } from "./push";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

function fmt(p: typeof pollsTable.$inferSelect) {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    pollType: p.pollType,
    options: p.options,
    startsAt: p.startsAt.toISOString(),
    endsAt: p.endsAt.toISOString(),
    createdBy: p.createdBy,
    isActive: p.isActive,
    targetRole: p.targetRole,
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/", asyncHandler(async (req, res) => {
  const role = req.session?.role ?? "member";
  const now = new Date();
  const polls = await db
    .select()
    .from(pollsTable)
    .where(
      and(
        eq(pollsTable.isActive, true),
        lte(pollsTable.startsAt, now),
      )
    )
    .orderBy(pollsTable.endsAt);

  const filtered = polls.filter((p) => {
    if (p.targetRole === "all") return true;
    if (p.targetRole === "member" && role === "member") return true;
    if (p.targetRole === "steward" && role !== "member") return true;
    return false;
  });

  // Attach user's response if any
  const userId = req.session?.userId;
  const withResponse = await Promise.all(filtered.map(async (p) => {
    let userResponse = null;
    if (userId) {
      const [r] = await db.select({ response: pollResponsesTable.response }).from(pollResponsesTable).where(and(eq(pollResponsesTable.pollId, p.id), eq(pollResponsesTable.userId, userId)));
      userResponse = r?.response ?? null;
    }
    return { ...fmt(p), userResponse, isExpired: new Date(p.endsAt) < now };
  }));

  res.json(withResponse);
}));

router.post("/", asyncHandler(async (req, res) => {
  if (req.session?.role !== "admin" && req.session?.role !== "chair") {
    res.status(403).json({ error: "Admin only", code: "FORBIDDEN" }); return;
  }
  const body = req.body as Record<string, unknown>;
  if (!body.title || !body.endsAt) {
    res.status(400).json({ error: "title and endsAt required", code: "INVALID_BODY" }); return;
  }
  const [p] = await db.insert(pollsTable).values({
    title: body.title as string,
    description: (body.description as string) ?? null,
    pollType: (body.pollType as "yes_no" | "multiple_choice") ?? "yes_no",
    options: (body.options as string[]) ?? [],
    startsAt: body.startsAt ? new Date(body.startsAt as string) : new Date(),
    endsAt: new Date(body.endsAt as string),
    createdBy: req.session?.userId ?? null,
    targetRole: (body.targetRole as "all" | "member" | "steward") ?? "all",
  }).returning();

  // Push notification to relevant users
  sendPushToAll({
    title: `New Poll: ${p.title}`,
    body: p.description ?? "A new poll is available — tap to vote.",
    url: "/polls",
  }).catch(() => undefined);

  res.status(201).json(fmt(p));
}));

router.post("/:id/respond", asyncHandler(async (req, res) => {
  const pollId = parseInt(req.params.id as string, 10);
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated", code: "UNAUTHENTICATED" }); return; }

  const [poll] = await db.select().from(pollsTable).where(eq(pollsTable.id, pollId));
  if (!poll) { res.status(404).json({ error: "Poll not found", code: "NOT_FOUND" }); return; }
  if (!poll.isActive || new Date(poll.endsAt) < new Date()) {
    res.status(400).json({ error: "Poll is closed", code: "POLL_CLOSED" }); return;
  }

  // Check already voted
  const [existing] = await db.select().from(pollResponsesTable).where(and(eq(pollResponsesTable.pollId, pollId), eq(pollResponsesTable.userId, userId)));
  if (existing) { res.status(409).json({ error: "Already voted", code: "ALREADY_VOTED" }); return; }

  const { response } = req.body as { response: string };
  if (!response) { res.status(400).json({ error: "response required", code: "INVALID_BODY" }); return; }

  await db.insert(pollResponsesTable).values({ pollId, userId, response });
  res.status(201).json({ ok: true });
}));

router.get("/:id/results", asyncHandler(async (req, res) => {
  const pollId = parseInt(req.params.id as string, 10);
  const role = req.session?.role ?? "member";
  const [poll] = await db.select().from(pollsTable).where(eq(pollsTable.id, pollId));
  if (!poll) { res.status(404).json({ error: "Poll not found", code: "NOT_FOUND" }); return; }

  const pollExpired = new Date(poll.endsAt) < new Date();
  if (!pollExpired && role === "member") {
    res.status(403).json({ error: "Results available after poll closes", code: "FORBIDDEN" }); return;
  }

  const responses = await db
    .select({ response: pollResponsesTable.response, count: sql<number>`count(*)::int` })
    .from(pollResponsesTable)
    .where(eq(pollResponsesTable.pollId, pollId))
    .groupBy(pollResponsesTable.response);

  const total = responses.reduce((sum, r) => sum + r.count, 0);
  res.json({ poll: fmt(poll), total, results: responses });
}));

router.patch("/:id", asyncHandler(async (req, res) => {
  if (req.session?.role !== "admin" && req.session?.role !== "chair") {
    res.status(403).json({ error: "Admin only", code: "FORBIDDEN" }); return;
  }
  const id = parseInt(req.params.id as string, 10);
  const body = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);
  if (body.endsAt) updates.endsAt = new Date(body.endsAt as string);
  const [p] = await db.update(pollsTable).set(updates).where(eq(pollsTable.id, id)).returning();
  if (!p) { res.status(404).json({ error: "Not found", code: "NOT_FOUND" }); return; }
  res.json(fmt(p));
}));

export default router;
