# FindMySpace — ChatGPT technical briefing

**Purpose:** Paste this document at the start of a ChatGPT conversation before asking for code, schema, or environment changes. It describes the live product, the repo, how systems connect, what is reliable, and what is fragile.

**As of:** 21 September 2026  
**Repo:** `https://github.com/Findmyspace-org/findmyspace-app`  
**Local path:** `/Users/macbook/findmyspace-app`  
**Current git branch:** `main` (tracks `origin/main`)  
**Latest committed SHA:** `78f5fe2` — message `crm11`

Do **not** treat `README.md` or `docs/PROJECT_STATE.md` as current. The README is still the create-next-app stub. `PROJECT_STATE.md` is an old browse-stabilization note.

---

## 0. How ChatGPT should behave with this codebase

1. **Do not invent a second database or a second app.** There is one Next.js app and one linked Supabase project. Local, Vercel Preview, and Vercel Production all talk to that same Postgres unless proven otherwise.
2. **Vercel deploys code only.** Schema, RLS, triggers, RPCs, and storage buckets are **not** applied by a Vercel deploy. They must be applied separately to Supabase.
3. **Never rename old migrations.** Timestamped files from `20260412…` through `20260507150000_listing_yes_no_questions.sql` are already in remote `schema_migrations`. New files use `NNN_YYYYMMDD_short_description.sql`. Next unused sequential number after this briefing is **062** (061 is the in-flight claim-mode fix).
4. **Never put secrets in answers.** Env var *names* are listed below. Values live in `.env.local` (local) and the Vercel project env settings (hosted). `.env*` and `.vercel/` are gitignored.
5. **Do not change `spaces.status` or `public_listing_mode` from a browser Supabase client.** Lifecycle changes go through server routes that use the service role. Database triggers will raise exceptions otherwise.
6. **Prefer existing helpers** in `lib/` over new one-off logic. Listing visibility, booking eligibility, CRM access, and admin auth are already centralized.
7. **South Africa / ZAR product.** Geocoding is ZA-only. Currency is ZAR. Payments are PayFast (plus a leftover manual/mock pay path).

---

## 1. What this product is

FindMySpace is a South African marketplace for renting spaces (storage, parking, venues, rooms, sport, events, etc.).

Three user worlds share one app:

| World | Who | Main URLs |
|---|---|---|
| Marketplace | Public renters + hosts | `/`, `/spaces`, `/spaces/[id]`, `/login`, `/signup`, `/dashboard/*` |
| Platform admin | `profiles.role` = `admin` or `super_admin` | `/admin/*` |
| Space Place CRM | Internal acquisition team (“Spacers”) | `/space-place/*` and desktop `/admin/crm/*` |

**Money model (MVP, still in force):**
- Renter requests a booking → owner accepts → renter pays FindMySpace via PayFast.
- Booking is not confirmed until payment succeeds.
- Platform holds funds; owner payouts are **manual monthly**, tracked in admin finance. Automated payouts are out of scope.

**Trust model:** listings should not be fully bookable until identity, bank, ownership proof, and admin approval are in place — *except* that admins can publish unclaimed / enquiry listings and can even make spaces live before an owner has claimed them. Owner handover is **additive**: it grants the owner rights; it must not remove admin rights.

---

## 2. Stack — what talks to what

```
Browser (Next.js App Router, React 19)
    │  supabase-js anon key (auth session, some client reads/uploads)
    │  fetch() to /api/* with Authorization: Bearer <access_token>
    ▼
Next.js on Vercel  (Node / Fluid Compute — not Edge)
    │  service role for privileged writes
    │  Resend for email
    │  PayFast for checkout + ITN
    │  OpenAI for CRM smart-capture
    │  Nominatim (OpenStreetMap) for ZA geocoding
    │  Puppeteer + @sparticuz/chromium for invoice PDFs on Vercel
    ▼
Supabase project "findmyspace"
    ref: ppdaubmxrmzgmxdnyxff
    host: https://ppdaubmxrmzgmxdnyxff.supabase.co
    org slug: ayjmmsshgfwjjumugbao
    │
    ├── Auth (email/password)
    ├── Postgres (public schema + RLS + triggers + RPCs)
    └── Storage buckets
```

There is **no** Next.js `middleware.ts`. Route protection is:

- Client pages: `RequireAuth` and role checks.
- API: `requireAuthenticatedApi`, `requireAdminApi`, `requireSuperAdminApi`, `requireCrmApi`, `requireOwnerListingApi`, `requireOwnerPropertyApi`, `requireListingEventAuth`.

Admin/CRM APIs typically: verify the user’s JWT with the **anon** client, then mutate with a **service-role** client. Do not collapse that into “just use the browser client.”

### Runtime versions

- Next.js **16.1.7**
- React **19.2.3**
- TypeScript 5, Tailwind CSS 4
- `@supabase/supabase-js` 2.99.x
- Leaflet / react-leaflet for maps
- Resend 6.x for email
- `imapflow` + `mailparser` for CRM mailbox import
- `@dnd-kit/*` for CRM pipeline drag-and-drop

Path alias: `@/*` → repo root.

`next.config.ts` allows Next Image loads only from the production Supabase public storage host above. `vercel.json` in the repo is `{}` (empty). Cron, domains, and env are configured in the Vercel project / dashboard, not in that file.

---

## 3. Environments

This is the most important section for “updates in certain environments.”

### 3.1 The three runtimes

| Runtime | How you run it | Public URL | Env source |
|---|---|---|---|
| **Local** | `npm run dev` → http://localhost:3000 | Optional ngrok tunnel (see `docs/startup.md`) | `.env.local` |
| **Vercel Preview** | Push a non-production branch / PR | `*.vercel.app` | Vercel env: Preview |
| **Vercel Production** | Push / merge to `main` | **https://findmyspace.co.za** | Vercel env: Production |

Canonical production origin is hardcoded as a fallback in `lib/site-url.ts`. In production, `NEXT_PUBLIC_SITE_URL` is **rejected** if it contains `localhost`, `127.0.0.1`, `ngrok`, or **`.vercel.app`**. PayFast return/cancel/notify URLs follow the same rule.

**Consequence:** Vercel Preview is useful for UI review. It is **not** a safe payment, email-link, or webhook environment. Do not point PayFast `notify_url` at a preview URL.

### 3.2 Database is shared

The CLI-linked project is a **single** Supabase project (`ppdaubmxrmzgmxdnyxff`). `next.config.ts` hardcodes that host. There is no second staging database in the repo.

So:

- A migration applied from a laptop against `.env.local` **changes production data/schema** if that file points at the linked project.
- Preview deployments using the same `NEXT_PUBLIC_SUPABASE_URL` read/write the same rows as production.
- “It works locally but not on Vercel” is usually **missing env vars on that Vercel environment**, not a different database.
- “It broke production after I ran a migration locally” is expected if you pushed SQL to the linked project.

### 3.3 What each environment actually deploys

| Change type | Local | Vercel Preview | Vercel Production | Supabase |
|---|---|---|---|---|
| Next.js / React code | `npm run dev` | git push branch | merge to `main` | — |
| Env vars | edit `.env.local`, restart dev | Vercel Preview env | Vercel Production env | — |
| SQL migrations / RLS / triggers | does not auto-apply | does not auto-apply | does not auto-apply | `npx supabase db push` or `npm run apply:migration-NNN` |
| Storage buckets | — | — | — | migrations or Dashboard |
| Auth users, listings, bookings | same DB | same DB | same DB | the live project |

### 3.4 How to apply database changes safely

The repo does **not** rely on `supabase db reset`. History has been repaired before (`npm run repair:crm-migration-history`, `npm run audit:supabase-migration-push`).

Typical apply path (needs `SUPABASE_ACCESS_TOKEN` in `.env.local`):

```bash
npm run db:push-crm
# or a targeted script, currently:
npm run apply:migration-061
```

Scripts link using the project ref parsed from `NEXT_PUBLIC_SUPABASE_URL`, then call `npx supabase@latest db push` or the Management API SQL endpoint.

Rules:

- Next sequential migration is **062_YYYYMMDD_description.sql**.
- Use `IF NOT EXISTS` / `CREATE OR REPLACE` / guarded `DO` blocks.
- After apply, record the version in `supabase_migrations.schema_migrations` (the apply scripts already try to `migration repair --status applied`).
- Do not run `supabase db reset` against the linked cloud project.

### 3.5 Other git branches (do not confuse with environments)

- `main` — current production track.
- `stable/v1-working-flow` — older snapshot.
- `feature/post-payment-messaging-and-dynamic-space-features` — older feature branch.

Work happens on `main` in practice. Commit messages are short and informal (`crm11`, `trello`, `logo`).

---

## 4. Environment variables (names only)

### Required for the app to boot

| Name | Where used |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server Supabase client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + JWT verification |
| `SUPABASE_SERVICE_ROLE_KEY` | Server privileged writes (never expose to the browser) |

Missing URL/anon key throws in `lib/supabase.ts` at import time.

### Production / integrations

| Name | Purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical public origin (emails, PayFast, server fetches). Production: `https://findmyspace.co.za` |
| `NEXT_PUBLIC_APP_URL` | Alternate origin used by Space Place invite tokens |
| `RESEND_API_KEY` | Transactional + marketing email |
| `EMAIL_FROM` | Default From address |
| `ADMIN_NOTIFICATION_EMAIL` | Admin alerts (claims, enquiries) |
| `INTERNAL_API_SECRET` | Server-to-server listing-event notifications |
| `PAYFAST_MERCHANT_ID` | PayFast merchant |
| `PAYFAST_MERCHANT_KEY` | PayFast merchant |
| `PAYFAST_PASSPHRASE` | Signature passphrase |
| `PAYFAST_PROCESS_URL` | Checkout endpoint (sandbox vs live URL) |
| `OPENAI_API_KEY` | CRM smart-capture |
| `OPENAI_MODEL` | Optional; default `gpt-4o-mini` |
| `NOMINATIM_USER_AGENT` | OSM geocoding identification |

### CRM / marketing (optional per environment)

| Name | Purpose |
|---|---|
| `CRM_EMAIL_HOST` / `USER` / `PASSWORD` / `PORT` / `SECURE` | IMAP import |
| `NEXT_PUBLIC_CRM_CAPTURE_EMAIL` | BCC capture address (fallback `crm@findmyspace.co.za`) |
| `MARKETING_SENDER_DOMAIN` | Allowed marketing From domain |
| `MARKETING_UNSUBSCRIBE_SECRET` | Unsubscribe token signing (falls back to `INTERNAL_API_SECRET`) |

### Local-only / scripts

| Name | Purpose |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | CLI + Management API for `db push` / apply scripts |
| `TEST_EMAIL_RECIPIENT` | `/api/test-email` in development |
| `VERIFY_BASE_URL` | Browser verification scripts |
| `CHROME_EXECUTABLE_PATH` | Invoice PDF chrome override (Vercel uses `@sparticuz/chromium`) |

`VERCEL` is set automatically on Vercel and switches invoice PDF generation to serverless Chromium.

---

## 5. Domain model (the objects ChatGPT must not mix up)

**Property** = a venue / site (parent). Has owner, logo, images, booking terms, child spaces.

**Space** = a listable unit under a property (or a standalone unclaimed listing). This is what appears on `/spaces`. Columns that matter:

- `status` — workflow: `draft | unclaimed | owner_claimed | pending_verification | needs_changes | pending | active | paused | rejected | deleted` (plus `approved` in the check constraint; live bookable is `active`).
- `public_listing_mode` — marketplace visibility: `off | enquiry | live`.
- `is_bookable` — extra flag; bookings also require `status = active` **and** `public_listing_mode = live`.
- `owner_id` — nullable until claimed / invited.
- `created_by_admin` — admin-prepared listing, eligible to claim.
- `property_id` — link to parent property.

**Constraint you will hit:** `spaces_live_mode_requires_active`  
`public_listing_mode = 'live'` is only legal when `status = 'active'`. Updating a live listing to `owner_claimed` **without** clearing mode fails.

**Listing vs space vs property language (admin UI):**

- Property → Spaces → Marketplace listing.
- Canonical admin editor: `/admin/spaces/[spaceId]/edit?returnTo=...` (`AdminSpaceEditPage` / `AdminUnclaimedSpaceForm`).
- `/admin/listings` = Marketplace Spaces (fees, live status).
- `/admin/spaces` = Space Approvals.
- `/admin/spaces/all` = All Spaces.
- `/admin/unclaimed-listings` = Unclaimed Spaces (admin-created, pre-owner).
- `/admin/listing-reviews/[id]` = review / approve / request changes.

**Owner handover is additive.** Admin can always manage any non-deleted space. Claiming or inviting an owner adds owner rights; it must not lock admin out.

---

## 6. Listing lifecycle (what actually happens)

Two orthogonal axes:

1. **Workflow `status`** — who owns it, whether it is in review, whether it is live internally.
2. **`public_listing_mode`** — whether the public can see it (`enquiry` or `live`) or not (`off`).

### Acquisition paths

1. **Owner self-serve:** sign up → become host → create listing → verify → admin approve → `active` + `live`.
2. **Admin unclaimed listing:** admin creates draft → publish unclaimed (`enquiry` public, no booking) → claim link → owner claims → `owner_claimed` + mode `off` → owner completes verification → submit → admin approve → `active` + `live`.
3. **Admin property + spaces:** admin creates a property and child spaces, can even make them live before the owner manages them. Later: property invite. Accepting the invite sets property `owner_id` and claims eligible child spaces with the same claim patch as (2).
4. **Venue Scout:** import / research pipeline that converts into unclaimed / admin listings (`/admin/venue-scout`).

### Claim / invite URLs

- Listing claim: `/claim-listing/[token]`
- Property invite: `/property-invite/[token]`
- Owner post-claim onboarding: `/dashboard/listings/[id]/claim` then `/dashboard/listings/[id]/complete`

Tokens are hashed in the DB; raw tokens are not stored.

### Public browse

`lib/public-browse-eligibility.ts` is the canonical filter for `/spaces`.

- Visible if `public_listing_mode` is `enquiry` or `live` (and not archived).
- Enquiry listings: “Availability / pricing to be confirmed”; no booking form; enquiry CTA.
- Live listings: need a resolvable public price unless `on_request`.
- Shared filters: `lib/spaceFilters.ts` used by `/spaces` and `/spaces/map`.
- Map only shows rows with lat/lng. Price slider caps are fixed (All R20k, hour R5k, day R10k, month R20k), not live DB max.

### Booking (once live)

1. Renter submits via `/api/bookings/request` (server insert only; client `INSERT` is blocked).
2. Status `pending_owner` (and similar request states).
3. Owner accepts → `accepted_awaiting_payment`.
4. PayFast initiate `/api/payfast/initiate` → PayFast → ITN `/api/payfast/notify`.
5. Confirmed: `paid_confirmed` + `payment_status = paid`.
6. Unpaid bookings can expire via RPC `expire_unpaid_bookings` called by `GET /api/cron/expire-bookings`.

DB trigger `bookings_require_active_space` blocks booking inserts unless the space is `active` + `live`.

**Leftover:** `/dashboard/my-bookings/[id]/pay` can still record a `manual_mvp` / `manual_test` payment from the browser. Treat as a test/dev path, not the production checkout.

Finance: `/admin/finance` + `/api/admin/finance` + `booking_charges` lines. Payouts remain manual.

---

## 7. Auth, roles, and CRM

### Platform roles (`profiles.role`)

- `user` — default renter/host account.
- `admin` — platform admin.
- `super_admin` — plus Admin users management.

Disabled admins: `profiles.admin_access_disabled`.

Host flag: `profiles.is_host` (set on claim/invite accept).

Verification lives on the profile (identity + bank) and per listing/property (ownership proof). Inherited property ownership can skip per-space proof (`lib/property-ownership-inherit.ts`).

### CRM roles (`crm_profiles`, separate from `profiles`)

- `admin` — CRM desktop + Space Place admin.
- `office_manager` — task manager, broader visibility.
- `spacer` — field acquisition; Space Place mobile.

Desktop CRM (`/admin/crm`) is for CRM admins and platform admins (`lib/crm-desktop/access.ts`).  
Space Place (`/space-place`) is invite-only internal tool, **not** for property owners.

Platform admins get a `crm_profiles` row upserted on first CRM API use.

Recent CRM work (commits `crm` … `crm11`): pipeline, primary contacts, completed actions, IMAP email import, marketing campaigns/templates/lists, organisation–property linking. That area is large and still moving.

---

## 8. Storage

| Bucket | Public? | Use |
|---|---|---|
| `space-images` | Public (legacy) | Listing photos, property logos, some terms docs |
| `listing-ai-knowledge` | Private | PDF/DOCX sources for listing AI Information |
| `booking-requirement-files` | Private | Renter requirement uploads (signed URLs) |
| Owner verification / ownership proof buckets | Private | ID, bank proof, ownership docs |

AI Information: extracted text in `space_ai_documents` / `space_ai_document_chunks`; files optional. Health: `GET /api/admin/ai-knowledge/setup-health`. Listing chat: `/api/space-assistant` (knowledge chunks + contact gating; does not leak owner contact unless allowed).

Geocoding: `/api/geocode` → Nominatim, `countrycodes=za`. Maps: Leaflet.

---

## 9. Email, notifications, payments, cron

- **Resend** (`lib/email.ts`) is the only mail transport. Copy goes through `lib/communication-copy.ts` + `lib/email-templates/EmailLayout.ts`.
- In-app notifications + booking messages; listing events via `/api/notifications/listing-event` (JWT or `X-Internal-Api-Secret`).
- PayFast MD5 signature field order is in `lib/payfast-initiate-fields.ts`. Do not reorder casually.
- Invoice HTML `/api/invoice/[bookingId]`; PDF `/api/invoice/[bookingId]/pdf` (Chromium on Vercel).
- Booking expiry: `GET /api/cron/expire-bookings` calls RPC `expire_unpaid_bookings` (service_role only after migration `062`). The route requires `Authorization: Bearer <CRON_SECRET>` and fails closed if `CRON_SECRET` is unset. Vercel Cron sends that header when the Production env var is set on project `findmyspace` (`prj_QpFsNp41MHcaxGgoXb9NvXTZKIyb`).
- `vercel.json` schedules `/api/cron/expire-bookings` at `0 0 * * *` (00:00 UTC / ~02:00 SAST). **Hobby currently allows once-daily cron only.** Desired future cadence is hourly. Daily execution can leave an expired payment hold (`accepted_awaiting_payment`) blocking the calendar for up to ~24 additional hours after the 24-hour payment window.
- Known follow-up (not changed here): if the RPC succeeds and a later `booking_messages` insert or `/api/notifications/booking-event` call fails, the booking stays expired and that run will not retry notifications (RPC is idempotent and returns no IDs on repeat).

---

## 10. What works well (stable enough to build on)

These are mature enough that ChatGPT should extend them, not replace them:

- **Supabase Auth** login/logout; header session.
- **Browse** `/spaces` + `/spaces/map` with shared `lib/spaceFilters.ts`.
- **Booking overlap prevention** (UI + DB) and server-only booking insert.
- **PayFast initiate + notify** for real checkout (when merchant env is set on that environment).
- **Unclaimed → claim → complete → review → approve** lifecycle, with hashed claim tokens and admin audit events.
- **Canonical admin space editor** at `/admin/spaces/[spaceId]/edit`.
- **Admin access after handover** — admins keep edit rights on live owner-managed spaces.
- **Unsaved-changes guard** on admin + owner shells (`UnsavedChangesProvider` wraps sidebar).
- **Role-gated APIs** (`requireAdminApi` / `requireCrmApi` / owner helpers).
- **CRM desktop + Space Place** as a real internal product (pipeline, tasks, email, marketing), not a mock.
- **Listing AI Information** (paste + PDF/DOCX) and public space assistant with contact gating.
- **Manual finance reporting** (`booking_charges`, admin export).
- **Migration discipline** and targeted apply scripts after earlier `schema_migrations` repair.

Product rules that should not be silently undone:

- Owner cannot self-activate to `active`.
- Direct JWT updates to `spaces.status` / `public_listing_mode` are blocked (triggers).
- Approve only via `POST /api/admin/spaces/[id]/approve` when the completion checklist is fully verified.
- Public booking requires `active` + `live`.

---

## 11. What does not work well / known caution areas

Use these as default suspicions when debugging.

### Environments and ops

- **One shared Supabase** for local + preview + production. Schema and data changes are global.
- **Vercel Preview URLs are banned** as public origin in production code. PayFast/email links must use `findmyspace.co.za`.
- **Empty `vercel.json`.** Cron, headers, and rewrites are not versioned in git.
- **No `.env.example`.** New environments are easy to misconfigure (especially `SUPABASE_SERVICE_ROLE_KEY`, PayFast, Resend, `NEXT_PUBLIC_SITE_URL`).
- **README / PROJECT_STATE are stale.** Trust this brief + the code.
- **Migration history is mixed** (legacy timestamps + sequential `001`–`061`). `db reset` order is unsafe. Push/repair scripts exist because history has drifted before.
- **Commit messages are not descriptive.** Use `git log -p` / blame, not message archaeology.

### Listing / claim (active pain)

- **Claiming a live listing used to violate `spaces_live_mode_requires_active`** because claim only set `status = owner_claimed` and left `public_listing_mode = live`. That is the current in-flight fix (see §12).
- **Property invite could fail halfway** (property owned, child spaces not claimed, token then expired). Retry logic is in the uncommitted `lib/property-invite-server.ts` change.
- **`docs/PROJECT_STATE.md` still talks about pending calendar bookings** as “next focus”; that file is not a backlog.

### Browse / maps

- URL-sync of filters was unstable (render loops) and should stay off unless deliberately reintroduced.
- Filter defaults can hide all listings if max price becomes 0.
- Booking-unit filter affects slider max, sort, and counts — easy to drift if you special-case one page.
- Map omits listings without coordinates.

### Payments / finance

- Mock/manual pay page still exists beside PayFast.
- Legacy paid bookings may lack `booking_charges` rows; reporting has a synthetic-line fallback.
- Owner payouts are still manual; do not implement Stripe/instant payouts unless explicitly asked.
- Preview/ngrok origins must not be used for PayFast ITN in production.

### CRM

- Large, recently landed surface. Permissions differ by `crm_profiles.role` vs `profiles.role`.
- IMAP import and email linking have had history/repair work; test against a non-prod mindset even though the DB is shared.
- Marketing send requires Resend + validated sender domain.

### Frontend architecture

- No Next middleware; easy to add an API route and forget `require*`.
- Heavy client components and browser Supabase usage remain; privileged writes must stay on the server.
- `docs/startup.md` still mentions ngrok for local webhook testing.

---

## 12. Current uncommitted work (do not ignore)

Working tree on `main` (not committed as of this briefing):

| Path | Why |
|---|---|
| `lib/listing-lifecycle.ts` | New `ownerClaimedSpaceUpdate()` sets `status=owner_claimed`, `public_listing_mode=off`, `is_bookable=false` |
| `lib/listing-claim-server.ts` | Accept-claim uses that helper |
| `lib/property-invite-server.ts` | Same claim patch on child spaces; retry if property already owned by this user; allow completing after invite expiry in that case |
| `supabase/migrations/061_20260814_claim_clears_live_listing_mode.sql` | DB trigger: if mode is `live` and status is not `active`, force mode `off`; also clear mode on `paused`/`deleted` |
| `scripts/apply-migration-061.mjs` | Targeted apply + `schema_migrations` repair |
| `package.json` | `apply:migration-061` script |

**Symptom this fixes:** admin publishes a listing live, then sends a claim or property invite. Accepting the claim updates `status` to `owner_claimed` while mode is still `live` → Postgres `spaces_live_mode_requires_active` → claim/invite appears broken, sometimes after the property row already updated.

**To finish in a given environment:**

1. Merge/deploy the **code** (Vercel) so the app sends the new update payload.
2. Apply **migration 061** to the **linked Supabase** (`npm run apply:migration-061`) so the trigger also self-heals if any code path still omits the mode clear.
3. Code-only or SQL-only is incomplete.

Next new migration must be **062_…**, not another 061.

---

## 13. Important file map

| Area | Start here |
|---|---|
| Browser Supabase client | `lib/supabase.ts` |
| Site URL / PayFast origin | `lib/site-url.ts` |
| Listing status + bookability | `lib/listing-lifecycle.ts`, `lib/public-listing-mode.ts` |
| Public browse rules | `lib/public-browse-eligibility.ts`, `lib/spaceFilters.ts` |
| Claim accept | `lib/listing-claim-server.ts` |
| Property invite accept | `lib/property-invite-server.ts` |
| Booking create | `lib/booking-request-server.ts`, `app/api/bookings/request/route.ts` |
| PayFast | `lib/payfast-initiate-shared.ts`, `app/api/payfast/initiate/route.ts`, `app/api/payfast/notify/route.ts` |
| Admin auth | `lib/verify-admin-access.ts`, `lib/require-admin-api.ts`, `lib/admin-roles.ts` |
| Admin nav | `lib/admin-navigation.ts` |
| Canonical admin edit | `app/admin/spaces/[spaceId]/edit/page.tsx`, `lib/admin-listing-routing.ts` |
| CRM API gate | `lib/require-crm-api.ts` |
| CRM roles | `lib/space-place/constants.ts`, `lib/space-place/access.ts` |
| Email | `lib/email.ts`, `lib/communication-copy.ts` |
| AI knowledge | `lib/space-ai-knowledge-server.ts`, `docs/ai-information-supabase-setup.md` |
| Space assistant | `app/api/space-assistant/route.ts` |
| Migrations | `supabase/migrations/` |
| Apply/audit DB | `scripts/apply-crm-migrations.mjs`, `scripts/audit-supabase-migration-push.mjs` |
| Product rules (older, still useful) | `docs/mvp-planning.md`, `docs/verification-model.md`, `docs/unclaimed-listing-lifecycle-qa.md` |

---

## 14. Tests and local commands

There is no Jest suite. Guards are Node/tsx scripts:

```bash
npm run dev
npm run build
npm run test:lifecycle-guards
npm run test:public-browse
# many test:crm-* scripts
npm run db:push-crm          # applies pending migrations to linked project
npm run apply:migration-061  # current in-flight SQL
npm run audit:supabase-migration-push
```

Manual QA for unclaimed/claim/approve: `docs/unclaimed-listing-lifecycle-qa.md`.

---

## 15. Suggested ChatGPT system reminder (short)

Copy this paragraph with the rest of the brief:

> You are helping maintain FindMySpace, a Next.js 16 + Supabase marketplace hosted on Vercel at findmyspace.co.za. One Supabase project (`ppdaubmxrmzgmxdnyxff`) is the database for local and hosted environments. Vercel deploys application code only; SQL must be applied separately. Do not rename legacy timestamped migrations. New migrations are sequential `NNN_YYYYMMDD_name.sql` starting at 062 after 061. Listing live mode (`public_listing_mode=live`) is only valid when `status=active`. Owner claim and property invite must set mode `off` and `is_bookable=false`. Admin rights stay after owner handover. Privileged writes use the service role on `/api/*`. Do not use `*.vercel.app` as PayFast or email origin. Do not dump secrets. Prefer existing `lib/` helpers over new parallel logic.

---

## 16. What to ask the human if still unclear

- Which **environment** to change: local only, Vercel Preview, Vercel Production, or the shared Supabase schema.
- Whether a SQL change may run against the **live** linked project.
- Whether preview/PayFast testing needs a **separate** Supabase project (none exists today).
- Whether CRM vs marketplace vs admin is in scope — they share a repo but not the same auth tables.
