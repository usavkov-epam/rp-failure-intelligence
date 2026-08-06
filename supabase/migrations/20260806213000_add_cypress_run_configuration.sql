alter table public.cypress_runs
  add column if not exists environment text,
  add column if not exists cypress_config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(cypress_config) = 'object');

comment on column public.cypress_runs.environment is
  'Allowlisted environments.js profile selected for the workflow run; null uses the secret-configured default.';

comment on column public.cypress_runs.cypress_config is
  'Validated, non-secret Cypress configuration overrides supplied by the dashboard.';
