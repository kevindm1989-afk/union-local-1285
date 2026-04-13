# Union Local 1285 — Unionize Steward App

## Overview

Mobile PWA for Unifor Local 1285 stewards to manage member records, track grievances, post bulletins, and access CBA documents. Built as a pnpm monorepo with a React + Vite frontend and Express API server backed by Neon cloud PostgreSQL. Full RBAC system with role-configurable permissions. Includes a Gemini AI assistant (CBA Q&A) and AI-powered grievance drafting.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **API framework**: Express 5
- **Database**: Neon cloud PostgreSQL (`NEON_DATABASE_URL`) via `drizzle-orm/neon-serverless`
- **ORM**: Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec) — **do NOT edit generated files in `lib/api-zod/`**
- **Frontend**: React + Vite + shadcn/ui + TanStack Query + Wouter
- **AI**: Google Gemini (`gemini-2.5-flash` for main, `gemini-2.5-flash-lite` for quick tasks)
- **Push notifications**: Web Push API (VAPID keys in secrets)
- **Email**: Resend (via Replit integration)

## Artifacts

| Artifact | Path | Description |
|----------|------|-------------|
| `pwa-app` | `/` | Mobile PWA — bottom tab nav (Dashboard, Members, Grievances, Bulletins) |
| `api-server` | `/api` | REST API server (Express) |

## Database Schema

- **members** — `seniority_rank`, `accommodation_active`, `steward_notes`, `card_signed` added
- **grievances** — `grievance_type`, `incident_date`, `remedy_requested`, `outcome` added
- **announcements** — `urgency_level`, `scheduled_for`, `is_published`, `expires_at` added; 10 categories
- **meetings** — `agenda_items` (jsonb), `attendance_data` (jsonb) added
- **documents** — `steward_only` (boolean) added
- **bulletin_acknowledgements** — tracks per-member bulletin reads
- **bulletin_responses** — tracks mobilization responses (`im_in`/`need_info`)
- **grievance_notes**, **audit_logs**, **local_settings**, **access_requests**, **member_files**, **discipline_records**, **push_subscriptions**

All schema additions done via `ensureAdvancedFeatureTables()` raw SQL `ADD COLUMN IF NOT EXISTS` on startup.

## API Routes (key)

- `GET/POST /api/members` — member list & create (cardSigned, seniorityRank, accommodationActive, stewardNotes)
- `GET/PATCH/DELETE /api/members/:id` — member CRUD (role-based field filtering)
- `GET/POST /api/grievances` — grievance list & create (grievanceType, incidentDate, remedyRequested from `req.body` not parsed `d`)
- `GET/PATCH/DELETE /api/grievances/:id` — grievance CRUD (same `req.body` pattern for extra fields)
- `GET/POST /api/announcements` — bulletin list (`?view=active|scheduled|archived`) & create (category bypass via rawCategory)
- `POST /api/announcements/:id/acknowledge` — member bulletin ack (uses `linkedMemberId ?? userId`)
- `POST /api/announcements/:id/respond` — mobilization response (uses `linkedMemberId ?? userId`)
- `GET /api/announcements/:id/acknowledgements` — steward: ack dashboard (rate, list)
- `GET /api/announcements/:id/responses` — steward: mobilization response breakdown
- `POST /api/announcements/:id/notify-unacknowledged` — send push to unacked members
- `GET /api/member-portal/bulletins` — member feed (isAcknowledged, myResponse, uses `linkedMemberId ?? userId`)

## Key Bug Fixes

- **api-zod category bypass**: `CreateAnnouncementBody` only has 5 categories — strip category before parsing, validate separately with `ANNOUNCEMENT_CATEGORIES.includes()`
- **api-zod extra fields stripping**: `UpdateGrievanceBody` strips `incidentDate`/`remedyRequested` — always read these from `req.body` (`rawBody`) not from parsed `d`
- **Acknowledge/respond fallback**: Uses `linkedMemberId ?? userId` so unlinked member accounts still work

## Frontend Pages

- **BulletinCreate** (`/bulletins/new`) — 10 categories, urgencyLevel auto-set by category, scheduledFor + expiresAt fields, red/blue warning banners
- **Bulletins** (`/bulletins`) — Active/Scheduled/Archived tabs, Emergency overlay (full-screen red modal for critical), EmergencyBanner inline, category chips
- **BulletinDetail** (`/bulletins/:id`) — Steward Tools: Ack Dashboard (expandable, rate bar, notify button), Mobilization Responses (I'm In / Need Info counts)
- **MemberPortalBulletins** (`/portal/bulletins`) — Acknowledge button per card, I'm In/Need More Info for mobilization bulletins
- **GrievanceCreate** (`/grievances/new`) — grievanceType, incidentDate, remedyRequested fields
- **GrievanceDetail** (`/grievances/:id`) — step tracker (Steps 1-4+Arbitration), incidentDate + remedyRequested display fields, outcome select
- **MemberCreate** (`/members/new`) — shift, seniorityDate, duesStatus, cardSigned toggle
- **MemberDetail** (`/members/:id`) — all new fields + role-based visibility (stewardNotes admin-only)
- **MeetingDetail** (`/meetings/:id`) — agenda builder (add/remove items), attendance tracking
- **Documents** (`/documents`) — search bar, stewardOnly badge/toggle
- **CbaAssistant** (`/assistant`) — quick-action suggestion chips, Gemini AI chat about CBA

## Critical Patterns

- **api-zod generated files**: Do NOT modify `lib/api-zod/src/generated/`. Use `req.body` directly for fields not in generated schemas, cast with `as any` where needed.
- **New Drizzle fields**: Added `as any` casting for new columns not yet in generated types (e.g. `(updates as any).cardSigned`)
- **Pool usage**: `pool.connect()` → `client.query()` → `client.release()` in try/finally for raw SQL
- **Route ordering**: Sub-routes (`/scheduled`, `/archived`, `/acknowledge`) must be mounted BEFORE `/:id`
- **Gemini constants**: `GEMINI_FLASH_LITE_MODEL = 'gemini-2.5-flash-lite'`, `GEMINI_MODEL = 'gemini-2.5-flash'` in `artifacts/api-server/src/lib/anthropic/constants.ts`
- **Session fields**: `req.session.role`, `req.session.userId`, `req.session.linkedMemberId`

## Announcement Categories (10 total)

`general` | `urgent` | `contract` | `meeting` | `action` | `safety_alert` | `strike_action` | `job_action` | `vote_notice` | `policy_change`

Mobilization categories (show I'm In / Need More Info): `job_action`, `strike_action`, `action`
Critical/emergency categories (full-screen overlay): `safety_alert`, `strike_action`, `job_action`

## Required Secrets

| Secret | Notes |
|---|---|
| `ADMIN_PASSWORD` | Mandatory — no fallback. Server exits if absent. |
| `NEON_DATABASE_URL` | Neon cloud PostgreSQL connection string |
| `GEMINI_API_KEY` | Gemini AI for CBA assistant + grievance drafting |
| `ANTHROPIC_API_KEY` | Optional — legacy; Gemini is primary AI |
| `VAPID_PRIVATE_KEY` | Web Push notifications |

## Security Features

- Password strength: min 12 chars, upper+lower+digit+special required
- Idle auto-logout: 30 minutes of inactivity
- Audit logging: all member/grievance CRUD logged to `audit_logs`
- RBAC: permissions configurable per role in Admin panel
- stewardOnly documents hidden from member-role users

## Email Notifications

- Provider: Resend (via Replit integration)
- Events: grievance filed, status changed, new access request
- Admin email configured in Admin → Config (`local_settings.admin_email`)
