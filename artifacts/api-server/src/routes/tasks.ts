import { Router } from "express";
import { db, tasksTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  CreateTaskBody,
  UpdateTaskBody,
  ListTasksQueryParams,
  GetTaskParams,
  UpdateTaskParams,
  DeleteTaskParams,
  GetRecentTasksQueryParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/", async (req, res) => {
  const parsed = ListTasksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }

  const { status, priority } = parsed.data;
  const conditions = [];
  if (status) conditions.push(eq(tasksTable.status, status));
  if (priority) conditions.push(eq(tasksTable.priority, priority));

  const tasks = await db
    .select()
    .from(tasksTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(tasksTable.updatedAt));

  res.json(tasks.map(formatTask));
});

router.post("/", async (req, res) => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const [task] = await db
    .insert(tasksTable)
    .values({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      status: parsed.data.status ?? "pending",
      priority: parsed.data.priority ?? "medium",
      dueDate: parsed.data.dueDate ?? null,
    })
    .returning();

  res.status(201).json(formatTask(task));
});

router.get("/stats/summary", async (_req, res) => {
  const today = new Date().toISOString().split("T")[0];

  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where status = 'pending')::int`,
      in_progress: sql<number>`count(*) filter (where status = 'in_progress')::int`,
      completed: sql<number>`count(*) filter (where status = 'completed')::int`,
      high_priority: sql<number>`count(*) filter (where priority = 'high')::int`,
      due_today: sql<number>`count(*) filter (where due_date = ${today} and status != 'completed')::int`,
    })
    .from(tasksTable);

  res.json(row);
});

router.get("/recent", async (req, res) => {
  const parsed = GetRecentTasksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }

  const limit = parsed.data.limit ?? 5;
  const tasks = await db
    .select()
    .from(tasksTable)
    .orderBy(desc(tasksTable.updatedAt))
    .limit(limit);

  res.json(tasks.map(formatTask));
});

router.get("/:id", async (req, res) => {
  const parsed = GetTaskParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [task] = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, parsed.data.id));

  if (!task) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(formatTask(task));
});

router.patch("/:id", async (req, res) => {
  const paramParsed = UpdateTaskParams.safeParse({ id: Number(req.params.id) });
  if (!paramParsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const bodyParsed = UpdateTaskBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const data = bodyParsed.data;
  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description;
  if (data.status !== undefined) updates.status = data.status;
  if (data.priority !== undefined) updates.priority = data.priority;
  if (data.dueDate !== undefined) updates.dueDate = data.dueDate;

  const [task] = await db
    .update(tasksTable)
    .set(updates)
    .where(eq(tasksTable.id, paramParsed.data.id))
    .returning();

  if (!task) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(formatTask(task));
});

router.delete("/:id", async (req, res) => {
  const parsed = DeleteTaskParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  await db.delete(tasksTable).where(eq(tasksTable.id, parsed.data.id));
  res.status(204).end();
});

function formatTask(task: typeof tasksTable.$inferSelect) {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export default router;
