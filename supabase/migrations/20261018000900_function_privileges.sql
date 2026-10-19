-- Function privileges. Postgres grants EXECUTE to PUBLIC by default, which
-- would let a browser call internal helpers (set_stage_internal,
-- notify_users, ingest_inbound_message...) directly. Revoke everything, then
-- grant the client facing RPC surface (PRD 12) explicitly. Internal helpers
-- still run inside security definer RPCs as their owner.

revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

-- Helpers used inside RLS policies and views (evaluated as the caller).
grant execute on function
  public.jwt_claims(),
  public.auth_mid(),
  public.auth_role(),
  public.is_ops(),
  public.is_trusted(),
  public.is_manager(),
  public.rep_can_see(uuid),
  public.rep_can_see_conversation(uuid),
  public.app_error(text, text, text),
  public.gst_state_code(text),
  public.normalize_phone_e164(text),
  public.normalize_business_name(text)
to authenticated;

-- Client facing RPCs. Each one checks tenant and role itself.
grant execute on function
  public.evaluate_offer(uuid, integer, bigint),
  public.set_consent(uuid, public.consent_status, text, jsonb, public.channel),
  public.send_human_message(uuid, text, text, uuid),
  public.mark_conversation_read(uuid),
  public.set_stage(uuid, public.prospect_stage, text, timestamptz, text),
  public.log_prospect_event(uuid, text, text, jsonb, timestamptz, text),
  public.log_qualification_field(uuid, text, text),
  public.pause_ai(uuid, text),
  public.resume_ai(uuid),
  public.decide_approval(uuid, text, bigint, text),
  public.create_quotation(uuid, jsonb, bigint, text, text),
  public.register_purchase_order(uuid, text, text, uuid, uuid),
  public.match_purchase_order(uuid),
  public.confirm_order(uuid, text),
  public.update_order_status(uuid, public.shipment_status, public.payment_status, text, text, text),
  public.dismiss_reorder(uuid),
  public.schedule_followup(uuid, timestamptz, text, text),
  public.create_campaign(text, uuid[], text, text, text, integer, jsonb, text),
  public.approve_prospects(uuid[], text, text),
  public.approve_outreach(uuid[], uuid),
  public.launch_campaign(uuid, numeric),
  public.update_fit_weights(jsonb),
  public.ops_import_raw_records(uuid, jsonb),
  public.ops_update_prospect(uuid, jsonb),
  public.resolve_merge_candidate(uuid, boolean),
  public.normalize_campaign_records(uuid),
  public.ops_queue_metrics(),
  public.ops_dead_letters(integer),
  public.ops_retry_dead_letter(text, bigint),
  public.erase_contact(uuid, text)
to authenticated;

-- The auth hook is callable only by the auth server.
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public, service_role;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
