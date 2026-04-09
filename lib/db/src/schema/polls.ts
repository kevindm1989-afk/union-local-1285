import { pgTable, serial, integer, text, boolean, timestamp, jsonb, unique, index } from "drizzle-orm/pg-core";

export const pollsTable = pgTable("polls", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  pollType: text("poll_type", {
    enum: ["yes_no", "multiple_choice"],
  }).notNull().default("yes_no"),
  options: jsonb("options").$type<string[]>().default([]),
  startsAt: timestamp("starts_at").notNull().defaultNow(),
  endsAt: timestamp("ends_at").notNull(),
  createdBy: integer("created_by"),
  isActive: boolean("is_active").notNull().default(true),
  targetRole: text("target_role", {
    enum: ["all", "member", "steward"],
  }).notNull().default("all"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  isActiveIdx: index("polls_is_active_idx").on(table.isActive),
  endsAtIdx: index("polls_ends_at_idx").on(table.endsAt),
  startsAtIdx: index("polls_starts_at_idx").on(table.startsAt),
}));

export const pollResponsesTable = pgTable("poll_responses", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").notNull(),
  userId: integer("user_id").notNull(),
  response: text("response").notNull(),
  respondedAt: timestamp("responded_at").notNull().defaultNow(),
}, (t) => [
  unique().on(t.pollId, t.userId),
  index("poll_responses_poll_id_idx").on(t.pollId),
]);

export type Poll = typeof pollsTable.$inferSelect;
export type PollResponse = typeof pollResponsesTable.$inferSelect;
