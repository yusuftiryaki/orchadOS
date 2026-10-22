-- capture.uri of raw files: the raw store's address when the session was pulled
-- from it, station:// otherwise (docs/arayuzler.md, "Ham kayıtların adresi").
comment on column public.capture.uri is
  'Where the file lives. In the media bucket: storage://media/org/<org_id>/parcel/<parcel_id>/<content_hash>. '
  'Raw files pulled from the raw store: s3://<bucket>/<key>, az://<container>/<key> or file://<path> '
  '(key raw/<org_id>/<parcel_id>/<session_id>/<path>); raw files of a local folder: station://<station>/<path>.';
