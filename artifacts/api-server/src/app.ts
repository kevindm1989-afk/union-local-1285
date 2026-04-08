import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  seedAdminUser,
  ensureSessionTable,
  ensureAiTables,
  ensureMemberFilesTable,
  ensureAuditLogTable,
  ensureLocalSettingsTable,
  ensureGrievanceEnhancements,
  ensureMemberEnhancements,
  ensureGrievanceNotesTable,
  ensureMemberPortalEnhancements,
  ensureMeetingsTable,
  ensurePushSubscriptionsTable,
  ensureNotificationPreferences,
  ensureVapidKeys,
  seedDefaultPermissions,
} from "./lib/seedAdmin";
const PgStore = connectPgSimple(session);
const app: Express = express();
// Trust the first proxy (Fly.io / Replit) so req.secure is correct when
// running behind HTTPS-terminating reverse proxies. Without this,
// express-session refuses to set Secure cookies even though the browser
// is talking HTTPS, causing logins to silently fail in production.
app.set("trust proxy", 1);
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET environment variable is required");
}
app.use(
  session({
    store: new PgStore({
      pool,
      tableName: "sessions",
      createTableIfMissing: false,
    }),
    name: "union.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }),
);
// Auth routes are public
app.use("/api", router);
// Ensure sessions table exists, then seed admin and permissions
ensureSessionTable()
  .then(() => ensureAuditLogTable())
  .then(() => ensureLocalSettingsTable())
  .then(() => ensureMemberFilesTable())
  .then(() => ensureAiTables())
  .then(() => ensureGrievanceEnhancements())
  .then(() => ensureMemberEnhancements())
  .then(() => ensureGrievanceNotesTable())
  .then(() => ensureMemberPortalEnhancements())
  .then(() => ensureMeetingsTable())
  .then(() => ensurePushSubscriptionsTable())
  .then(() => ensureNotificationPreferences())
  .then(() => ensureVapidKeys())
  .then(() => seedAdminUser())
  .then(() => seedDefaultPermissions())
  .catch((err) => logger.error({ err }, "Startup tasks failed"));
if (process.env.NODE_ENV === "production") {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const publicDir = path.join(__dirname, "../public");
  app.use(express.static(publicDir, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
    },
  }));
  app.get("*path", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}
export default app;
