import { Router, type IRouter } from "express";
import healthRouter from "./health";
import membersRouter from "./members";
import grievancesRouter from "./grievances";
import announcementsRouter from "./announcements";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/members", membersRouter);
router.use("/grievances", grievancesRouter);
router.use("/announcements", announcementsRouter);
router.use("/dashboard", dashboardRouter);

export default router;
