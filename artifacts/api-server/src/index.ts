import app from "./app";
import { logger } from "./lib/logger";

const REQUIRED_ENV_VARS = [
  'SESSION_SECRET',
  'ADMIN_PASSWORD',
];

const missing = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

// Warn (but don't crash) if optional services are unconfigured
const dbUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || process.env.PG_URL;
if (!dbUrl) {
  console.error('FATAL: No database URL found. Set NEON_DATABASE_URL or DATABASE_URL.');
  process.exit(1);
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
