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
import { requirePermission } from "../lib/permissions";

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

router.use("/members", requirePermission("members.view"), membersRouter);
router.use("/grievances", requirePermission("grievances.view"), grievancesRouter);
router.use("/announcements", requirePermission("bulletins.view"), announcementsRouter);
router.use("/dashboard", dashboardRouter);
router.use(requirePermission("documents.view"), storageRouter);
router.use("/documents", requirePermission("documents.view"), documentsRouter);
router.use("/anthropic", anthropicRouter);

export default router;
