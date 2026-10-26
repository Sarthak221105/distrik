-- Enables email channel by default for notifications so manufacturers receive
-- transactional email alerts along with in-app notifications.

create or replace function public.notify_users(
  p_manufacturer uuid,
  p_user_ids uuid[],
  p_kind text,
  p_title text,
  p_body text,
  p_link text,
  p_dedupe_key text default null,
  p_channels text[] default '{in_app, email}',
  p_data jsonb default '{}'::jsonb
)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count integer := 0;
  v_user uuid;
begin
  if p_user_ids is null then
    return 0;
  end if;
  foreach v_user in array p_user_ids loop
    insert into public.notifications (manufacturer_id, user_id, kind, title, body, link, dedupe_key, channels, data)
    values (p_manufacturer, v_user, p_kind, p_title, p_body, p_link, p_dedupe_key, p_channels, coalesce(p_data, '{}'::jsonb))
    on conflict (user_id, dedupe_key) do nothing
    returning id into v_id;
    if v_id is not null then
      v_count := v_count + 1;
      if p_channels && array['push', 'email'] then
        perform pgmq.send('notifications', jsonb_build_object('notification_id', v_id));
      end if;
    end if;
    v_id := null;
  end loop;
  return v_count;
end
$$;
