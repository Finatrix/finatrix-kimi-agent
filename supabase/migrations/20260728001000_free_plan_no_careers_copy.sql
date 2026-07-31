-- Careers is now gated behind a paid subscription (CareersPaywallGate); the
-- Free plan's feature list previously advertised "Basic Job Search", which is
-- no longer true — Free users never reach the Careers app. Data-only content
-- fix (no schema change): drops that one line item, keeps Resume Score/ATS
-- Score since those remain accurate for whatever Free still covers elsewhere.
update public.subscription_plans
set features = '["Resume Score","ATS Score"]'::jsonb
where id = 'free';
