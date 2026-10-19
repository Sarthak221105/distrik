-- Map coordinates for the market map and catalogue confirmation.

-- Plain lat/lng next to the PostGIS point so clients never parse WKB.
alter table public.prospects
  add column lat double precision generated always as (extensions.st_y(geo::extensions.geometry)) stored,
  add column lng double precision generated always as (extensions.st_x(geo::extensions.geometry)) stored;

-- The manufacturer confirmed every extracted field; queue chunking and
-- embedding of the document's knowledge into the Product Brain.
create or replace function public.confirm_document(p_document uuid, p_approved_for_sharing boolean default true)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_doc public.documents%rowtype;
begin
  select * into v_doc from public.documents where id = p_document for update;
  if not found or v_doc.manufacturer_id is distinct from public.auth_mid() then
    perform public.app_error('not_found', 'Document not found', 'document_id');
  end if;
  if not public.is_manager() then
    perform public.app_error('forbidden', 'Only an owner or sales head can confirm documents', null);
  end if;
  update public.documents
  set status = 'indexing', approved_for_sharing = p_approved_for_sharing
  where id = p_document;
  perform pgmq.send('embeddings', jsonb_build_object('document_id', p_document, 'manufacturer_id', v_doc.manufacturer_id));
  perform public.write_audit(v_doc.manufacturer_id, 'confirm_document', 'document', p_document,
    jsonb_build_object('approved_for_sharing', p_approved_for_sharing));
end
$$;

revoke execute on function public.confirm_document(uuid, boolean) from public, anon;
grant execute on function public.confirm_document(uuid, boolean) to authenticated, service_role;
