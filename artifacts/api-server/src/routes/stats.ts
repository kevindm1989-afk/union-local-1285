import { Router } from "express";
import { db, grievancesTable, membersTable } from "@workspace/db";
import { sql, desc } from "drizzle-orm";
import { requireSteward } from "../lib/permissions";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

router.use(requireSteward);

router.get("/overview", asyncHandler(async (_req, res) => {
  const today = new Date().toISOString().split("T")[0];

  // Status counts
  const [statusRow] = await db.select({
    total: sql<number>`count(*)::int`,
    open: sql<number>`count(*) filter (where status = 'open')::int`,
    pending_response: sql<number>`count(*) filter (where status = 'pending_response')::int`,
    pending_hearing: sql<number>`count(*) filter (where status = 'pending_hearing')::int`,
    resolved: sql<number>`count(*) filter (where status = 'resolved')::int`,
    withdrawn: sql<number>`count(*) filter (where status = 'withdrawn')::int`,
  }).from(grievancesTable);

  // By department (join members)
  const byDept = await db.execute(sql`
    SELECT COALESCE(m.department, 'Unknown') as department, count(*)::int as count
    FROM grievances g
    LEFT JOIN members m ON g.member_id = m.id
    GROUP BY COALESCE(m.department, 'Unknown')
    ORDER BY count DESC
    LIMIT 10
  `);

  // Top 5 contract articles
  const byArticle = await db.execute(sql`
    SELECT contract_article, count(*)::int as count
    FROM grievances
    WHERE contract_article IS NOT NULL AND contract_article != ''
    GROUP BY contract_article
    ORDER BY count DESC
    LIMIT 5
  `);

  // Avg days to resolution by step
  const avgResolution = await db.execute(sql`
    SELECT step, round(avg(extract(epoch from (resolved_date::timestamptz - filed_date::timestamptz)) / 86400))::int as avg_days
    FROM grievances
    WHERE status = 'resolved' AND resolved_date IS NOT NULL
    GROUP BY step
    ORDER BY step
  `);

  // Monthly trend last 12 months
  const monthlyTrend = await db.execute(sql`
    SELECT to_char(date_trunc('month', filed_date::timestamptz), 'YYYY-MM') as month,
           count(*)::int as count
    FROM grievances
    WHERE filed_date >= (current_date - interval '12 months')::text::date
    GROUP BY date_trunc('month', filed_date::timestamptz)
    ORDER BY month
  `);

  res.json({
    statusCounts: statusRow,
    byDepartment: byDept.rows,
    byContractArticle: byArticle.rows,
    avgDaysToResolution: avgResolution.rows,
    monthlyTrend: monthlyTrend.rows,
  });
}));

export default router;
