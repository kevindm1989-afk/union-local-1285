import { Router, type Request, type Response } from "express";
import { pool, db, memberComplaintsTable } from "@workspace/db";
import { asyncHandler } from "../lib/asyncHandler";
import { logger } from "../lib/logger";
import { z } from "zod/v4";
import { sendPushToUsers } from "./push";

const router = Router();

const INCIDENT_TYPES = ["harassment", "denied_rights", "scheduling", "discipline", "overtime", "seniority", "other"] as const;
const SHIFTS = ["days", "afternoons", "nights", "rotating"] as const;

const INCIDENT_TYPE_LABELS: Record<string, string> = {
  harassment: "Harassment",
  denied_rights: "Denied Rights",
  scheduling: "Scheduling",
  discipline: "Discipline",
  overtime: "Overtime",
  seniority: "Seniority",
  other: "Other",
};

const INCIDENT_TO_CATEGORY: Record<string, string> = {
  harassment: "harassment",
  denied_rights: "working_conditions",
  scheduling: "scheduling",
  discipline: "discipline",
  overtime: "overtime",
  seniority: "seniority",
  other: "other",
};

const createEntrySchema = z.object({
  incidentType: z.enum(INCIDENT_TYPES),
  incidentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  incidentTime: z.string().optional().nullable(),
  shift: z.enum(SHIFTS),
  location: z.string().min(1).max(255),
  department: z.string().max(255).optional().nullable(),
  description: z.string().min(10).max(2000),
  personsInvolved: z.string().max(500).optional().nullable(),
  managementDocumentationIssued: z.boolean().default(false),
  unionRepPresent: z.boolean().default(false),
  stewardNotified: z.boolean().default(false),
  attachmentUrl: z.string().max(1000).optional().nullable(),
  urgent: z.boolean().default(false),
});

function requireLinkedMember(req: Request, res: Response): number | null {
  const linkedMemberId = req.session?.linkedMemberId;
  if (!linkedMemberId) {
    res.status(403).json({ error: "Member portal access only — no linked member profile" });
    return null;
  }
  return linkedMemberId;
}

// ─── GET / — list own entries (newest first) ──────────────────────────────────
router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const memberId = requireLinkedMember(req, res);
    if (memberId === null) return;

    const client = await pool.connect();
    try {
      const entriesResult = await client.query<Record<string, unknown>>(
        `SELECT e.*,
          COALESCE(
            json_agg(a ORDER BY a.created_at ASC) FILTER (WHERE a.id IS NOT NULL),
            '[]'
          ) AS addendums
         FROM member_journal_entries e
         LEFT JOIN member_journal_addendums a ON a.journal_entry_id = e.id
         WHERE e.member_id = $1
         GROUP BY e.id
         ORDER BY e.created_at DESC`,
        [memberId]
      );
      res.json(entriesResult.rows);
    } finally {
      client.release();
    }
  })
);

// ─── POST / — create entry (auto-lock on save) ────────────────────────────────
router.post(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const memberId = requireLinkedMember(req, res);
    if (memberId === null) return;

    const parsed = createEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid entry data", details: parsed.error.issues });
      return;
    }

    const d = parsed.data;
    const client = await pool.connect();
    try {
      const result = await client.query<Record<string, unknown>>(
        `INSERT INTO member_journal_entries (
          member_id, incident_type, incident_date, incident_time, shift,
          location, department, description, persons_involved,
          management_documentation_issued, union_rep_present, steward_notified,
          attachment_url, urgent, shared, locked, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12,
          $13, $14, false, true, NOW(), NOW()
        ) RETURNING *`,
        [
          memberId,
          d.incidentType,
          d.incidentDate,
          d.incidentTime ?? null,
          d.shift,
          d.location,
          d.department ?? null,
          d.description,
          d.personsInvolved ?? null,
          d.managementDocumentationIssued,
          d.unionRepPresent,
          d.stewardNotified,
          d.attachmentUrl ?? null,
          d.urgent,
        ]
      );
      const entry = { ...result.rows[0], addendums: [] };
      res.status(201).json(entry);
    } finally {
      client.release();
    }
  })
);

// ─── POST /:id/addendum ───────────────────────────────────────────────────────
router.post(
  "/:id/addendum",
  asyncHandler(async (req: Request, res: Response) => {
    const memberId = requireLinkedMember(req, res);
    if (memberId === null) return;

    const entryId = parseInt(String(req.params.id), 10);
    if (isNaN(entryId)) { res.status(400).json({ error: "Invalid entry id" }); return; }

    const { content } = req.body;
    if (!content || typeof content !== "string" || content.trim().length < 3) {
      res.status(400).json({ error: "Addendum content must be at least 3 characters" });
      return;
    }
    if (content.length > 2000) {
      res.status(400).json({ error: "Addendum content too long (max 2000 chars)" });
      return;
    }

    const client = await pool.connect();
    try {
      const entryResult = await client.query<{ member_id: number }>(
        `SELECT member_id FROM member_journal_entries WHERE id = $1`,
        [entryId]
      );
      if (!entryResult.rows.length) { res.status(404).json({ error: "Entry not found" }); return; }
      if (entryResult.rows[0].member_id !== memberId) { res.status(403).json({ error: "Access denied" }); return; }

      const addResult = await client.query<Record<string, unknown>>(
        `INSERT INTO member_journal_addendums (journal_entry_id, content, created_at)
         VALUES ($1, $2, NOW()) RETURNING *`,
        [entryId, content.trim()]
      );
      res.status(201).json(addResult.rows[0]);
    } finally {
      client.release();
    }
  })
);

// ─── POST /:id/share — share to steward (one-way, cannot undo) ───────────────
router.post(
  "/:id/share",
  asyncHandler(async (req: Request, res: Response) => {
    const memberId = requireLinkedMember(req, res);
    if (memberId === null) return;

    const entryId = parseInt(String(req.params.id), 10);
    if (isNaN(entryId)) { res.status(400).json({ error: "Invalid entry id" }); return; }

    const client = await pool.connect();
    try {
      const entryResult = await client.query<Record<string, unknown>>(
        `SELECT e.*, m.name AS member_name, m.department AS member_department
         FROM member_journal_entries e
         JOIN members m ON m.id = e.member_id
         WHERE e.id = $1`,
        [entryId]
      );
      if (!entryResult.rows.length) { res.status(404).json({ error: "Entry not found" }); return; }
      const entry = entryResult.rows[0] as Record<string, any>;
      if (entry.member_id !== memberId) { res.status(403).json({ error: "Access denied" }); return; }
      if (entry.shared) { res.status(409).json({ error: "Entry already shared — this cannot be undone" }); return; }

      // Mark as shared
      const updatedResult = await client.query<Record<string, unknown>>(
        `UPDATE member_journal_entries SET shared = true, shared_at = NOW(), updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [entryId]
      );
      const updated = updatedResult.rows[0] as Record<string, any>;

      // Auto-create complaint record
      const incidentType = entry.incident_type as string;
      const category = INCIDENT_TO_CATEGORY[incidentType] ?? "other";
      const memberName = (entry.member_name as string) ?? "Member";
      const complaintDescription = `[Member Journal — ${INCIDENT_TYPE_LABELS[incidentType] ?? incidentType}] ${(entry.description as string).slice(0, 1000)}`;

      try {
        await (db.insert(memberComplaintsTable) as any).values({
          memberId,
          submittedByUserId: req.session?.userId ?? null,
          description: complaintDescription,
          category,
          occurredDate: entry.incident_date as string,
          affectedScope: "just_me",
          severity: entry.urgent ? "serious" : "minor",
          status: "open",
          source: "Member Journal",
          journalEntryId: entryId,
        } as any);
      } catch (err) {
        logger.warn({ err }, "member-journal: complaint auto-create failed (non-fatal)");
      }

      // Push notification to stewards if urgent
      if (entry.urgent) {
        try {
          const stewardResult = await client.query<{ id: number }>(
            `SELECT id FROM users WHERE role IN ('steward', 'co_chair', 'chair', 'admin') AND is_active = true`
          );
          const stewardIds = stewardResult.rows.map((r) => r.id);
          if (stewardIds.length > 0) {
            sendPushToUsers(stewardIds, {
              title: "Urgent Incident Report",
              body: `${memberName} shared an urgent journal entry: ${INCIDENT_TYPE_LABELS[incidentType] ?? incidentType}`,
              tag: `urgent-journal-${entryId}`,
              url: "/complaints",
            }).catch(() => {});
          }
        } catch (err) {
          logger.warn({ err }, "member-journal: urgent push failed (non-fatal)");
        }
      }

      res.json({ ok: true, entry: updated });
    } finally {
      client.release();
    }
  })
);

// ─── GET /export — export ALL own entries as HTML for print/PDF ──────────────
router.get(
  "/export",
  asyncHandler(async (req: Request, res: Response) => {
    const memberId = requireLinkedMember(req, res);
    if (memberId === null) return;

    const client = await pool.connect();
    try {
      const entriesResult = await client.query<Record<string, unknown>>(
        `SELECT e.*,
          COALESCE(
            json_agg(a ORDER BY a.created_at ASC) FILTER (WHERE a.id IS NOT NULL),
            '[]'
          ) AS addendums
         FROM member_journal_entries e
         LEFT JOIN member_journal_addendums a ON a.journal_entry_id = e.id
         WHERE e.member_id = $1
         GROUP BY e.id
         ORDER BY e.created_at DESC`,
        [memberId]
      );

      const memberResult = await client.query<{ name: string; employee_id: string }>(
        `SELECT name, employee_id FROM members WHERE id = $1`,
        [memberId]
      );
      const member = memberResult.rows[0];
      const memberName = member?.name ?? "Member";
      const employeeId = member?.employee_id ?? "";

      const html = buildExportHtml(memberName, employeeId, entriesResult.rows as Record<string, any>[], "all");
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } finally {
      client.release();
    }
  })
);

// ─── GET /:id/export — export single entry as HTML for print/PDF ─────────────
router.get(
  "/:id/export",
  asyncHandler(async (req: Request, res: Response) => {
    const memberId = requireLinkedMember(req, res);
    if (memberId === null) return;

    const entryId = parseInt(String(req.params.id), 10);
    if (isNaN(entryId)) { res.status(400).json({ error: "Invalid entry id" }); return; }

    const client = await pool.connect();
    try {
      const entryResult = await client.query<Record<string, unknown>>(
        `SELECT e.*,
          COALESCE(
            json_agg(a ORDER BY a.created_at ASC) FILTER (WHERE a.id IS NOT NULL),
            '[]'
          ) AS addendums
         FROM member_journal_entries e
         LEFT JOIN member_journal_addendums a ON a.journal_entry_id = e.id
         WHERE e.id = $1
         GROUP BY e.id`,
        [entryId]
      );
      if (!entryResult.rows.length) { res.status(404).json({ error: "Entry not found" }); return; }
      const entry = entryResult.rows[0] as Record<string, any>;
      if (entry.member_id !== memberId) { res.status(403).json({ error: "Access denied" }); return; }

      const memberResult = await client.query<{ name: string; employee_id: string }>(
        `SELECT name, employee_id FROM members WHERE id = $1`,
        [memberId]
      );
      const member = memberResult.rows[0];
      const memberName = member?.name ?? "Member";
      const employeeId = member?.employee_id ?? "";

      const html = buildExportHtml(memberName, employeeId, [entry], "single");
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } finally {
      client.release();
    }
  })
);

// ─── DELETE /:id — delete if not shared ──────────────────────────────────────
router.delete(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const memberId = requireLinkedMember(req, res);
    if (memberId === null) return;

    const entryId = parseInt(String(req.params.id), 10);
    if (isNaN(entryId)) { res.status(400).json({ error: "Invalid entry id" }); return; }

    const client = await pool.connect();
    try {
      const entryResult = await client.query<{ member_id: number; shared: boolean }>(
        `SELECT member_id, shared FROM member_journal_entries WHERE id = $1`,
        [entryId]
      );
      if (!entryResult.rows.length) { res.status(404).json({ error: "Entry not found" }); return; }
      const entry = entryResult.rows[0];
      if (entry.member_id !== memberId) { res.status(403).json({ error: "Access denied" }); return; }
      if (entry.shared) { res.status(409).json({ error: "Shared entries cannot be deleted" }); return; }

      await client.query(`DELETE FROM member_journal_entries WHERE id = $1`, [entryId]);
      res.json({ ok: true });
    } finally {
      client.release();
    }
  })
);

// ─── HTML export builder ──────────────────────────────────────────────────────
function fmt(val: unknown): string {
  if (val === null || val === undefined) return "—";
  return String(val);
}

function fmtBool(val: unknown): string {
  return val ? "Yes" : "No";
}

function fmtDateTime(val: unknown): string {
  if (!val) return "—";
  try { return new Date(String(val)).toLocaleString("en-CA", { timeZone: "UTC" }); } catch { return String(val); }
}

function buildExportHtml(
  memberName: string,
  employeeId: string,
  entries: Record<string, any>[],
  _mode: "all" | "single"
): string {
  const entryHtml = entries.map((e) => {
    const addendums = Array.isArray(e.addendums)
      ? e.addendums
          .map(
            (a: Record<string, any>) => `
      <div class="addendum">
        <div class="label">Addendum — ${fmtDateTime(a.created_at)}</div>
        <div class="body">${escHtml(fmt(a.content))}</div>
      </div>`
          )
          .join("")
      : "";

    return `
    <div class="entry">
      <div class="entry-header">
        <span class="badge">${escHtml(INCIDENT_TYPE_LABELS[e.incident_type] ?? fmt(e.incident_type))}</span>
        <span class="date">${fmt(e.incident_date)}${e.incident_time ? " at " + fmt(e.incident_time) : ""}</span>
        ${e.shared ? `<span class="badge shared">Shared with Steward</span>` : ""}
        ${e.urgent ? `<span class="badge urgent">URGENT</span>` : ""}
      </div>
      <table class="fields">
        <tr><td class="field-label">Shift</td><td>${escHtml(fmt(e.shift))}</td></tr>
        <tr><td class="field-label">Location</td><td>${escHtml(fmt(e.location))}</td></tr>
        ${e.department ? `<tr><td class="field-label">Department</td><td>${escHtml(fmt(e.department))}</td></tr>` : ""}
        ${e.persons_involved ? `<tr><td class="field-label">Persons Involved</td><td>${escHtml(fmt(e.persons_involved))}</td></tr>` : ""}
        <tr><td class="field-label">Mgmt Documentation Issued</td><td>${fmtBool(e.management_documentation_issued)}</td></tr>
        <tr><td class="field-label">Union Rep Present (Weingarten)</td><td>${fmtBool(e.union_rep_present)}</td></tr>
        <tr><td class="field-label">Steward Notified</td><td>${fmtBool(e.steward_notified)}</td></tr>
        <tr><td class="field-label">Recorded At</td><td>${fmtDateTime(e.created_at)} UTC</td></tr>
        ${e.shared_at ? `<tr><td class="field-label">Shared At</td><td>${fmtDateTime(e.shared_at)} UTC</td></tr>` : ""}
      </table>
      <div class="section-label">Incident Description</div>
      <div class="description">${escHtml(fmt(e.description))}</div>
      ${addendums ? `<div class="addendums">${addendums}</div>` : ""}
    </div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Incident Journal — ${escHtml(memberName)}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 24px; }
  h1 { font-size: 18px; margin-bottom: 2px; }
  .subtitle { color: #555; font-size: 11px; margin-bottom: 20px; }
  .entry { border: 1px solid #ccc; border-radius: 6px; padding: 14px; margin-bottom: 20px; page-break-inside: avoid; }
  .entry-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
  .badge { background: #e0e7ff; color: #3730a3; border-radius: 12px; padding: 2px 9px; font-size: 10px; font-weight: bold; }
  .badge.shared { background: #d1fae5; color: #065f46; }
  .badge.urgent { background: #fee2e2; color: #991b1b; }
  .date { font-size: 12px; font-weight: 600; color: #333; }
  .fields { border-collapse: collapse; width: 100%; margin-bottom: 10px; }
  .fields td { padding: 3px 6px; border: 1px solid #e5e7eb; font-size: 11px; }
  .field-label { font-weight: 600; background: #f9fafb; width: 220px; }
  .section-label { font-weight: 700; font-size: 11px; text-transform: uppercase; color: #6b7280; margin: 8px 0 4px; }
  .description { white-space: pre-wrap; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px; font-size: 11px; }
  .addendums { margin-top: 10px; }
  .addendum { border-left: 3px solid #6366f1; padding: 6px 10px; margin-bottom: 6px; background: #eef2ff; }
  .addendum .label { font-weight: 700; font-size: 10px; color: #4f46e5; margin-bottom: 2px; }
  .addendum .body { white-space: pre-wrap; font-size: 11px; }
  .footer { margin-top: 24px; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
<h1>Unifor Local 1285 — Incident Journal</h1>
<div class="subtitle">
  Member: ${escHtml(memberName)}${employeeId ? ` (ID: ${escHtml(employeeId)})` : ""}
  &nbsp;|&nbsp; Exported: ${new Date().toLocaleString("en-CA", { timeZone: "UTC" })} UTC
  &nbsp;|&nbsp; ${entries.length} entr${entries.length === 1 ? "y" : "ies"}
</div>
<div class="notice" style="background:#fefce8;border:1px solid #fde047;border-radius:4px;padding:8px 12px;font-size:11px;margin-bottom:16px;color:#713f12;">
  <strong>Confidential:</strong> This document contains personal incident records and is intended solely for the named member and their union representative. Do not distribute without authorization.
</div>
${entryHtml}
<div class="footer">
  Generated by Unionize — Unifor Local 1285 Member Portal &bull; ${new Date().toISOString()}
</div>
<script>window.onload = function() { window.print(); }</script>
</body>
</html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export default router;
