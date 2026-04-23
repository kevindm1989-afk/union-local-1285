import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import healthRouter from "./health";
import membersRouter from "./members";
import grievancesRouter from "./grievances";
import announcementsRouter from "./announcements";
import dashboardRouter from "./dashboard";
import storageRouter from "./storage";
import documentsRouter from "./documents";
import authRouter from "./auth";
import anthropicRouter from "./anthropic/index";
import settingsRouter from "./settings";
import auditLogsRouter from "./audit-logs";
import grievanceNotesRouter from "./grievance-notes";
import memberPortalRouter from "./member-portal";
import memberJournalRouter from "./member-journal";
import meetingsRouter from "./meetings";
import pushRouter, { initVapid } from "./push";
import journalRouter from "./journal";
import grievanceTemplatesRouter from "./grievance-templates";
import justCauseRouter from "./just-cause";
import communicationsRouter from "./communications";
import disciplineRouter from "./discipline";
import statsRouter from "./stats";
import coverageRouter from "./coverage";
import pollsRouter from "./polls";
import electionsRouter from "./elections";
import seniorityDisputesRouter from "./seniority-disputes";
import executiveDashboardRouter from "./executive-dashboard";
import onboardingRouter from "./onboarding";
import cbaInfoRouter from "./cba-info";
import accessRequestsRouter from "./access-requests";
import bargainingRouter from "./bargaining";
import complaintsRouter from "./complaints";
import grievanceAlertsRouter, { runDailyAlertJob } from "./grievance-alerts";
import { runScheduledBulletinJob } from "./announcements";
import { requirePermission, requireSteward } from "../lib/permissions";

// Init VAPID keys after the DB startup chain completes
setTimeout(() => initVapid().catch(() => {}), 5000);

// Daily grievance deadline alert job — runs 45s after startup then every 24h
const DAILY_MS = 24 * 60 * 60 * 1000;
setTimeout(() => {
  runDailyAlertJob().catch(() => {});
  setInterval(() => runDailyAlertJob().catch(() => {}), DAILY_MS);
}, 45_000);

// Scheduled bulletin auto-publish — runs 60s after startup then every 60s
const BULLETIN_INTERVAL_MS = 60 * 1000;
setTimeout(() => {
  runScheduledBulletinJob().catch(() => {});
  setInterval(() => runScheduledBulletinJob().catch(() => {}), BULLETIN_INTERVAL_MS);
}, 60_000);

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
// access-requests: public POST (rate-limited) + admin GET/PATCH/DELETE (internal auth check)
router.use("/access-requests", accessRequestsRouter);

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Authentication required", code: "UNAUTHORIZED" });
    return;
  }
  next();
}

router.use(requireAuth);

router.use("/member-portal", memberPortalRouter);
router.use("/member-journal", memberJournalRouter);
router.use("/members", requirePermission("members.view"), membersRouter);
router.use("/grievances/alerts", requirePermission("grievances.view"), grievanceAlertsRouter);
router.use("/grievances", requirePermission("grievances.view"), grievancesRouter);
router.use("/announcements", requirePermission("bulletins.view"), announcementsRouter);
router.use("/dashboard", dashboardRouter);
router.use(requirePermission("documents.view"), storageRouter);
router.use("/documents", requirePermission("documents.view"), documentsRouter);
router.use("/anthropic", anthropicRouter);
router.use("/settings", requirePermission("members.edit"), settingsRouter);
router.use("/audit-logs", requirePermission("members.edit"), auditLogsRouter);
router.use("/meetings", requirePermission("meetings.view"), meetingsRouter);
router.use("/grievances/:grievanceId/notes", requirePermission("grievances.view"), grievanceNotesRouter);

// ─── Push notifications: any authenticated user may subscribe / retrieve VAPID key ───
// Members need push subscriptions for their own portal notifications.
router.use("/push", pushRouter);

// ─── Steward-only route groups ────────────────────────────────────────────────
// Defense-in-depth: requireSteward is applied here at the mount point AND
// inside each router file. Both layers must pass independently.
//
// "steward" role = steward | co_chair | chair | admin
// "member" role  = blocked from all routes in this section

router.use(
  "/grievances/:grievanceId/journal",
  requireSteward,
  journalRouter,
);

router.use(
  "/grievances/:grievanceId/just-cause",
  requireSteward,
  justCauseRouter,
);

router.use(
  "/grievances/:grievanceId/communications",
  requireSteward,
  communicationsRouter,
);

router.use(
  "/grievance-templates",
  requireSteward,
  grievanceTemplatesRouter,
);

router.use(
  "/members/:memberId/discipline",
  requireSteward,
  disciplineRouter,
);

router.use(
  "/members/:memberId/onboarding",
  requireSteward,
  onboardingRouter,
);

router.use("/stats",      requireSteward, statsRouter);
router.use("/coverage",   requireSteward, coverageRouter);
router.use("/bargaining",           requireSteward, bargainingRouter);
router.use("/seniority-disputes",     requireSteward, seniorityDisputesRouter);
router.use("/executive-dashboard",   requireSteward, executiveDashboardRouter);
router.use("/complaints", complaintsRouter);

// ─── Member-accessible route groups ──────────────────────────────────────────
// Any authenticated session (including role = "member") may reach these.
// Individual endpoints within these routers enforce their own write-guard where needed.

router.use("/polls",     pollsRouter);
router.use("/elections", electionsRouter);
router.use("/cba-info",  cbaInfoRouter);

export default router;
