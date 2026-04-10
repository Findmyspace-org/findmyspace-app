# FindMySpace Verification Model

## Purpose

FindMySpace needs a trust and verification model to protect renters, owners, and the platform. Listings should only go live once both the owner and the specific space have been verified and approved.

---

## Verification Principles

1. Verification happens at two levels:
   - owner verification
   - listing verification

2. Owner verification is completed once per owner account.

3. Listing verification is completed for each individual space listing.

4. A listing must not go live until:
   - the owner has been verified
   - proof of ownership for that listing has been reviewed
   - admin has approved the listing

---

## 1. Owner Verification

Owner verification is linked to the account holder, not to an individual property.

### Required documents
- ID document front
- ID document back
- proof of bank account
- bank details

### Required bank details
- account holder name
- bank name
- account number
- account type
- branch code

### Owner verification statuses
- pending
- verified
- rejected

### Rules
- An owner can create listings before final approval, but listings cannot go live until owner verification is approved.
- If owner verification is rejected, the owner must be able to re-upload the required documents.

---

## 2. Listing Verification

Listing verification is linked to a specific space.

### Required document for each listing
- proof of ownership for that space

### Important rule
Each listing must have its own ownership proof, because one owner may have multiple properties at different locations.

### Listing verification statuses
- pending
- verified
- rejected

### Rules
- Proof of ownership must be uploaded for every new listing.
- A verified owner still needs to upload separate ownership proof for each listing.
- If ownership proof is rejected, the listing remains pending until corrected.

---

## 3. Listing Status Rules

### Listing statuses
- draft
- pending
- active
- paused
- rejected

### Activation logic
A listing may only move to `active` when:
- owner verification status = `verified`
- listing verification status = `verified`
- admin approval has been completed

### Meaning of statuses
- `draft` = listing is being created or edited
- `pending` = waiting for review or missing required approvals
- `active` = live and visible to the public
- `paused` = temporarily hidden
- `rejected` = not allowed to go live

---

## 4. Recommended User Flow

### Step 1 - Sign up
The user creates a normal account.

### Step 2 - Become a host
When the user wants to list a space, they enter the host verification flow.

### Step 3 - Complete owner verification
The user uploads:
- ID front
- ID back
- proof of bank account
- bank details

### Step 4 - Create listing
The user enters listing details and uploads proof of ownership for that specific space.

### Step 5 - Admin review
Admin reviews:
- owner documents
- bank details and bank proof
- proof of ownership for the listing
- listing information

### Step 6 - Activation
The listing is activated only after all required checks are approved.

---

## 5. Admin Review Model

Admin must be able to review two things separately:

### A. Owner verification review
Admin checks:
- ID front
- ID back
- proof of bank account
- bank details

Admin actions:
- approve
- reject
- request re-upload later if needed

### B. Listing verification review
Admin checks:
- proof of ownership for that listing
- listing details
- images
- map location
- pricing information

Admin actions:
- approve
- pause
- reject
- mark pending

---

## 6. Data Model Recommendation

### Profiles table
Recommended fields:
- id
- role
- is_host
- owner_verification_status

### Owner verification documents table
Suggested fields:
- id
- owner_id
- document_type
- file_url
- status
- review_notes
- uploaded_at
- reviewed_at

### Owner bank details table
Suggested fields:
- id
- owner_id
- account_holder_name
- bank_name
- account_number
- account_type
- branch_code
- proof_of_bank_url
- status
- review_notes
- uploaded_at
- reviewed_at

### Listing ownership documents table
Suggested fields:
- id
- space_id
- owner_id
- document_type
- file_url
- status
- review_notes
- uploaded_at
- reviewed_at

---

## 7. MVP Rules

For MVP, the platform should enforce these rules:

1. Every host must upload:
   - ID front
   - ID back
   - proof of bank account
   - bank details

2. Every listing must upload:
   - proof of ownership for that specific space

3. Listings must stay pending until:
   - owner verification approved
   - listing proof approved
   - admin approval completed

4. Public search and browse pages must show only listings with:
   - status = active

---

## 8. Future Enhancements

Later phases may include:
- document re-upload flow for rejected verification
- admin review notes visible to owner
- automated reminders for missing verification items
- OCR and document extraction
- automated ID checks
- automated bank validation
- authority-to-list support for agents or non-owner representatives

---

## 9. Product Decision Summary

FindMySpace will use a trust-first listing model.

This means:
- owner identity must be verified
- bank account must be verified
- every space must have proof of ownership
- listings go live only after admin approval

This verification model is part of the platform core and should be reflected in:
- onboarding
- dashboard flows
- listing creation
- admin review
- activation logic