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
import meetingsRouter from "./meetings";
import pushRouter, { initVapid } from "./push";
import { requirePermission } from "../lib/permissions";

// Init VAPID keys after the DB startup chain completes
setTimeout(() => initVapid().catch(() => {}), 5000);

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

router.use(requireAuth);

router.use("/member-portal", memberPortalRouter);
router.use("/members", requirePermission("members.view"), membersRouter);
router.use("/grievances", requirePermission("grievances.view"), grievancesRouter);
router.use("/announcements", requirePermission("bulletins.view"), announcementsRouter);
router.use("/dashboard", dashboardRouter);
router.use(requirePermission("documents.view"), storageRouter);
router.use("/documents", requirePermission("documents.view"), documentsRouter);
router.use("/anthropic", anthropicRouter);
router.use("/settings", requirePermission("members.edit"), settingsRouter);
router.use("/audit-logs", requirePermission("members.edit"), auditLogsRouter);
router.use("/meetings", requirePermission("meetings.view"), meetingsRouter);
router.use("/push", pushRouter);
router.use("/grievances/:grievanceId/notes", requirePermission("grievances.view"), grievanceNotesRouter);

export default router;
