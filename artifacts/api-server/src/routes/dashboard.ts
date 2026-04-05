import { Router } from "express";
import { db, membersTable, grievancesTable, announcementsTable } from "@workspace/db";
import { desc, sql } from "drizzle-orm";

const router = Router();

router.get("/summary", async (_req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  firstOfMonth.setHours(0, 0, 0, 0);

  const [memberStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where is_active = true)::int`,
    })
    .from(membersTable);

  const [grievanceStats] = await db
    .select({
      open: sql<number>`count(*) filter (where status in ('open','pending_response','pending_hearing'))::int`,
      overdue: sql<number>`count(*) filter (where due_date < ${today} and status not in ('resolved','withdrawn'))::int`,
      thisMonth: sql<number>`count(*) filter (where filed_date >= ${firstOfMonth.toISOString().split("T")[0]})::int`,
    })
    .from(grievancesTable);

  const [announcementStats] = await db
    .select({
      urgent: sql<number>`count(*) filter (where is_urgent = true)::int`,
    })
    .from(announcementsTable);

  res.json({
    totalMembers: memberStats.total,
    activeMembers: memberStats.active,
    openGrievances: grievanceStats.open,
    overdueGrievances: grievanceStats.overdue,
    grievancesThisMonth: grievanceStats.thisMonth,
    urgentAnnouncements: announcementStats.urgent,
  });
});

router.get("/recent-activity", async (_req, res) => {
  const recentGrievances = await db
    .select()
    .from(grievancesTable)
    .orderBy(desc(grievancesTable.updatedAt))
    .limit(5);

  const recentAnnouncements = await db
    .select()
    .from(announcementsTable)
    .orderBy(desc(announcementsTable.publishedAt))
    .limit(5);

  res.json({
    recentGrievances: recentGrievances.map((g) => ({
      id: g.id,
      grievanceNumber: g.grievanceNumber,
      memberId: g.memberId ?? null,
      memberName: null,
      title: g.title,
      description: g.description ?? null,
      contractArticle: g.contractArticle ?? null,
      step: g.step,
      status: g.status,
      filedDate: g.filedDate,
      dueDate: g.dueDate ?? null,
      resolvedDate: g.resolvedDate ?? null,
      resolution: g.resolution ?? null,
      notes: g.notes ?? null,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    })),
    recentAnnouncements: recentAnnouncements.map((a) => ({
      id: a.id,
      title: a.title,
      content: a.content,
      category: a.category,
      isUrgent: a.isUrgent,
      publishedAt: a.publishedAt.toISOString(),
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    })),
  });
});

export default router;
