-- Apple refresh tokens kept only so account deletion can revoke them
-- (App Review 5.1.1(v)). Written by the `apple-token` edge function after Apple
-- confirms the token belongs to the caller; read by `account-delete`.
--
-- Encrypted before it reaches this table (AES-256-GCM, key in the
-- APPLE_TOKEN_ENC_KEY edge secret), so a database dump alone yields nothing
-- usable. Row level security is on with NO policies: only the service role,
-- i.e. those two functions, can touch it. Deleting the user removes the row.

create table if not exists public.apple_auth_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token_ciphertext text not null,
  updated_at timestamptz not null default now()
);

alter table public.apple_auth_tokens enable row level security;

revoke all on table public.apple_auth_tokens from anon, authenticated;

comment on table public.apple_auth_tokens is
  'Encrypted Sign in with Apple refresh tokens, held only to revoke them when the account is deleted. Service role only.';
