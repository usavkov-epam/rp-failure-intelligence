create extension if not exists pg_cron;

create or replace function public.consume_cypress_run_profile(run_request_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret_identifier uuid;
  secret_value text;
begin
  delete from public.cypress_run_profiles
  where request_id = run_request_id
    and retrieved_at is null
    and expires_at > now()
  returning secret_id into secret_identifier;

  if secret_identifier is null then
    return null;
  end if;

  select decrypted_secret
  into secret_value
  from vault.decrypted_secrets
  where id = secret_identifier;

  if secret_value is null then
    raise exception 'Cypress run profile secret is unavailable';
  end if;

  delete from vault.secrets where id = secret_identifier;
  return secret_value;
end;
$$;

create or replace function public.purge_expired_cypress_run_profiles()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_secret_ids uuid[];
begin
  with expired as (
    delete from public.cypress_run_profiles
    where expires_at <= now()
    returning secret_id
  )
  select coalesce(array_agg(secret_id), '{}'::uuid[])
  into expired_secret_ids
  from expired;

  delete from vault.secrets
  where id = any(expired_secret_ids);

  return cardinality(expired_secret_ids);
end;
$$;

revoke all on function public.consume_cypress_run_profile(uuid) from public, anon, authenticated;
revoke all on function public.purge_expired_cypress_run_profiles() from public, anon, authenticated;
grant execute on function public.consume_cypress_run_profile(uuid) to service_role;
grant execute on function public.purge_expired_cypress_run_profiles() to service_role;

select cron.schedule(
  'purge-expired-cypress-run-profiles',
  '*/15 * * * *',
  'select public.purge_expired_cypress_run_profiles()'
);

comment on function public.consume_cypress_run_profile(uuid) is
  'Atomically returns and deletes one unexpired Cypress run profile and its Vault secret.';
comment on function public.purge_expired_cypress_run_profiles() is
  'Deletes expired Cypress run profile rows and their Vault secrets.';
