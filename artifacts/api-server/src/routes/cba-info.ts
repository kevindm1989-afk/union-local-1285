import { Router, type Request, type Response } from "express";
import { db, localSettingsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

router.get("/", asyncHandler(async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(localSettingsTable)
    .where(inArray(localSettingsTable.key, ["cba_expiry_date", "cba_name"]));

  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  res.json(result);
}));

export default router;
