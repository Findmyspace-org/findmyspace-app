# FindMySpace MVP (One-Page Blueprint)

## Goal
Build a working marketplace where:
- Customers can browse, book, and pay
- Owners can list spaces and accept bookings
- Admin verifies and activates listings
- Platform collects money and pays owners monthly

---

## Core Flow

### Listings
- Owners can create listings immediately
- Listings are NOT public until fully verified + approved

A listing can only go live if:
- owner_verification_status = verified
- bank_verification_status = verified
- ownership_proof_status = verified
- admin has approved the listing

---

### Booking Flow
1. Customer requests booking → `pending_owner`
2. Owner accepts → `accepted_awaiting_payment`
3. Customer pays
4. Booking becomes → `paid_confirmed`

No payment before owner accepts.

---

### Payment Model
- Customer pays FindMySpace
- Platform holds the money
- Owner is paid later (monthly)

Booking is NOT confirmed until payment succeeds.

---

### Payout Model (MVP)
- Manual monthly payouts
- Platform tracks what is owed to each owner
- At month end:
  - calculate totals
  - pay owners manually
  - mark as paid

---

## Status Models

### Listing Status
pending  
active  
paused  
rejected  
deleted  

### Verification Status
pending  
verified  
rejected  

### Booking Status
pending_owner  
accepted_awaiting_payment  
paid_confirmed  
declined  
cancelled  
completed  

### Payment Status
unpaid  
pending  
paid  
failed  
refunded  

### Payout Status
unpaid_to_owner  
paid  

---

## Key Rules

- Listings can exist before verification, but cannot go live
- Owner must accept before payment happens
- Booking only becomes confirmed after payment
- All money flows through FindMySpace
- Owners are paid monthly (not instantly)

---

## Tables (High Level)

profiles  
spaces  
space_images  
space_attributes  

owner_verification_documents  
owner_bank_details  
listing_ownership_documents  

bookings  
payments  

---

## MVP Scope

### Included
- Listing creation
- Verification (ID, bank, ownership)
- Admin approval
- Booking requests
- Payment after acceptance
- Manual payouts

### Not Included (Later)
- Automated payouts
- Refund system
- Disputes
- Coupons
- Advanced analytics

---

## UX Rules

- Always show verification status to owner
- Clearly block activation with reason:
  "Missing: owner verification, bank verification, ownership proof"
- Show alerts on:
  - Dashboard
  - My Listings
  - Edit Listing

---

## Philosophy

- Keep it simple
- Build fast
- Control risk via verification
- Delay complexity (especially payments)

requires_prepayment: boolean