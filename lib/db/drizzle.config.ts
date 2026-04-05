import { defineConfig } from "drizzle-kit";
import path from "path";

const connectionString = process.env.PG_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("PG_URL must be set. Add your external PostgreSQL connection string as a secret.");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
