-- T04 review fixes (PR #94): the acceptance snapshot and the manual-copy
-- marker of an order live as JSON objects in bucket contract-documents next
-- to its PDFs (docs/musteri-yonetimi.md "Sözleşme belgeleri (T04)"):
--   {org_id}/{order_id}/acceptance-{sha256}.json  what the customer accepted
--   {org_id}/{order_id}/manual-copy.json          the order needs a manual copy
-- Only the contract-documents Edge Function writes them, with the service
-- role. They inherit the bucket's rules: private, read by the order's
-- customer and the org's ops (contract_documents_select), never changed or
-- removed (contract_documents_immutable). They are never registered:
-- service_register_contract_document accepts only {kind}.pdf paths.
--
-- No new table, so no demo guard: the demo account is refused by the Edge
-- Function and never gets documents.

update storage.buckets
set allowed_mime_types = array['application/pdf', 'application/json']
where id = 'contract-documents';
