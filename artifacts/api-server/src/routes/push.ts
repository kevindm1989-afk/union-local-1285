import { Router, type Request } from "express";
import webpush from "web-push";
import { db, pushSubscriptionsTable, pool } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

let vapidConfigured = false;

async function getVapidKeys(): Promise<{ publicKey: string; privateKey: string } | null> {
  // Prefer env vars, fall back to local_settings
  const pubFromEnv = process.env.VAPID_PUBLIC_KEY;
  const privFromEnv = process.env.VAPID_PRIVATE_KEY;
  if (pubFromEnv && privFromEnv) return { publicKey: pubFromEnv, privateKey: privFromEnv };

  const client = await pool.connect();
  try {
    const rows = await client.query<{ key: string; value: string }>(
      `SELECT key, value FROM local_settings WHERE key IN ('vapid_public_key', 'vapid_private_key')`
    );
    const map: Record<string, string> = {};
    for (const row of rows.rows) map[row.key] = row.value;
    if (map.vapid_public_key && map.vapid_private_key) {
      return { publicKey: map.vapid_public_key, privateKey: map.vapid_private_key };
    }
    return null;
  } finally {
    client.release();
  }
}

export async function initVapid() {
  const keys = await getVapidKeys();
  if (keys) {
    webpush.setVapidDetails(
      "mailto:admin@union1285.org",
      keys.publicKey,
      keys.privateKey
    );
    vapidConfigured = true;
    logger.info("VAPID keys loaded");
  }
}

// Fire-and-forget push to all subscribers
export async function sendPushToAll(payload: { title: string; body: string; tag?: string; url?: string }) {
  if (!vapidConfigured) return;
  try {
    const subs = await db.select().from(pushSubscriptionsTable);
    const notification = JSON.stringify(payload);
    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          notification
        ).catch(async (err: any) => {
          if (err.statusCode === 410) {
            // Subscription expired — remove it
            await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, sub.id));
          }
        })
      )
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) logger.warn({ failed }, "Some push notifications failed");
  } catch (err) {
    logger.error({ err }, "sendPushToAll failed");
  }
}

// GET /api/push/vapid-public-key — return public key for frontend subscription
router.get("/vapid-public-key", asyncHandler(async (_req, res) => {
  const keys = await getVapidKeys();
  if (!keys) {
    res.status(503).json({ error: "Push notifications not configured" });
    return;
  }
  res.json({ publicKey: keys.publicKey });
}));

// POST /api/push/subscribe — save subscription
router.post("/subscribe", asyncHandler(async (req: Request, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: "endpoint and keys (p256dh, auth) are required" });
    return;
  }

  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  // Upsert subscription
  await db
    .insert(pushSubscriptionsTable)
    .values({ userId, endpoint, p256dh: keys.p256dh, auth: keys.auth })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: { userId, p256dh: keys.p256dh, auth: keys.auth },
    });

  res.status(201).json({ ok: true });
}));

// DELETE /api/push/subscribe — remove subscription
router.delete("/subscribe", asyncHandler(async (req: Request, res) => {
  const { endpoint } = req.body;
  if (!endpoint) { res.status(400).json({ error: "endpoint required" }); return; }
  await db
    .delete(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.endpoint, endpoint));
  res.json({ ok: true });
}));

// POST /api/push/send — admin sends custom notification
router.post("/send", asyncHandler(async (req: Request, res) => {
  if (!["admin", "chair"].includes(req.session?.role ?? "")) {
    res.status(403).json({ error: "Admin only" });
    return;
  }
  const { title, body, url } = req.body;
  if (!title || !body) { res.status(400).json({ error: "title and body required" }); return; }

  sendPushToAll({ title, body, url }).catch(() => {});
  res.json({ ok: true, message: "Notifications queued" });
}));

export default router;
