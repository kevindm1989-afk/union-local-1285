import nodemailer from "nodemailer";
import { logger } from "./logger";

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("SMTP_HOST, SMTP_USER, and SMTP_PASS must be set to send emails");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendAccessRequestNotification(opts: {
  requesterName: string;
  requesterUsername: string;
  reason: string | null;
}): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    logger.warn("ADMIN_EMAIL not set — skipping access request email notification");
    return;
  }

  try {
    const transport = createTransport();
    const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;

    await transport.sendMail({
      from,
      to: adminEmail,
      subject: `New access request from ${opts.requesterName}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <h2 style="margin:0 0 8px;font-size:20px;color:#111;">New Access Request</h2>
          <p style="margin:0 0 20px;color:#555;font-size:14px;">
            Someone has requested access to the Union Local 1285 Steward Portal.
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
            ${opts.reason
              ? `<tr>
              <td style="padding:8px 0;color:#888;vertical-align:top;">Reason</td>
              <td style="padding:8px 0;color:#111;font-style:italic;">${opts.reason}</td>
            </tr>`
              : ""}
          </table>
          <div style="margin-top:24px;">
            <a href="https://union-local-1285.fly.dev/admin"
               style="display:inline-block;background:#b91c1c;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:700;font-size:14px;">
              Review in Admin Panel
            </a>
          </div>
          <p style="margin-top:24px;font-size:12px;color:#aaa;">
            Union Local 1285 — Steward Portal
          </p>
        </div>
      `,
      text: [
        "New Access Request — Union Local 1285",
        "",
        `Name:     ${opts.requesterName}`,
        `Username: @${opts.requesterUsername}`,
        opts.reason ? `Reason:   ${opts.reason}` : "",
        "",
        "Review at: https://union-local-1285.fly.dev/admin",
      ]
        .filter((l) => l !== undefined)
        .join("\n"),
    });

    logger.info({ to: adminEmail, requester: opts.requesterUsername }, "Access request notification sent");
  } catch (err) {
    logger.error({ err }, "Failed to send access request email — continuing without notification");
  }
}
