/**
 * Route Permission Tests
 *
 * Verifies the defense-in-depth permission guards added to index.ts.
 * These tests use a minimal Express application with injected sessions so
 * NO database connection is required — only the middleware under test is real.
 *
 * Legend:
 *   STEWARD_ONLY routes → member session must receive 403
 *   MEMBER_ACCESSIBLE routes → member session must receive 200
 */

import { describe, it, expect } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import supertest from "supertest";
import { requireSteward, requirePermission } from "../lib/permissions.js";

// ─── Session injection helpers ────────────────────────────────────────────────

type FakeSession = {
  role: string;
  userId: number;
  permissions: string[];
};

function withSession(session: FakeSession) {
  return (_req: Request, _res: Response, next: NextFunction) => {
    (_req as unknown as { session: FakeSession }).session = session;
    next();
  };
}

const MEMBER_SESSION: FakeSession = {
  role: "member",
  userId: 99,
  permissions: [],
};

const STEWARD_SESSION: FakeSession = {
  role: "steward",
  userId: 10,
  permissions: [
    "members.view",
    "grievances.view",
    "grievances.file",
    "bulletins.view",
    "documents.view",
    "meetings.view",
  ],
};

const ADMIN_SESSION: FakeSession = {
  role: "admin",
  userId: 1,
  permissions: [
    "members.view",
    "members.edit",
    "grievances.view",
    "grievances.file",
    "grievances.manage",
    "bulletins.view",
    "bulletins.post",
    "bulletins.manage",
    "documents.view",
    "documents.upload",
    "meetings.view",
    "meetings.manage",
  ],
};

// ─── Route definitions that mirror index.ts mounts ───────────────────────────

const STEWARD_ONLY_ROUTES = [
  { path: "/grievances/42/journal",      label: "case journal" },
  { path: "/grievances/42/just-cause",   label: "just-cause assessment" },
  { path: "/grievances/42/communications", label: "communications log" },
  { path: "/grievance-templates",        label: "grievance templates" },
  { path: "/members/7/discipline",       label: "discipline records" },
  { path: "/members/7/onboarding",       label: "onboarding checklist" },
  { path: "/stats",                      label: "union statistics" },
  { path: "/coverage",                   label: "steward coverage" },
];

const MEMBER_ACCESSIBLE_ROUTES = [
  { path: "/polls",    label: "polls" },
  { path: "/cba-info", label: "CBA info" },
];

// ─── Build a minimal test app ─────────────────────────────────────────────────

function buildApp(session: FakeSession) {
  const app = express();
  app.use(withSession(session));

  // Steward-only: guard + stub handler
  for (const route of STEWARD_ONLY_ROUTES) {
    app.get(route.path, requireSteward, (_req: Request, res: Response) => {
      res.json({ ok: true, route: route.label });
    });
  }

  // Also test requirePermission("members.view") as representative named permission
  app.get(
    "/members",
    requirePermission("members.view"),
    (_req: Request, res: Response) => res.json({ ok: true }),
  );

  // Member-accessible: no extra guard (mirrors index.ts)
  for (const route of MEMBER_ACCESSIBLE_ROUTES) {
    app.get(route.path, (_req: Request, res: Response) => {
      res.json({ ok: true, route: route.label });
    });
  }

  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Steward-only routes — member session receives 403", () => {
  const agent = supertest(buildApp(MEMBER_SESSION));

  for (const route of STEWARD_ONLY_ROUTES) {
    it(`GET ${route.path} (${route.label}) → 403`, async () => {
      const res = await agent.get(route.path);
      expect(res.status).toBe(403);
      expect((res.body as { code?: string }).code).toBe("INSUFFICIENT_ROLE");
    });
  }
});

describe("Steward-only routes — steward session receives 200", () => {
  const agent = supertest(buildApp(STEWARD_SESSION));

  for (const route of STEWARD_ONLY_ROUTES) {
    it(`GET ${route.path} (${route.label}) → 200`, async () => {
      const res = await agent.get(route.path);
      expect(res.status).toBe(200);
      expect((res.body as { ok: boolean }).ok).toBe(true);
    });
  }
});

describe("Steward-only routes — admin session receives 200", () => {
  const agent = supertest(buildApp(ADMIN_SESSION));

  for (const route of STEWARD_ONLY_ROUTES) {
    it(`GET ${route.path} (${route.label}) → 200`, async () => {
      const res = await agent.get(route.path);
      expect(res.status).toBe(200);
    });
  }
});

describe("Member-accessible routes — member session receives 200", () => {
  const agent = supertest(buildApp(MEMBER_SESSION));

  for (const route of MEMBER_ACCESSIBLE_ROUTES) {
    it(`GET ${route.path} (${route.label}) → 200`, async () => {
      const res = await agent.get(route.path);
      expect(res.status).toBe(200);
      expect((res.body as { ok: boolean }).ok).toBe(true);
    });
  }
});

describe("Named permission guard — requirePermission('members.view')", () => {
  it("blocks a member (empty permissions array) with 403", async () => {
    const agent = supertest(buildApp(MEMBER_SESSION));
    const res = await agent.get("/members");
    expect(res.status).toBe(403);
  });

  it("allows a steward who has members.view with 200", async () => {
    const agent = supertest(buildApp(STEWARD_SESSION));
    const res = await agent.get("/members");
    expect(res.status).toBe(200);
  });

  it("allows admin (bypasses permission check) with 200", async () => {
    const agent = supertest(buildApp(ADMIN_SESSION));
    const res = await agent.get("/members");
    expect(res.status).toBe(200);
  });
});
