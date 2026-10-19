-- Manufacturer-owned lead review, part 1: enum changes.
-- Kept in its own migration because Postgres cannot use a newly added enum
-- value inside the transaction that adds it.

-- Distrik no longer runs an internal ops team. The old role becomes a
-- restricted technical administrator (platform maintenance only; no access to
-- manufacturer business data). Renaming keeps existing accounts valid.
alter type public.app_role rename value 'ops_admin' to 'system_admin';

-- Campaigns wait for the manufacturer's own review instead of internal QA.
alter type public.campaign_status rename value 'qa' to 'lead_review';

-- A prospect with warnings (possible duplicate, low confidence, flagged by a
-- rep) that needs a closer look before it can be approved.
alter type public.review_status add value if not exists 'needs_review' after 'pending';
