import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import healthRouter from "./health";
import membersRouter from "./members";
import grievancesRouter from "./grievances";
import announcementsRouter from "./announcements";
import dashboardRouter from "./dashboard";
import storageRouter from "./storage";
import documentsRouter from "./documents";
import authRouter from "./auth";

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

router.use("/members", membersRouter);
router.use("/grievances", grievancesRouter);
router.use("/announcements", announcementsRouter);
router.use("/dashboard", dashboardRouter);
router.use(storageRouter);
router.use("/documents", documentsRouter);

export default router;
