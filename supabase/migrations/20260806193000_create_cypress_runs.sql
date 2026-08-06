create table public.cypress_runs (
  request_id uuid primary key,
  requested_by text not null,
  specs jsonb not null check (jsonb_typeof(specs) = 'array'),
  runs integer not null check (runs between 1 and 20),
  threads integer not null check (threads between 1 and 4),
  browser text not null check (browser in ('chrome', 'electron')),
  timeout_seconds integer not null check (timeout_seconds between 60 and 1200),
  status text not null default 'queued' check (status in ('queued', 'in_progress', 'completed')),
  conclusion text,
  github_run_id bigint unique,
  github_run_number integer,
  actions_url text not null,
  started_at timestamptz,
  completed_at timestamptz,
  artifact_names jsonb not null default '[]'::jsonb check (jsonb_typeof(artifact_names) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cypress_runs_requested_by_created_at_idx
  on public.cypress_runs (lower(requested_by), created_at desc);

alter table public.cypress_runs enable row level security;

comment on table public.cypress_runs is
  'Server-managed Cypress workflow runs. Browser access is denied by RLS; authenticated Next.js routes use the service role.';
