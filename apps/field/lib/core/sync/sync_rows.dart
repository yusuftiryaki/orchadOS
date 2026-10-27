import 'dart:convert';

import 'package:uuid/uuid.dart';

import '../db/database.dart';
import '../db/field_repository.dart' show appVersion;
import '../time/gps_time.dart';

// Local rows → server rows (docs/arayuzler.md, "Saha uygulaması ve
// veritabanı"). Pure functions; the SyncWorker adds org and lookups.

/// Namespace of the capture ids derived on the phone (uuid v5).
const String captureIdNamespace = '3b8f2c1e-6d4a-4f0b-9e2c-7a5d1c8b4e60';

/// Server id of a close-up photo. Captures are keyed by content hash on the
/// phone; the server row gets a uuid derived from session and hash, so a
/// resend has the same id.
String captureId(String sessionId, String sha256) =>
    const Uuid().v5(captureIdNamespace, '$sessionId/$sha256');

/// Object name in the media bucket (docs/arayuzler.md, "Medya depolama").
String mediaObjectPath({
  required String orgId,
  required String parcelId,
  required String sha256,
}) => 'org/$orgId/parcel/$parcelId/$sha256';

String mediaUri(String objectPath) => 'storage://media/$objectPath';

/// UTC instant of a GPS time; this is what the server's timestamps hold.
String _utc(int gpsMs) => gpsMsToUtc(gpsMs).toIso8601String();

/// Local session statuses after which the recording is over.
const _recordedStatuses = {'stopped', 'closed'};

/// Server statuses the field app may still write over. A visit already
/// processed, in review or published is left as it is.
const visitWritableStatuses = ['planned', 'captured'];

/// Values written to the planned visit (`public.session`). The visit itself
/// is created by ops; field staff only reports what happened. The visit's
/// audit methodology is set by ops too: the app's own protocol version
/// (`field-v0`) goes with each measurement (`method_version`), never here.
Map<String, Object?> visitUpdate(
  SessionRow s, {
  Map<String, Object?>? weather,
}) => {
  if (weather != null && weather.isNotEmpty) 'weather': weather,
  'started_at': s.startGpsTimeMs != null
      ? _utc(s.startGpsTimeMs!)
      : s.startedAt.toUtc().toIso8601String(),
  if (_recordedStatuses.contains(s.status)) ...{
    'status': 'captured',
    'ended_at': s.stopGpsTimeMs != null
        ? _utc(s.stopGpsTimeMs!)
        : s.stoppedAt?.toUtc().toIso8601String(),
  },
};

/// `public.session_event` row.
Map<String, Object?> sessionEventRow(
  SessionEventRow e, {
  required String orgId,
  required String parcelId,
}) => {
  'id': e.id,
  'org_id': orgId,
  'parcel_id': parcelId,
  'session_id': e.sessionId,
  'event_type': e.eventType,
  'payload': e.payload,
  'gps_time_ns': e.gpsTimeMs * 1000000,
  'time_source': e.timeSource,
  'phone_time': e.phoneTime.toUtc().toIso8601String(),
  'logger_result': e.loggerResult,
  if (e.dataJson != null) 'data': jsonDecode(e.dataJson!),
};

/// `public.capture` row of a close-up photo. Phone-side details without a
/// column of their own go to `metadata`.
Map<String, Object?> captureRow(
  CaptureRow c, {
  required String orgId,
  required String parcelId,
}) {
  final path = mediaObjectPath(
    orgId: orgId,
    parcelId: parcelId,
    sha256: c.sha256,
  );
  return {
    'id': captureId(c.sessionId, c.sha256),
    'org_id': orgId,
    'parcel_id': parcelId,
    'session_id': c.sessionId,
    'kind': c.kind == 'audio_note' ? 'audio_note' : 'photo',
    if (c.subjectType == 'tree') 'tree_id': c.subjectId,
    'uri': mediaUri(path),
    'content_hash': c.sha256,
    'byte_size': c.byteSize,
    'mime_type': c.mediaType,
    'started_at': _utc(c.gpsTimeMs),
    'metadata': {
      'source': 'field_app',
      'app_version': appVersion,
      'local_kind': c.kind,
      'sensor': c.sensor,
      'shot_code': c.shotCode,
      'slot_code': c.slotCode,
      if (c.subjectType == 'slot') 'slot_id': c.subjectId,
      if (c.subjectType == 'corner') 'corner_event_id': c.subjectId,
      'gps_time_ns': c.gpsTimeMs * 1000000,
      'time_source': c.timeSource,
      'phone_time': c.capturedAt.toUtc().toIso8601String(),
      if (c.qcVerdict != null)
        'quality': {
          'verdict': c.qcVerdict,
          'version': c.qcVersion,
          'sharpness': c.qcSharpness,
          'brightness': c.qcBrightness,
          'dark_ratio': c.qcDarkRatio,
          'bright_ratio': c.qcBrightRatio,
          'findings': [
            for (final f in (c.qcFindings ?? '').split(','))
              if (f.isNotEmpty) f,
          ],
        },
    },
  };
}

/// `public.measurement` row of a staff answer. Yes/no answers go to
/// `value_boolean`.
Map<String, Object?> measurementRow(
  MeasurementRow m, {
  required String orgId,
  required String parcelId,
  required String metricDefinitionId,
}) => {
  'id': m.id,
  'org_id': orgId,
  'parcel_id': parcelId,
  if (m.subjectType == 'tree') 'tree_id': m.subjectId,
  'metric_definition_id': metricDefinitionId,
  if (m.valueBoolean != null) 'value_boolean': m.valueBoolean,
  if (m.valueNum != null) 'value_numeric': m.valueNum,
  if (m.valueText != null) 'value_category': m.valueText,
  if (m.unit != null) 'unit': m.unit,
  if (m.uncertainty != null) 'uncertainty': m.uncertainty,
  'method': m.method,
  'method_version': m.methodVersion,
  'source': m.source,
  'session_id': m.sessionId,
  'measured_at': m.measuredAt.toUtc().toIso8601String(),
};

/// Arguments of `record_verification_result` (docs/arayuzler.md,
/// "Doğrulama kalemleri"). The photo is the capture uploaded before it.
Map<String, Object?> verificationResultParams(VerificationResultRow r) => {
  'p_item_id': r.itemId,
  'p_tree_present': r.treePresent,
  'p_note': r.note,
  'p_closeup_capture_id': r.captureSha256 == null
      ? null
      : captureId(r.tourId, r.captureSha256!),
};

/// Arguments of `save_parcel_route` (docs/arayuzler.md, "Grid rotası").
Map<String, Object?> parcelRouteParams(ParcelRouteRow r) => {
  'p_id': r.id,
  'p_parcel_id': r.parcelId,
  'p_session_id': r.sessionId,
  'p_route': jsonDecode(r.routeJson),
  'p_content_hash': r.contentHash,
};
