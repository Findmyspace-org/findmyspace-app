# Unclaimed listing lifecycle — manual QA checklist

Use this script after deploying migrations `014`–`017` (`supabase db push`).

## Preconditions

- [ ] Admin account with `profiles.role = admin`
- [ ] Test owner account (non-admin)
- [ ] Test renter account (non-admin, not the owner)
- [ ] `ADMIN_NOTIFICATION_EMAIL` configured (optional, for email checks)
- [ ] `INTERNAL_API_SECRET` set in server env (for server-to-server listing notifications)
- [ ] Migrations `014`–`019` applied (`supabase db push`)

---

## Happy path

### 1. Admin create draft

- [ ] Go to `/admin/unclaimed-listings/new`
- [ ] Create listing with title, category, location; save as draft
- [ ] Confirm status = `draft`, `owner_id` is null, `created_by_admin = true`
- [ ] Audit: `unclaimed_listing_created`

### 2. Publish unclaimed

- [ ] Add at least one photo, complete required fields
- [ ] Publish → status = `unclaimed`
- [ ] Audit: `unclaimed_listing_published`
- [ ] Listing appears on `/spaces` and `/spaces/map`
- [ ] Card shows **“Availability to be confirmed”** and **“Pricing to be confirmed”**
- [ ] No booking form on public detail page

### 3. Public enquiry

- [ ] Open public detail as renter (logged in)
- [ ] Submit enquiry form (**“Request this space”**)
- [ ] Enquiry appears in `/admin/listing-enquiries`
- [ ] Owner/renter notifications sent (if configured)

### 4. Claim link

- [ ] Admin: generate claim link on unclaimed edit page
- [ ] Audit: `listing_claim_link_created`
- [ ] Invite email sent (if configured)
- [ ] Raw token is not stored in DB (only hash)

### 5. Owner claim

- [ ] Open claim URL while logged out → login redirect works
- [ ] Accept claim as test owner
- [ ] Status → `owner_claimed`, `owner_id` set, listing **removed** from public browse
- [ ] Audit: `listing_claimed`
- [ ] Owner notification + admin notification

### 6. Owner completion

- [ ] Owner finds listing on `/dashboard/listings` (Setup tab or All)
- [ ] CTA **“Complete listing”** → `/dashboard/listings/[id]/complete`
- [ ] Checklist shows Missing / Pending review states correctly
- [ ] Complete: basics, photo, pricing, verification docs, ownership proof upload
- [ ] Edit page does **not** show “Quick status change” or allow self-activate

### 7. Submit for review

- [ ] Submit for review when minimum requirements met
- [ ] Status → `pending_verification`
- [ ] Audit: `listing_submitted_for_review`
- [ ] Admin notified; owner sees pending copy on completion page
- [ ] Edit page locked while pending; dashboard shows **“Submitted for review”**

### 8. Admin request changes

- [ ] `/admin/listing-reviews/[id]` → Request changes with comment
- [ ] Status → `needs_changes`
- [ ] Audit: `listing_needs_changes`
- [ ] Owner notified; dashboard CTA **“Review requested changes”** (urgent)

### 9. Owner resubmit

- [ ] Owner fixes items, resubmits from completion page
- [ ] Status → `pending_verification` again

### 10. Admin approve

- [ ] Verify identity, bank, ownership proof in admin verification/spaces tools
- [ ] Approve button disabled until checklist fully verified
- [ ] Approve → status `active`
- [ ] Audit: `listing_approved`
- [ ] Owner notified with live/bookable copy
- [ ] Listing public on `/spaces` with pricing and booking form

### 11. Public booking

- [ ] Renter books active listing end-to-end
- [ ] Owner approves request → payment flow (PayFast or mock pay page)
- [ ] Booking completes successfully

---

## Negative tests

### Booking non-active listing

- [ ] **UI:** `owner_claimed` / `pending_verification` / `needs_changes` / `rejected` / `paused` listings return 404 on `/spaces/[id]` (except `unclaimed`)
- [ ] **API:** PayFast initiate returns error if linked space is not `active`
- [ ] **DB:** Direct `INSERT` into `bookings` for non-active `space_id` fails with `bookings_require_active_space` (migration `017`)
- [ ] **Owner approve:** Approving a booking request fails if listing is not `active`

### Claim token abuse

- [ ] Expired token → validate/accept fails
- [ ] Revoked token → fails (`listing_claim_link_revoked` audit on revoke)
- [ ] Already-claimed token → fails
- [ ] Reused token on already-owned listing → fails (409)
- [ ] Non-admin-created listing → not claimable
- [ ] Token hash never returned in API responses

### Owner bypass attempts

- [ ] Owner cannot set `active` via `/spaces/[id]/edit` (status not in save payload; DB trigger blocks client status changes)
- [ ] Owner cannot set `pending_verification` except via submit-review API
- [ ] Owner cannot edit another owner’s listing (`owner_id` gate)
- [ ] `pending_verification` edit form is disabled/locked

### Notification route security

- [ ] `POST /api/notifications/listing-event` without auth → 401
- [ ] Non-owner/non-admin caller → 403

---

## RLS / security checks

- [ ] Public browse queries only return `active` + `unclaimed` (app layer)
- [ ] If `spaces` RLS enabled: `spaces_public_browse` policy matches above
- [ ] Migration `018`: `spaces` RLS policies exist (`spaces_public_browse`, `spaces_owner_select`, `spaces_admin_select`, `spaces_owner_insert`, `spaces_owner_update`)
- [ ] Admin JWT client `UPDATE spaces SET status = 'active'` fails (trigger `spaces_status_change_forbidden`)
- [ ] Owner JWT `active` ↔ `paused` toggle still works on dashboard
- [ ] `listing_enquiries` insert only allowed for `unclaimed` listings
- [ ] `listing_booking_requirements` / questionnaires only public for `active`
- [ ] Private buckets (`listing-ownership`, verification docs) not publicly listable
- [ ] Admin routes use `requireAdminApi` (spot-check approve/reject/unclaimed APIs)

---

## Audit log coverage

Confirm rows in `admin_audit_log` (or stderr `[admin-audit]` in dev):

| Event | Trigger |
|-------|---------|
| `unclaimed_listing_created` | Admin create |
| `unclaimed_listing_updated` | Admin edit unclaimed |
| `unclaimed_listing_published` | Publish unclaimed |
| `listing_claim_link_created` | Generate claim link |
| `listing_claim_link_revoked` | Revoke claim link |
| `listing_claimed` | Owner accepts claim |
| `listing_submitted_for_review` | Owner submit |
| `listing_needs_changes` | Admin request changes |
| `listing_rejected` | Admin reject |
| `listing_approved` | Admin approve |

| `listing_paused` / `listing_resumed` | Admin live-status API |
| `ownership_proof_verified` | Admin ownership-proof API |
| `listing_admin_meta_updated` | Admin listing-meta API |

---

## PR6 — Admin mutation cleanup

### Legacy admin pages cannot bypass approval

- [ ] `/admin/spaces` — no “Approve / Activate” button for `pending` / `pending_verification` / `owner_claimed`; shows **Review listing** link instead
- [ ] `/admin/listings` — no direct **Activate** for non-live statuses; shows **Review listing** link
- [ ] `/admin/verification` — verifying identity/bank does **not** auto-set listing `active`
- [ ] Ownership proof verify on `/admin/spaces` does **not** auto-activate listing

### Direct client status update blocked

- [ ] Admin browser Supabase client cannot `UPDATE spaces.status` (DB trigger)
- [ ] Owner browser client cannot set `active` from `owner_claimed` (DB trigger)
- [ ] Approve only via `POST /api/admin/spaces/[id]/approve` (returns 400 if checklist incomplete)

### Live listing management

- [ ] Admin can pause/resume **only** `active` / `paused` listings via live-status API
- [ ] Owner dashboard pause/activate toggle still works for own live listings
- [ ] Booking still requires `active` (UI + DB trigger on insert)

---

## Regression

- [ ] Existing **legacy** `active` listings still bookable
- [ ] Owner pause/activate toggle still works for `active`/`paused` on `/dashboard/listings`
- [ ] Legacy `pending` host-created listings unaffected (if any in environment)

---

## Automated guard tests (optional)

```bash
node scripts/test-lifecycle-guards.mjs
```

Covers pure-function guards: bookable status, claim token validation, completion submit/approve gates.
