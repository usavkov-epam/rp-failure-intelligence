create extension if not exists supabase_vault with schema vault;

create table public.user_dashboard_settings (
  owner_key text primary key,
  reportportal_api_url text not null,
  testrail_base_url text,
  default_project text not null,
  default_launch_name text not null,
  default_team text not null,
  default_history_depth integer not null check (default_history_depth between 1 and 30),
  secret_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cypress_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  name text not null,
  is_default boolean not null default false,
  secret_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index cypress_profiles_owner_name_idx
  on public.cypress_profiles (owner_key, lower(name));
create unique index cypress_profiles_one_default_idx
  on public.cypress_profiles (owner_key) where is_default;
create index cypress_profiles_owner_idx on public.cypress_profiles (owner_key, created_at);

create table public.cypress_run_profiles (
  request_id uuid primary key references public.cypress_runs(request_id) on delete cascade,
  secret_id uuid not null,
  expires_at timestamptz not null,
  retrieved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.cypress_runs
  add column if not exists profile_id uuid,
  add column if not exists profile_name text,
  add column if not exists owner_key text;

create index if not exists cypress_runs_owner_created_at_idx
  on public.cypress_runs (owner_key, created_at desc);

alter table public.user_dashboard_settings enable row level security;
alter table public.cypress_profiles enable row level security;
alter table public.cypress_run_profiles enable row level security;

revoke all on public.user_dashboard_settings from anon, authenticated;
revoke all on public.cypress_profiles from anon, authenticated;
revoke all on public.cypress_run_profiles from anon, authenticated;
grant all on public.user_dashboard_settings to service_role;
grant all on public.cypress_profiles to service_role;
grant all on public.cypress_run_profiles to service_role;

create or replace function public.app_secret_create(secret_value text, secret_name text, secret_description text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select vault.create_secret(secret_value, secret_name, secret_description);
$$;

create or replace function public.app_secret_update(secret_identifier uuid, secret_value text)
returns void
language sql
security definer
set search_path = ''
as $$
  select vault.update_secret(secret_identifier, secret_value);
$$;

create or replace function public.app_secret_read(secret_identifier uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where id = secret_identifier;
$$;

create or replace function public.app_secret_delete(secret_identifier uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from vault.secrets where id = secret_identifier;
$$;

create or replace function public.claim_cypress_run_profile(run_request_id uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  update public.cypress_run_profiles
  set retrieved_at = now()
  where request_id = run_request_id
    and retrieved_at is null
    and expires_at > now()
  returning secret_id;
$$;

revoke all on function public.app_secret_create(text, text, text) from public, anon, authenticated;
revoke all on function public.app_secret_update(uuid, text) from public, anon, authenticated;
revoke all on function public.app_secret_read(uuid) from public, anon, authenticated;
revoke all on function public.app_secret_delete(uuid) from public, anon, authenticated;
revoke all on function public.claim_cypress_run_profile(uuid) from public, anon, authenticated;
grant execute on function public.app_secret_create(text, text, text) to service_role;
grant execute on function public.app_secret_update(uuid, text) to service_role;
grant execute on function public.app_secret_read(uuid) to service_role;
grant execute on function public.app_secret_delete(uuid) to service_role;
grant execute on function public.claim_cypress_run_profile(uuid) to service_role;

comment on table public.user_dashboard_settings is
  'Server-only user ReportPortal/TestRail settings. API credentials are stored in Supabase Vault.';
comment on table public.cypress_profiles is
  'Server-only named Cypress environment profiles. Environment contents are stored in Supabase Vault.';
comment on table public.cypress_run_profiles is
  'Short-lived one-time Vault snapshots consumed by the selected-specs workflow.';
