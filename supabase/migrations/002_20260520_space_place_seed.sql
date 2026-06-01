-- Seed data for The Space Place (organisations + contacts; profiles when auth users exist)

-- Fixed organisation IDs for stable references
INSERT INTO public.crm_organisations (id, name, type, pipeline_stage, notes)
VALUES
  (
    'a1000001-0001-4001-8001-000000000001',
    'Drakenstein Municipality',
    'municipality',
    'follow_up',
    'Key municipal partnership prospect.'
  ),
  (
    'a1000001-0001-4001-8001-000000000002',
    'Paarl Boys'' Primary School',
    'school',
    'first_contact',
    NULL
  ),
  (
    'a1000001-0001-4001-8001-000000000003',
    'Vrymansfontein',
    'venue',
    'prospect',
    NULL
  ),
  (
    'a1000001-0001-4001-8001-000000000004',
    'Paarl Girls High',
    'school',
    'in_progress',
    NULL
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.crm_contacts (
  id, organisation_id, first_name, last_name, full_name, role, email, phone, status
)
VALUES
  (
    'b2000001-0001-4001-8001-000000000001',
    'a1000001-0001-4001-8001-000000000001',
    'Ilona', 'Muller', 'Ilona Muller', 'Events coordinator',
    'ilona@drakenstein.gov.za', '+27218765432', 'active'
  ),
  (
    'b2000001-0001-4001-8001-000000000002',
    'a1000001-0001-4001-8001-000000000001',
    'Eda', 'Barnard', 'Eda Barnard', 'Facilities',
    'eda@drakenstein.gov.za', '+27218765433', 'active'
  ),
  (
    'b2000001-0001-4001-8001-000000000003',
    'a1000001-0001-4001-8001-000000000002',
    'H', 'Bester', 'H Bester', 'Principal',
    NULL, '+27218654321', 'active'
  ),
  (
    'b2000001-0001-4001-8001-000000000004',
    'a1000001-0001-4001-8001-000000000002',
    'C', 'de Clerk', 'C de Clerk', 'Admin',
    NULL, NULL, 'active'
  ),
  (
    'b2000001-0001-4001-8001-000000000005',
    'a1000001-0001-4001-8001-000000000003',
    'Brenice', NULL, 'Brenice', 'Owner',
    NULL, '+27821234567', 'active'
  ),
  (
    'b2000001-0001-4001-8001-000000000006',
    'a1000001-0001-4001-8001-000000000004',
    'Marie', 'Lowe', 'Marie Lowe', 'Contact',
    'marie@paarlgirlshigh.co.za', '+27219876543', 'active'
  )
ON CONFLICT (id) DO NOTHING;

-- Spacer/Main Admin profiles are NOT auto-created from auth.users.
-- Main Admin: enable via Space Place → "Enable Main Admin access" (platform admin only).
-- Spacers: invite via More → Team → Invite Spacer (crm_spacer_invites).

-- Assign Drakenstein when a Spacer profile named Amelie exists (post-invite)
UPDATE public.crm_organisations o
SET assigned_to = p.id
FROM public.crm_profiles p
WHERE o.id = 'a1000001-0001-4001-8001-000000000001'
  AND p.full_name ILIKE 'Amelie%'
  AND o.assigned_to IS NULL;

-- Sample tasks when Amelie exists
INSERT INTO public.crm_tasks (
  id, organisation_id, contact_id, title, due_date, status, priority, owner_id
)
SELECT
  'c3000001-0001-4001-8001-000000000001',
  'a1000001-0001-4001-8001-000000000001',
  'b2000001-0001-4001-8001-000000000001',
  'Follow up with Ilona',
  (CURRENT_DATE + INTERVAL '1 day')::date,
  'open',
  'normal',
  p.id
FROM public.crm_profiles p
WHERE p.full_name ILIKE 'Amelie%'
ON CONFLICT (id) DO NOTHING;
