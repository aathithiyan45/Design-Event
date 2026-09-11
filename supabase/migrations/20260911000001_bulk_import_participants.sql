-- Migration: 20260911000001_bulk_import_participants.sql
-- Purpose: Add secure stored procedure for bulk importing valid participants without overwriting pre-existing participant records or session locks.

create or replace function public.bulk_import_participants(p_participants jsonb)
returns jsonb security definer as $$
declare
  v_item jsonb;
  v_roll text;
  v_name text;
  v_year integer;
  v_roll_num integer;
  v_email text;
  v_uuid uuid;
  v_pw text;
  v_imported integer := 0;
  v_skipped integer := 0;
begin
  -- 1. Authenticated Admin check
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Access denied: Must be logged in as an administrator.');
  end if;

  if not exists (select 1 from public.admins where id = auth.uid()) then
    return jsonb_build_object('success', false, 'error', 'Access denied: User is not registered as an administrator.');
  end if;

  -- 2. Validate JSON input
  if jsonb_typeof(p_participants) != 'array' then
    return jsonb_build_object('success', false, 'error', 'Invalid input format: Expected JSON array.');
  end if;

  -- 3. Iterate over valid participant records
  for v_item in select * from jsonb_array_elements(p_participants) loop
    v_roll := upper(trim(coalesce(v_item->>'roll_number', '')));
    v_name := trim(coalesce(v_item->>'name', ''));
    v_year := coalesce((v_item->>'year')::integer, 2);

    -- Skip invalid or empty entries
    if v_roll = '' or v_name = '' then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    begin
      v_roll_num := v_roll::integer;
    exception when others then
      v_skipped := v_skipped + 1;
      continue;
    end;

    -- Range validation (274001–274070 or 284001–284070)
    if not ((v_roll_num >= 274001 and v_roll_num <= 274070) or (v_roll_num >= 284001 and v_roll_num <= 284070)) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Check if participant already exists in public.participants (do not overwrite!)
    if exists (select 1 from public.participants where upper(roll_number) = v_roll) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_email := lower(v_roll) || '@design-event.com';
    v_pw := 'Pass_' || v_roll || '_Fest2026!';

    -- Find or create auth user
    select id into v_uuid from auth.users where lower(email) = v_email;

    if v_uuid is null then
      v_uuid := gen_random_uuid();
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at
      ) values (
        v_uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        v_email, crypt(v_pw, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb,
        '{}'::jsonb, false, now(), now()
      );
    end if;

    -- Ensure identity exists
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_uuid, jsonb_build_object('sub', v_uuid::text, 'email', v_email),
      'email', v_uuid::text, now(), now(), now()
    ) on conflict (provider_id, provider) do nothing;

    -- Insert participant record with status 'pending'
    insert into public.participants (
      id, roll_number, name, year, status, created_at
    ) values (
      v_uuid, v_roll, v_name, v_year, 'pending', now()
    ) on conflict (roll_number) do nothing;

    v_imported := v_imported + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'imported', v_imported,
    'skipped', v_skipped
  );
exception when others then
  return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$$ language plpgsql;

grant execute on function public.bulk_import_participants(jsonb) to authenticated;
