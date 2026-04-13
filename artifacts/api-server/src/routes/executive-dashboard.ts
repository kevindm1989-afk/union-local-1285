import { Router } from "express";
import { pool } from "@workspace/db";
import { requireSteward } from "../lib/permissions";
import { asyncHandler } from "../lib/asyncHandler";
import { logger } from "../lib/logger";

const router = Router();
router.use(requireSteward);

router.get("/", asyncHandler(async (_req, res) => {
  const client = await pool.connect();
  try {
    const [
      grievanceRows,
      grievanceStepRows,
      deadlinesIn7Rows,
      overdueRows,
      closedOutcomeRows,
      complaintOpenRows,
      complaintPatternRows,
      complaintCategoryRows,
      complaintEscalatedRows,
      memberActiveRows,
      memberArrearsRows,
      bulletinAckRows,
      activeVoteRows,
      lastCompletedVoteRows,
      lastBulletinRows,
      mobilizationBulletinsRows,
      seniorityMonthRows,
      seniorityPatternRows,
      seniorityTopTypeRows,
      deadlineGrievanceRows,
      deadlinePollRows,
      electionRows,
    ] = await Promise.all([
      // 1. Grievance open count + status breakdown
      client.query(`
        SELECT status, COUNT(*)::int as count
        FROM grievances
        WHERE status IN ('open','pending_response','pending_hearing')
        GROUP BY status
      `),
      // 2. Open grievances grouped by step
      client.query(`
        SELECT step, COUNT(*)::int as count
        FROM grievances
        WHERE status IN ('open','pending_response','pending_hearing')
        GROUP BY step ORDER BY step
      `),
      // 3. Deadlines in next 7 days (open + not yet overdue)
      client.query(`
        SELECT COUNT(*)::int as count
        FROM grievances
        WHERE status IN ('open','pending_response','pending_hearing')
          AND due_date IS NOT NULL
          AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
      `),
      // 4. Overdue grievances
      client.query(`
        SELECT COUNT(*)::int as count
        FROM grievances
        WHERE status IN ('open','pending_response','pending_hearing')
          AND due_date IS NOT NULL
          AND due_date < CURRENT_DATE
      `),
      // 5. Closed outcome breakdown
      client.query(`
        SELECT
          COALESCE(outcome, 'unknown') as outcome,
          COUNT(*)::int as count
        FROM grievances
        WHERE status IN ('resolved','withdrawn')
        GROUP BY outcome
      `),
      // 6. Open complaints count
      client.query(`
        SELECT COUNT(*)::int as count
        FROM member_complaints
        WHERE status IN ('open','monitoring')
      `),
      // 7. Complaint patterns (3+ same category in 30 days)
      client.query(`
        SELECT category, COUNT(*)::int as count
        FROM member_complaints
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY category
        HAVING COUNT(*) >= 3
        ORDER BY count DESC
      `),
      // 8. Open complaint category breakdown
      client.query(`
        SELECT category, COUNT(*)::int as count
        FROM member_complaints
        WHERE status IN ('open','monitoring')
        GROUP BY category
        ORDER BY count DESC
      `),
      // 9. Escalated to grievances this month
      client.query(`
        SELECT COUNT(*)::int as count
        FROM member_complaints
        WHERE linked_grievance_id IS NOT NULL
          AND created_at >= date_trunc('month', NOW())
      `),
      // 10. Active member count
      client.query(`SELECT COUNT(*)::int as count FROM members WHERE is_active = true`),
      // 11. Members with dues in arrears
      client.query(`
        SELECT COUNT(*)::int as count
        FROM members
        WHERE is_active = true
          AND dues_status IN ('arrears','late','behind','overdue')
      `),
      // 12. Last 3 bulletins with ack rates
      client.query(`
        SELECT
          a.id,
          a.title,
          a.published_at,
          a.category,
          (SELECT COUNT(DISTINCT ba.member_id)::int
           FROM bulletin_acknowledgements ba
           WHERE ba.announcement_id = a.id) AS ack_count,
          (SELECT COUNT(*)::int FROM members WHERE is_active = true) AS total_active
        FROM announcements a
        WHERE (a.is_published IS NULL OR a.is_published = true)
          AND a.published_at IS NOT NULL
        ORDER BY a.published_at DESC
        LIMIT 3
      `),
      // 13. Active polls with participation counts
      client.query(`
        SELECT
          p.id, p.title, p.ends_at, p.poll_type, p.is_active,
          (SELECT COUNT(*)::int FROM poll_responses pr WHERE pr.poll_id = p.id) AS votes_cast,
          (SELECT COUNT(*)::int FROM members WHERE is_active = true) AS eligible
        FROM polls p
        WHERE p.is_active = true AND p.ends_at > NOW()
        ORDER BY p.ends_at ASC
      `),
      // 14. Most recent completed poll for participation rate
      client.query(`
        SELECT
          p.id, p.title, p.ends_at,
          (SELECT COUNT(*)::int FROM poll_responses pr WHERE pr.poll_id = p.id) AS votes_cast,
          (SELECT COUNT(*)::int FROM members WHERE is_active = true) AS eligible
        FROM polls p
        WHERE p.is_active = false OR p.ends_at < NOW()
        ORDER BY p.ends_at DESC
        LIMIT 1
      `),
      // 15. Last published bulletin
      client.query(`
        SELECT id, title, category, is_urgent, published_at
        FROM announcements
        WHERE (is_published IS NULL OR is_published = true)
          AND published_at IS NOT NULL
        ORDER BY published_at DESC
        LIMIT 1
      `),
      // 16. Active mobilization/strike/job action bulletins
      client.query(`
        SELECT id, title, category, published_at
        FROM announcements
        WHERE category IN ('strike_action','job_action','safety_alert')
          AND (is_published IS NULL OR is_published = true)
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY published_at DESC
        LIMIT 5
      `),
      // 17. Seniority disputes this month
      client.query(`
        SELECT COUNT(*)::int as count
        FROM seniority_disputes
        WHERE created_at >= date_trunc('month', NOW())
      `),
      // 18. Seniority dispute patterns (3+ same type in 60 days)
      client.query(`
        SELECT dispute_type, COUNT(*)::int as count
        FROM seniority_disputes
        WHERE created_at > NOW() - INTERVAL '60 days'
        GROUP BY dispute_type
        HAVING COUNT(*) >= 3
        ORDER BY count DESC
      `),
      // 19. Most common dispute type overall
      client.query(`
        SELECT dispute_type, COUNT(*)::int as count
        FROM seniority_disputes
        GROUP BY dispute_type
        ORDER BY count DESC
        LIMIT 1
      `),
      // 20. Next 5 grievance deadlines
      client.query(`
        SELECT g.id, g.title, g.due_date, g.step, g.status,
               m.name AS member_name
        FROM grievances g
        LEFT JOIN members m ON m.id = g.member_id
        WHERE g.status IN ('open','pending_response','pending_hearing')
          AND g.due_date IS NOT NULL
        ORDER BY g.due_date ASC
        LIMIT 5
      `),
      // 21. Upcoming poll closings
      client.query(`
        SELECT id, title, ends_at,
          (SELECT COUNT(*)::int FROM poll_responses pr WHERE pr.poll_id = polls.id) AS votes_cast
        FROM polls
        WHERE is_active = true AND ends_at > NOW()
        ORDER BY ends_at ASC
        LIMIT 3
      `),
      // 22. Active formal elections
      client.query(`
        SELECT id, title, ends_at, status
        FROM formal_elections
        WHERE status IN ('open','active')
        ORDER BY ends_at ASC
        LIMIT 3
      `).catch(() => ({ rows: [] })),
    ]);

    // ── Reshape ──────────────────────────────────────────────────────────────

    const grievanceStatusMap: Record<string, number> = {};
    for (const r of grievanceRows.rows) grievanceStatusMap[r.status] = r.count;
    const totalOpenGrievances = Object.values(grievanceStatusMap).reduce((a, b) => a + b, 0);

    const closedMap: Record<string, number> = {};
    let withdrawnCount = 0;
    for (const r of closedOutcomeRows.rows) {
      if (r.outcome === "withdrawn" || r.outcome === null) withdrawnCount += r.count;
      else closedMap[r.outcome] = (closedMap[r.outcome] ?? 0) + r.count;
    }

    const activeMemberCount = memberActiveRows.rows[0]?.count ?? 0;

    const bulletinAckData = (bulletinAckRows.rows as any[]).map((b) => ({
      id: b.id,
      title: b.title,
      publishedAt: b.published_at?.toISOString() ?? null,
      category: b.category,
      ackCount: b.ack_count ?? 0,
      totalActive: b.total_active ?? 0,
      ackRate: b.total_active > 0 ? Math.round((b.ack_count / b.total_active) * 100) : 0,
    }));

    const lastVote = lastCompletedVoteRows.rows[0] ?? null;

    const now = new Date();
    const response = {
      grievances: {
        totalOpen: totalOpenGrievances,
        byStatus: grievanceStatusMap,
        byStep: grievanceStepRows.rows as { step: number; count: number }[],
        deadlinesIn7Days: deadlinesIn7Rows.rows[0]?.count ?? 0,
        overdue: overdueRows.rows[0]?.count ?? 0,
        closedRatio: {
          ...closedMap,
          withdrawn: withdrawnCount,
        },
      },
      complaints: {
        totalOpen: complaintOpenRows.rows[0]?.count ?? 0,
        patterns: complaintPatternRows.rows as { category: string; count: number }[],
        byCategory: complaintCategoryRows.rows as { category: string; count: number }[],
        escalatedThisMonth: complaintEscalatedRows.rows[0]?.count ?? 0,
      },
      members: {
        totalActive: activeMemberCount,
        duesInArrears: memberArrearsRows.rows[0]?.count ?? 0,
        bulletinAcknowledgements: bulletinAckData,
        lastVoteParticipation: lastVote
          ? {
              id: lastVote.id,
              title: lastVote.title,
              endsAt: lastVote.ends_at?.toISOString() ?? null,
              votesCast: lastVote.votes_cast ?? 0,
              eligible: lastVote.eligible ?? 0,
              participationRate: lastVote.eligible > 0
                ? Math.round((lastVote.votes_cast / lastVote.eligible) * 100)
                : 0,
            }
          : null,
      },
      mobilization: {
        lastBulletin: lastBulletinRows.rows[0]
          ? {
              id: lastBulletinRows.rows[0].id,
              title: lastBulletinRows.rows[0].title,
              category: lastBulletinRows.rows[0].category,
              isUrgent: lastBulletinRows.rows[0].is_urgent,
              publishedAt: lastBulletinRows.rows[0].published_at?.toISOString() ?? null,
            }
          : null,
        activeVotes: (activeVoteRows.rows as any[]).map((p) => ({
          id: p.id,
          title: p.title,
          endsAt: p.ends_at?.toISOString() ?? null,
          votesCast: p.votes_cast ?? 0,
          eligible: p.eligible ?? 0,
        })),
        activeElections: (electionRows.rows as any[]).map((e) => ({
          id: e.id,
          title: e.title,
          endsAt: e.ends_at?.toISOString() ?? null,
          status: e.status,
        })),
        strikeOrJobActionBulletins: (mobilizationBulletinsRows.rows as any[]).map((b) => ({
          id: b.id,
          title: b.title,
          category: b.category,
          publishedAt: b.published_at?.toISOString() ?? null,
        })),
      },
      seniorityDisputes: {
        thisMonth: seniorityMonthRows.rows[0]?.count ?? 0,
        activePatterns: seniorityPatternRows.rows as { dispute_type: string; count: number }[],
        mostCommonType: seniorityTopTypeRows.rows[0]?.dispute_type ?? null,
        mostCommonTypeCount: seniorityTopTypeRows.rows[0]?.count ?? 0,
      },
      upcomingDeadlines: {
        grievances: (deadlineGrievanceRows.rows as any[]).map((g) => ({
          id: g.id,
          title: g.title,
          dueDate: g.due_date instanceof Date ? g.due_date.toISOString().split("T")[0] : g.due_date,
          step: g.step,
          status: g.status,
          memberName: g.member_name ?? null,
          daysUntilDue: Math.ceil(
            (new Date(g.due_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          ),
        })),
        polls: (deadlinePollRows.rows as any[]).map((p) => ({
          id: p.id,
          title: p.title,
          endsAt: p.ends_at?.toISOString() ?? null,
          votesCast: p.votes_cast ?? 0,
          daysUntil: Math.ceil(
            (new Date(p.ends_at).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          ),
        })),
      },
      generatedAt: now.toISOString(),
    };

    res.json(response);
  } catch (err) {
    logger.error({ err }, "Executive dashboard query failed");
    res.status(500).json({ error: "Failed to load dashboard data", code: "QUERY_ERROR" });
  } finally {
    client.release();
  }
}));

export default router;
