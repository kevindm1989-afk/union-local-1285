import { db, membersTable, pool } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { sendPushToAll } from "../routes/push";

async function getAdminEmail(): Promise<string | null> {
  const client = await pool.connect();
  try {
    const row = await client.query<{ value: string }>(
      `SELECT value FROM local_settings WHERE key = 'admin_email' LIMIT 1`
    );
    return row.rows[0]?.value ?? process.env.ADMIN_EMAIL ?? null;
  } finally {
    client.release();
  }
}

// ── SMS via Twilio ────────────────────────────────────────────────────────────
export async function sendSms(to: string, body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM;

  if (!accountSid || !authToken || !fromNumber) {
    logger.debug("Twilio not configured — skipping SMS");
    return;
  }

  try {
    // Dynamic import so server still starts without twilio installed
    const twilio = (await import("twilio" as string)).default;
    const client = twilio(accountSid, authToken);
    await client.messages.create({ body, from: fromNumber, to });
  } catch (err) {
    logger.warn({ err }, "SMS send failed (silently ignored)");
  }
}

// ── Push to all stewards + SMS to member if opted in ─────────────────────────
export async function notifyUrgentBulletin(bulletin: {
  id: number;
  title: string;
  content: string;
}): Promise<void> {
  // Push all stewards
  sendPushToAll({
    title: `🚨 Urgent: ${bulletin.title}`,
    body: bulletin.content.slice(0, 100),
    tag: `bulletin-${bulletin.id}`,
    url: `/bulletins/${bulletin.id}`,
  }).catch(() => {});

  // SMS members with sms_enabled = true
  try {
    const members = await db
      .select({ id: membersTable.id, phone: membersTable.phone, smsEnabled: membersTable.smsEnabled })
      .from(membersTable)
      .where(eq(membersTable.smsEnabled, true));

    for (const m of members) {
      if (m.phone) {
        await sendSms(m.phone, `🚨 URGENT — ${bulletin.title}\n\n${bulletin.content.slice(0, 140)}`);
      }
    }
  } catch (err) {
    logger.warn({ err }, "notifyUrgentBulletin SMS failed");
  }
}

export async function notifyNewGrievancePush(grievance: {
  id: number;
  grievanceNumber: string;
  title: string;
}): Promise<void> {
  sendPushToAll({
    title: `New Grievance: ${grievance.grievanceNumber}`,
    body: grievance.title,
    tag: `grievance-${grievance.id}`,
    url: `/grievances/${grievance.id}`,
  }).catch(() => {});
}

export async function notifyMeetingReminder(meeting: {
  id: number;
  title: string;
  date: Date;
  location: string | null;
}): Promise<void> {
  const dateStr = meeting.date.toLocaleString();

  sendPushToAll({
    title: `Meeting Tomorrow: ${meeting.title}`,
    body: `${dateStr} — ${meeting.location ?? "Location TBD"}`,
    tag: `meeting-reminder-${meeting.id}`,
    url: `/meetings/${meeting.id}`,
  }).catch(() => {});
}
