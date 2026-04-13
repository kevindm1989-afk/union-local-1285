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
  ensureAdvancedFeatureTables,
  ensureAccessRequestEnhancements,
  ensureElectionTables,
  ensureSeniorityDisputeTables,
  ensureDocumentVersioningColumns,
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
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [
      "https://union-local-1285.fly.dev",
      "https://unifor1285.replit.app",
    ];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      // Allow any Replit subdomain in development
      if (origin.endsWith(".replit.app") || origin.endsWith(".replit.dev") || origin.endsWith(".repl.co")) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS policy`));
      }
    },
    credentials: true,
  }),
);
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
      createTableIfMissing: true,
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
  .then(() => ensureAdvancedFeatureTables())
  .then(() => ensureAccessRequestEnhancements())
  .then(() => ensureElectionTables())
  .then(() => ensureSeniorityDisputeTables())
  .then(() => ensureDocumentVersioningColumns())
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

// ─── Global error handler ─────────────────────────────────────────────────────
// Catches any error forwarded via next(err) — including those from asyncHandler.
// Must be the last middleware registered.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err, message: err?.message, stack: err?.stack }, "Unhandled route error");
  if (res.headersSent) return;
  const message = process.env.NODE_ENV !== "production" ? err?.message || "Internal server error" : "Internal server error";
  res.status(500).json({ error: message, code: "INTERNAL_ERROR" });
});

export default app;
