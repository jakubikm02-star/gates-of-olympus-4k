-- SMRŤ EGA: replacement key for a live award (the winner's 4KA device lost its pairing key). NOT auto-applied.
-- Same winner, same slot, draw untouched: new key encrypted like ego_admin_code, 28 days from now, unrevealed again.

create or replace function public.ego_admin_replace(p_award bigint, p_code text) returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare
  k text := ego_key();
  a public.ego_award;
begin
  if k is null then return jsonb_build_object('ok', false, 'error', 'vault_key_missing'); end if;
  if p_code is null or length(btrim(p_code)) < 4 or length(p_code) > 64 then return jsonb_build_object('ok', false, 'error', 'code'); end if;
  select * into a from ego_award where id = p_award and status = 'awarded' for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'award'); end if;
  update ego_award set code_enc = extensions.pgp_sym_encrypt(btrim(p_code), k), expires_at = ego_plus28(now()), revealed_at = null
    where id = a.id returning * into a;
  return jsonb_build_object('ok', true, 'award', a.id, 'nick', a.nick, 'slot', a.slot, 'expires_at', a.expires_at,
    'length', length(btrim(p_code)));
end;
$$;

revoke all on function public.ego_admin_replace(bigint, text) from public, anon, authenticated;
grant execute on function public.ego_admin_replace(bigint, text) to service_role;
