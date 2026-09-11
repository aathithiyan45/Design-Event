-- Migration: 20260911000000_individual_participant_deletion.sql
-- Purpose: Add secure RPC function to delete an individual participant and clean up related submissions, task results, active sessions, and auth user data.

create or replace function public.delete_participant_by_roll(p_roll_number text)
returns jsonb security definer as $$
declare
  v_roll text;
  v_participant record;
  v_user_id uuid;
begin
  -- 1. Authenticated Admin check
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Access denied: Must be logged in as an administrator.');
  end if;

  if not exists (select 1 from public.admins where id = auth.uid()) then
    return jsonb_build_object('success', false, 'error', 'Access denied: User is not registered as an administrator.');
  end if;

  -- 2. Format & find target participant
  v_roll := upper(trim(coalesce(p_roll_number, '')));
  if v_roll = '' then
    return jsonb_build_object('success', false, 'error', 'Register Number is required.');
  end if;

  select * into v_participant
  from public.participants
  where upper(roll_number) = v_roll;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Participant not found with Register Number: ' || v_roll);
  end if;

  v_user_id := v_participant.id;

  -- 3. Delete task results linked to participant's submissions
  delete from public.task_results
  where submission_id in (
    select id from public.submissions where participant_id = v_user_id
  );

  -- 4. Delete participant's submissions
  delete from public.submissions where participant_id = v_user_id;

  -- 5. Delete participant record from public.participants (clears active_session_id, status, score, timers)
  delete from public.participants where id = v_user_id;

  -- 6. Delete auth identities for this user
  delete from auth.identities where user_id = v_user_id;

  -- 7. Delete auth user record
  delete from auth.users where id = v_user_id;

  return jsonb_build_object(
    'success', true,
    'deleted_roll_number', v_roll,
    'deleted_user_id', v_user_id
  );
exception when others then
  return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$$ language plpgsql;

-- Grant execution to authenticated users (internal RPC logic enforces admin verification)
grant execute on function public.delete_participant_by_roll(text) to authenticated;
