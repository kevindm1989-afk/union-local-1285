# Union Local 1285 — Steward App

## Overview

Mobile PWA for Union Local 1285 stewards to manage member records, track grievances, post bulletins, and access CBA documents. Built as a pnpm monorepo with a React + Vite frontend and Express API server backed by PostgreSQL. Full RBAC system with role-configurable permissions. Includes a Claude AI assistant (CBA Q&A) powered by Anthropic via Replit AI Integrations.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Frontend**: React + Vite + shadcn/ui + TanStack Query
- **Routing**: Wouter
- **Build**: esbuild (CJS bundle)

## Artifacts

| Artifact | Path | Description |
|----------|------|-------------|
| `pwa-app` | `/` | Mobile PWA — bottom tab nav (Dashboard, Members, Grievances, Bulletins) |
| `api-server` | `/api` | REST API server (Express) |

## Database Schema

- **members** — union member records (name, employee_id, department, classification, phone, email, join_date, is_active, notes)
- **grievances** — grievance tracking (grievance_number, member_id, title, description, contract_article, step 1-4, status, filed_date, due_date, resolved_date, resolution, notes)
- **announcements** — bulletins/announcements (title, content, category, is_urgent, published_at)

## API Routes

- `GET/POST /api/members` — member list & create
- `GET/PATCH/DELETE /api/members/:id` — member CRUD
- `GET /api/members/:id/grievances` — member's grievances
- `GET/POST /api/grievances` — grievance list & create
- `GET/PATCH/DELETE /api/grievances/:id` — grievance CRUD
- `GET /api/grievances/stats/summary` — grievance stats
- `GET/POST /api/announcements` — bulletin list & create
- `GET/PATCH/DELETE /api/announcements/:id` — bulletin CRUD
- `GET /api/dashboard/summary` — dashboard stats
- `GET /api/dashboard/recent-activity` — recent grievances & bulletins

## PWA Pages

- **Dashboard** — stats tiles + recent grievances + recent bulletins
- **Members** — searchable directory + create/edit/delete
- **Grievances** — filtered list (by status) + create/edit/delete + step tracking
- **Bulletins** — announcement list (urgent pinned) + create/delete

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Grievance Statuses
`open` | `pending_response` | `pending_hearing` | `resolved` | `withdrawn`

## Announcement Categories
`general` | `urgent` | `contract` | `meeting` | `action`
