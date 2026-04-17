import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin } from "../lib/permissions";

const router = Router();

router.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const entityType = req.query.entityType as string | undefined;

  const client = await pool.connect();
  try {
    const conditions: string[] = [];
    const params: unknown[] = [limit, offset];

    if (entityType) {
      params.push(entityType);
      conditions.push(`al.entity_type = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await client.query(
      `SELECT
         al.id,
         al.action,
         al.entity_type,
         al.entity_id,
         al.ip_address,
         al.created_at,
         u.display_name AS actor_name,
         al.old_value,
         al.new_value
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT $1 OFFSET $2`,
      params,
    );

    const { rows: countRows } = await client.query(
      `SELECT count(*)::int AS total FROM audit_logs ${where}`,
      conditions.length ? [entityType] : [],
    );

    res.json({ logs: rows, total: countRows[0].total, limit, offset });
  } finally {
    client.release();
  }
});

router.delete("/", requireAdmin, async (_req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query("SELECT count(*)::int AS n FROM audit_logs");
    const cleared = rows[0].n;
    await client.query("TRUNCATE TABLE audit_logs RESTART IDENTITY");
    res.json({ ok: true, cleared });
  } finally {
    client.release();
  }
});

export default router;
