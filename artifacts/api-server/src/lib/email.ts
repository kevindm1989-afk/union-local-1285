import nodemailer from "nodemailer";
import { logger } from "./logger";
import { db, localSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

function getTransport(): { transport: nodemailer.Transporter; from: string } | null {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    logger.warn("Email not configured: set SMTP_USER and SMTP_PASS env vars");
    return null;
  }
  const from = process.env.EMAIL_FROM ?? user;
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { type: "login", user, pass },
  });
  return { transport, from };
}

async function send(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const mailer = getTransport();
  if (!mailer) return;

  try {
    await mailer.transport.sendMail({
      from: mailer.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    logger.info({ to: opts.to, subject: opts.subject }, "Email sent via Gmail SMTP");
  } catch (err) {
    logger.error({ err }, "Failed to send email — continuing without notification");
  }
}

// ─── Helper: resolve admin email from env or local_settings ──────────────────

async function getAdminEmail(): Promise<string | null> {
  if (process.env.ADMIN_EMAIL) return process.env.ADMIN_EMAIL;
  try {
    const [row] = await db
      .select({ value: localSettingsTable.value })
      .from(localSettingsTable)
      .where(eq(localSettingsTable.key, "admin_email"));
    return row?.value ?? null;
  } catch {
    return null;
  }
}

// ─── Notification: access request ─────────────────────────────────────────────

export async function sendAccessRequestNotification(opts: {
  requesterName: string;
  requesterUsername: string;
  reason: string | null;
}): Promise<void> {
  const adminEmail = await getAdminEmail();
  if (!adminEmail) {
    logger.warn("Admin email not configured — skipping access request email");
    return;
  }

  const portalUrl = process.env.PORTAL_URL;

  await send({
    to: adminEmail,
    subject: `New access request from ${opts.requesterName}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 8px;font-size:20px;color:#111;">New Access Request</h2>
        <p style="margin:0 0 20px;color:#555;font-size:14px;">
          Someone has requested access to the Union Steward Portal.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr>
            <td style="padding:8px 0;color:#888;width:120px;">Name</td>
            <td style="padding:8px 0;font-weight:600;color:#111;">${opts.requesterName}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#888;">Username</td>
            <td style="padding:8px 0;font-weight:600;color:#111;font-family:monospace;">@${opts.requesterUsername}</td>
          </tr>
          ${
            opts.reason
              ? `<tr>
            <td style="padding:8px 0;color:#888;vertical-align:top;">Reason</td>
            <td style="padding:8px 0;color:#111;font-style:italic;">${opts.reason}</td>
          </tr>`
              : ""
          }
        </table>
        <div style="margin-top:24px;">
          <a href="${portalUrl}/admin"
             style="display:inline-block;background:#b91c1c;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:700;font-size:14px;">
            Review in Admin Panel
          </a>
        </div>
        <p style="margin-top:24px;font-size:12px;color:#aaa;">Unionize</p>
      </div>
    `,
    text: [
      "New Access Request — Unionize",
      "",
      `Name:     ${opts.requesterName}`,
      `Username: @${opts.requesterUsername}`,
      opts.reason ? `Reason:   ${opts.reason}` : "",
      "",
      `Review at: ${portalUrl}/admin`,
    ]
      .filter((l) => l !== undefined)
      .join("\n"),
  });
}

// ─── Notification: access request approved ────────────────────────────────────

export async function sendAccessRequestApprovedEmail(opts: {
  recipientEmail: string;
  recipientName: string;
  username: string;
  tempPassword: string;
  approvedRole?: string;
  requestedRole?: string;
}): Promise<void> {
  const portalUrl = process.env.PORTAL_URL;
  const roleDiffers = opts.approvedRole && opts.requestedRole && opts.approvedRole !== opts.requestedRole;
  const roleLabel = (r: string) =>
    r === "co_chair" ? "Co-Chair" : r === "steward" ? "Steward" : r === "admin" ? "Administrator" : "Member";
  const roleDiffersNote = roleDiffers
    ? `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;margin:12px 0;">
        <p style="margin:0;font-size:13px;color:#92400e;">
          <strong>Note:</strong> your account has been set up as <strong>${roleLabel(opts.approvedRole!)}</strong>
          (you requested ${roleLabel(opts.requestedRole!)}).
        </p>
       </div>`
    : opts.approvedRole
    ? `<p style="margin:0 0 12px;font-size:14px;color:#555;">Your account role: <strong>${roleLabel(opts.approvedRole)}</strong></p>`
    : "";

  await send({
    to: opts.recipientEmail,
    subject: "Your union membership account has been approved",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 8px;font-size:20px;color:#111;">Welcome to Unionize!</h2>
        <p style="margin:0 0 16px;color:#555;font-size:14px;">
          Hi ${opts.recipientName}, your access request has been approved. Here are your login credentials:
        </p>
        ${roleDiffersNote}
        <table style="width:100%;border-collapse:collapse;font-size:14px;background:#f9fafb;border-radius:8px;padding:16px;">
          <tr>
            <td style="padding:8px 12px;color:#888;width:120px;">Portal URL</td>
            <td style="padding:8px 12px;font-weight:600;color:#111;"><a href="${portalUrl}">${portalUrl}</a></td>
          </tr>
          <tr>
            <td style="padding:8px 12px;color:#888;">Username</td>
            <td style="padding:8px 12px;font-weight:600;color:#111;font-family:monospace;">${opts.username}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;color:#888;">Temporary Password</td>
            <td style="padding:8px 12px;font-weight:600;color:#b91c1c;font-family:monospace;">${opts.tempPassword}</td>
          </tr>
        </table>
        <p style="margin-top:16px;color:#888;font-size:13px;">Please log in and change your password immediately.</p>
        <div style="margin-top:24px;">
          <a href="${portalUrl}" style="display:inline-block;background:#b91c1c;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:700;font-size:14px;">Sign In Now</a>
        </div>
        <p style="margin-top:24px;font-size:12px;color:#aaa;">Unionize</p>
      </div>
    `,
    text: [
      `Welcome to Unionize, ${opts.recipientName}!`,
      "",
      "Your access request has been approved. Here are your login credentials:",
      `Portal: ${portalUrl}`,
      `Username: ${opts.username}`,
      `Temporary Password: ${opts.tempPassword}`,
      opts.approvedRole ? `Account role: ${roleLabel(opts.approvedRole)}` : "",
      roleDiffers ? `Note: your account has been set up as ${roleLabel(opts.approvedRole!)} (you requested ${roleLabel(opts.requestedRole!)}).` : "",
      "",
      "Please log in and change your password immediately.",
    ].filter(Boolean).join("\n"),
  });
}

// ─── Notification: access request rejected ────────────────────────────────────

export async function sendAccessRequestRejectedEmail(opts: {
  recipientEmail: string;
  recipientName: string;
  rejectionReason: string;
}): Promise<void> {
  await send({
    to: opts.recipientEmail,
    subject: "Update on your union access request",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 8px;font-size:20px;color:#111;">Access Request Update</h2>
        <p style="margin:0 0 16px;color:#555;font-size:14px;">
          Hi ${opts.recipientName}, after reviewing your membership access request, we are unable to approve it at this time.
        </p>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:16px;">
          <p style="margin:0;font-size:14px;color:#7f1d1d;font-weight:600;">Reason:</p>
          <p style="margin:4px 0 0;font-size:14px;color:#111;">${opts.rejectionReason}</p>
        </div>
        <p style="color:#555;font-size:13px;">If you believe this is an error, please contact your union steward directly.</p>
        <p style="margin-top:24px;font-size:12px;color:#aaa;">Unionize</p>
      </div>
    `,
    text: [
      `Hi ${opts.recipientName},`,
      "",
      "After reviewing your membership access request, we are unable to approve it at this time.",
      "",
      `Reason: ${opts.rejectionReason}`,
      "",
      "If you believe this is an error, please contact your union steward directly.",
    ].join("\n"),
  });
}

// ─── Notification: new enhanced access request to admins ──────────────────────

export async function sendNewMemberRequestNotification(opts: {
  firstName: string;
  lastName: string;
  email: string;
  employeeId: string | null;
  department: string | null;
  requestedRole?: string;
}): Promise<void> {
  const adminEmail = await getAdminEmail();
  if (!adminEmail) return;
  const portalUrl = process.env.PORTAL_URL;
  const name = `${opts.firstName} ${opts.lastName}`;
  const roleLabel = (r: string) =>
    r === "co_chair" ? "Co-Chair" : r === "steward" ? "Steward" : "Member";
  const roleBadgeColor = opts.requestedRole === "co_chair"
    ? "#7c3aed" : opts.requestedRole === "steward" ? "#2563eb" : "#6b7280";
  const roleRow = opts.requestedRole
    ? `<tr><td style="padding:8px 0;color:#888;">Requested Role</td><td style="padding:8px 0;"><span style="background:${roleBadgeColor};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700;">${roleLabel(opts.requestedRole)}</span></td></tr>`
    : "";

  await send({
    to: adminEmail,
    subject: `New access request from ${name} — Requested role: ${opts.requestedRole ? roleLabel(opts.requestedRole) : "Member"}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 8px;font-size:20px;color:#111;">New Member Access Request</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:8px 0;color:#888;width:140px;">Name</td><td style="padding:8px 0;font-weight:600;">${name}</td></tr>
          <tr><td style="padding:8px 0;color:#888;">Email</td><td style="padding:8px 0;">${opts.email}</td></tr>
          ${opts.employeeId ? `<tr><td style="padding:8px 0;color:#888;">Employee ID</td><td style="padding:8px 0;font-family:monospace;">${opts.employeeId}</td></tr>` : ""}
          ${opts.department ? `<tr><td style="padding:8px 0;color:#888;">Department</td><td style="padding:8px 0;">${opts.department}</td></tr>` : ""}
          ${roleRow}
        </table>
        <div style="margin-top:24px;">
          <a href="${portalUrl}/admin" style="display:inline-block;background:#b91c1c;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:700;font-size:14px;">Review in Admin Panel</a>
        </div>
        <p style="margin-top:24px;font-size:12px;color:#aaa;">Unionize</p>
      </div>
    `,
    text: `New access request from ${name} (${opts.email}). Requested role: ${opts.requestedRole ? roleLabel(opts.requestedRole) : "Member"}. Review at: ${portalUrl}/admin`,
  });
}

// ─── Notification: member account deactivated ─────────────────────────────────

export async function sendMemberDeactivatedEmail(opts: {
  recipientEmail: string;
  recipientName: string;
}): Promise<void> {
  await send({
    to: opts.recipientEmail,
    subject: "Your union membership account has been deactivated",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 8px;font-size:20px;color:#111;">Account Deactivated</h2>
        <p style="color:#555;font-size:14px;">Hi ${opts.recipientName}, your union membership account has been deactivated. Contact your steward for more information.</p>
        <p style="margin-top:24px;font-size:12px;color:#aaa;">Unionize</p>
      </div>
    `,
    text: `Hi ${opts.recipientName}, your union membership account has been deactivated. Contact your steward for more information.`,
  });
}

// ─── Notification: grievance filed ────────────────────────────────────────────

export async function sendGrievanceFiledNotification(opts: {
  grievanceId: number;
  grievanceNumber: string;
  title: string;
  memberName: string | null;
  step: number;
  dueDate: string | null;
  isAda: boolean;
}): Promise<void> {
  const adminEmail = await getAdminEmail();
  if (!adminEmail) return;

  const portalUrl = process.env.PORTAL_URL;
  const stepLabel = opts.step === 5 ? "Step 5 — Arbitration" : `Step ${opts.step}`;
  const adaBadge = opts.isAda
    ? `<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700;margin-left:8px;">ADA</span>`
    : "";

  await send({
    to: adminEmail,
    subject: `[${opts.grievanceNumber}] New Grievance Filed: ${opts.title}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 4px;font-size:20px;color:#111;">New Grievance Filed</h2>
        <p style="margin:0 0 20px;color:#888;font-size:13px;">${opts.grievanceNumber}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr>
            <td style="padding:8px 0;color:#888;width:120px;">Title</td>
            <td style="padding:8px 0;font-weight:600;color:#111;">${opts.title} ${adaBadge}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#888;">Member</td>
            <td style="padding:8px 0;color:#111;">${opts.memberName ?? "—"}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#888;">Step</td>
            <td style="padding:8px 0;color:#111;">${stepLabel}</td>
          </tr>
          ${
            opts.dueDate
              ? `<tr>
            <td style="padding:8px 0;color:#888;">Due</td>
            <td style="padding:8px 0;color:#111;">${new Date(opts.dueDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</td>
          </tr>`
              : ""
          }
        </table>
        <div style="margin-top:24px;">
          <a href="${portalUrl}/grievances/${opts.grievanceId}"
             style="display:inline-block;background:#b91c1c;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:700;font-size:14px;">
            View Grievance
          </a>
        </div>
        <p style="margin-top:24px;font-size:12px;color:#aaa;">Unionize</p>
      </div>
    `,
    text: [
      `New Grievance Filed — ${opts.grievanceNumber}`,
      "",
      `Title:  ${opts.title}`,
      `Member: ${opts.memberName ?? "—"}`,
      `Step:   ${stepLabel}`,
      opts.dueDate ? `Due:    ${opts.dueDate}` : "",
      opts.isAda ? "Flags:  ADA / Accommodation Request" : "",
      "",
      `View at: ${portalUrl}/grievances/${opts.grievanceId}`,
    ]
      .filter((l) => l !== undefined)
      .join("\n"),
  });
}

// ─── Notification: grievance status change ─────────────────────────────────────

export async function sendGrievanceStatusNotification(opts: {
  grievanceId: number;
  grievanceNumber: string;
  title: string;
  memberName: string | null;
  oldStatus: string;
  newStatus: string;
  step: number;
}): Promise<void> {
  const adminEmail = await getAdminEmail();
  if (!adminEmail) return;

  const portalUrl = process.env.PORTAL_URL;
  const stepLabel = opts.step === 5 ? "Arbitration" : `Step ${opts.step}`;
  const statusLabel = (s: string) =>
    s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  await send({
    to: adminEmail,
    subject: `[${opts.grievanceNumber}] Status Changed to ${statusLabel(opts.newStatus)}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 4px;font-size:20px;color:#111;">Grievance Status Update</h2>
        <p style="margin:0 0 20px;color:#888;font-size:13px;">${opts.grievanceNumber}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr>
            <td style="padding:8px 0;color:#888;width:120px;">Title</td>
            <td style="padding:8px 0;font-weight:600;color:#111;">${opts.title}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#888;">Member</td>
            <td style="padding:8px 0;color:#111;">${opts.memberName ?? "—"}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#888;">Step</td>
            <td style="padding:8px 0;color:#111;">${stepLabel}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#888;">Status</td>
            <td style="padding:8px 0;color:#111;">
              <span style="text-decoration:line-through;color:#aaa;">${statusLabel(opts.oldStatus)}</span>
              &rarr; <strong>${statusLabel(opts.newStatus)}</strong>
            </td>
          </tr>
        </table>
        <div style="margin-top:24px;">
          <a href="${portalUrl}/grievances/${opts.grievanceId}"
             style="display:inline-block;background:#b91c1c;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:700;font-size:14px;">
            View Grievance
          </a>
        </div>
        <p style="margin-top:24px;font-size:12px;color:#aaa;">Unionize</p>
      </div>
    `,
    text: [
      `Grievance Status Update — ${opts.grievanceNumber}`,
      "",
      `Title:      ${opts.title}`,
      `Member:     ${opts.memberName ?? "—"}`,
      `Step:       ${stepLabel}`,
      `Old Status: ${statusLabel(opts.oldStatus)}`,
      `New Status: ${statusLabel(opts.newStatus)}`,
      "",
      `View at: ${portalUrl}/grievances/${opts.grievanceId}`,
    ].join("\n"),
  });
}
