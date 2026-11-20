import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'database.g.dart';

// Local, offline store of the field app.
//
// Tables follow docs/veri-modeli.md so that sync can map rows one to one:
// [Sessions] → Session, [Captures] → Capture (close-up photo),
// [Measurements] → Measurement with source `staff`. [SessionEvents] are the
// phone-side copy of what was sent to the logger (corner, qr_sync, …) and
// of the boundary edits and coverage. [VerificationResults] are what the
// crew found at the items of a verification tour.
// Every insert is paired with an [OutboxEntries] row in the same transaction;
// the SyncWorker (core/sync) uploads them in that order.

/// A field session (a "visit" in MVP terms; `session_type = scan`).
@DataClassName('SessionRow')
class Sessions extends Table {
  /// UUID; also the logger's `session_id` (folder name on the SD card).
  TextColumn get id => text()();
  TextColumn get parcelId => text()();
  TextColumn get taskId => text().nullable()();

  /// Session type in the target model: `scan` for kit sessions.
  TextColumn get sessionType => text()();

  /// `inventory` or `periodic`.
  TextColumn get visitKind => text()();
  TextColumn get season => text().nullable()();

  /// Auth user id of the field operator (no name or phone here).
  TextColumn get operatorId => text().nullable()();
  TextColumn get methodologyVersion => text()();
  TextColumn get appVersion => text()();

  /// Logger device name and firmware version.
  TextColumn get loggerName => text().nullable()();
  TextColumn get loggerFirmware => text().nullable()();
  DateTimeColumn get startedAt => dateTime()();
  IntColumn get startGpsTimeMs => integer().nullable()();
  DateTimeColumn get stoppedAt => dateTime().nullable()();
  IntColumn get stopGpsTimeMs => integer().nullable()();

  /// `recording`, `stopped` or `closed` (visit summary confirmed); `blocked`
  /// when the visit could not be done and nothing was recorded (local only,
  /// never sent as a visit update).
  TextColumn get status => text()();

  /// How the scan was done (schema 6): `walk` (hand cart;
  /// backpack pole on older rows), `atv` or `robot` (`motorcycle` on older
  /// rows); `public.session.scan_platform`. Null on
  /// verification tours and on rows from before schema 6.
  TextColumn get scanPlatform => text().nullable()();

  /// Measured camera height, lens to ground, in metres (0.50–3.50,
  /// two decimals); `public.session.camera_height_m`.
  RealColumn get cameraHeightM => real().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Events the phone sent to the logger (or recorded locally).
@DataClassName('SessionEventRow')
class SessionEvents extends Table {
  TextColumn get id => text()();
  TextColumn get sessionId => text().references(Sessions, #id)();

  /// `session_start`, `session_stop`, `corner`, `qr_sync`,
  /// `boundary_corners`, `coverage`, `route`, `route_progress`, the legal
  /// field records `field_notice_*`, `visit_blocked`, `boundary_pointer`
  /// (docs/arayuzler.md, "Saha olayları").
  TextColumn get eventType => text()();
  TextColumn get payload => text()();

  /// Structured details as a JSON object (`session_event.data`, schema 4):
  /// corner position and quality, boundary edits, coverage. Null when none.
  TextColumn get dataJson => text().nullable()();
  DateTimeColumn get phoneTime => dateTime()();
  IntColumn get gpsTimeMs => integer()();

  /// `gps` or `phone` (see TimeSource).
  TextColumn get timeSource => text()();

  /// Logger's answer (CommandResult name).
  TextColumn get loggerResult => text()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Raw media recorded on the phone. Immutable; addressed by content hash.
@DataClassName('CaptureRow')
class Captures extends Table {
  /// SHA-256 of the file bytes (hex), computed when the photo is taken.
  TextColumn get sha256 => text()();
  TextColumn get sessionId => text().references(Sessions, #id)();

  /// `closeup_photo`, `audio_note`, `boundary_photo`, `verification_photo`,
  /// `blocked_visit_photo`.
  TextColumn get kind => text()();

  /// `phone_camera`.
  TextColumn get sensor => text()();
  TextColumn get mediaType => text()();
  IntColumn get byteSize => integer()();
  TextColumn get localPath => text()();

  /// Subject: `tree` and the tree id; slot code kept for the field crew.
  /// Also `slot`, `corner` (its event) and `event` (a `visit_blocked`).
  TextColumn get subjectType => text()();
  TextColumn get subjectId => text()();
  TextColumn get slotCode => text().nullable()();

  /// Which "shoot like this" slot the photo fills (e.g. `trunk`).
  TextColumn get shotCode => text()();
  DateTimeColumn get capturedAt => dateTime()();
  IntColumn get gpsTimeMs => integer()();

  /// `gps` or `phone`: whether [gpsTimeMs] came from the logger's GPS time
  /// or from the phone clock alone.
  TextColumn get timeSource => text()();

  /// On-device quality check (schema 2; null on rows from schema 1).
  /// `accept` or `warn`; rejected photos are never stored.
  TextColumn get qcVerdict => text().nullable()();

  /// Version of the check and its thresholds (`photo-qc-v1`).
  TextColumn get qcVersion => text().nullable()();

  /// Variance of the Laplacian, mean luminance (0–255) and clipped pixel
  /// shares (0–1) on the downscaled photo.
  RealColumn get qcSharpness => real().nullable()();
  RealColumn get qcBrightness => real().nullable()();
  RealColumn get qcDarkRatio => real().nullable()();
  RealColumn get qcBrightRatio => real().nullable()();

  /// Warnings the crew accepted, e.g. `blurry:warn`; empty when none.
  TextColumn get qcFindings => text().nullable()();

  @override
  Set<Column> get primaryKey => {sha256};
}

/// Observations by field staff (yes/no questions).
@DataClassName('MeasurementRow')
class Measurements extends Table {
  TextColumn get id => text()();
  TextColumn get sessionId => text().references(Sessions, #id)();
  TextColumn get subjectType => text()();
  TextColumn get subjectId => text()();
  TextColumn get metricCode => text()();

  /// Yes/no answer; `measurement.value_boolean` on the server (schema 3
  /// renamed it from `value_bool`).
  BoolColumn get valueBoolean => boolean().nullable()();
  RealColumn get valueNum => real().nullable()();
  TextColumn get valueText => text().nullable()();
  TextColumn get unit => text().nullable()();

  /// Numeric uncertainty; null for categorical staff answers.
  RealColumn get uncertainty => real().nullable()();

  /// `field_question` and the question set version.
  TextColumn get method => text()();
  TextColumn get methodVersion => text()();

  /// Always `staff` in this app.
  TextColumn get source => text()();
  DateTimeColumn get measuredAt => dateTime()();

  /// JSON array of capture hashes shown as evidence.
  TextColumn get evidenceJson => text()();

  @override
  Set<Column> get primaryKey => {id};
}

/// What the crew found at a verification item (schema 4). A second result
/// for the same item is a new row; the newest one sent counts on the server.
@DataClassName('VerificationResultRow')
class VerificationResults extends Table {
  TextColumn get id => text()();

  /// The tour (`verification` session); also the photo's session.
  TextColumn get tourId => text().references(Sessions, #id)();
  TextColumn get itemId => text()();
  TextColumn get slotCode => text()();
  BoolColumn get treePresent => boolean()();
  TextColumn get note => text().nullable()();

  /// Close-up photo (`captures.sha256`), optional.
  TextColumn get captureSha256 => text().nullable()();
  DateTimeColumn get recordedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Records waiting to be uploaded, oldest first (see Outbox).
@DataClassName('OutboxEntry')
class OutboxEntries extends Table {
  IntColumn get id => integer().autoIncrement()();

  /// `session`, `session_event`, `capture`, `measurement`,
  /// `verification_result`, `parcel_route`.
  TextColumn get entityType => text()();
  TextColumn get entityId => text()();
  DateTimeColumn get createdAt => dateTime()();
  IntColumn get attempts => integer().withDefault(const Constant(0))();
  TextColumn get lastError => text().nullable()();
  DateTimeColumn get lastAttemptAt => dateTime().nullable()();
  DateTimeColumn get sentAt => dateTime().nullable()();

  /// Set when the server refused the record for good (permission,
  /// validation); [lastError] keeps the reason. Not retried automatically.
  DateTimeColumn get failedAt => dateTime().nullable()();
}

/// Grid routes made on this phone (schema 5), one row per route version
/// of a parcel (`public.parcel_route`). Kept so that a second visit before
/// the upload reuses the same route.
@DataClassName('ParcelRouteRow')
class ParcelRoutes extends Table {
  /// uuid v5 of `<parcel>/<content hash>` (route_store.dart).
  TextColumn get id => text()();
  TextColumn get parcelId => text()();

  /// Version guessed on the phone; replaced by the server's after upload.
  IntColumn get version => integer()();
  TextColumn get contentHash => text()();
  TextColumn get generator => text()();

  /// `inventory` or `boundary`.
  TextColumn get basis => text()();

  /// GridRoute.toJson().
  TextColumn get routeJson => text()();

  /// The visit that first used it.
  TextColumn get sessionId => text().references(Sessions, #id)();
  DateTimeColumn get createdAt => dateTime()();

  /// The server stored it (and [version] is the server's).
  BoolColumn get synced => boolean().withDefault(const Constant(false))();

  @override
  Set<Column> get primaryKey => {id};
}

/// Last task list downloaded for a user, for offline use (schema 3).
@DataClassName('TaskCacheRow')
class TaskCache extends Table {
  TextColumn get userId => text()();

  /// JSON array of FieldTask.toJson().
  TextColumn get tasksJson => text()();
  DateTimeColumn get fetchedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {userId};
}

@DriftDatabase(
  tables: [
    Sessions,
    SessionEvents,
    Captures,
    Measurements,
    OutboxEntries,
    TaskCache,
    VerificationResults,
    ParcelRoutes,
  ],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase(super.e);

  /// On-device database file `orchados_field.sqlite`.
  factory AppDatabase.open() =>
      AppDatabase(driftDatabase(name: 'orchados_field'));

  @override
  int get schemaVersion => 6;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onUpgrade: (m, from, to) async {
      if (from < 2) {
        // Photo quality check (İP6).
        await m.addColumn(captures, captures.qcVerdict);
        await m.addColumn(captures, captures.qcVersion);
        await m.addColumn(captures, captures.qcSharpness);
        await m.addColumn(captures, captures.qcBrightness);
        await m.addColumn(captures, captures.qcDarkRatio);
        await m.addColumn(captures, captures.qcBrightRatio);
        await m.addColumn(captures, captures.qcFindings);
      }
      if (from < 3) {
        // Sync (İP6): same name as the server column, permanent failures,
        // offline task list.
        await m.renameColumn(
          measurements,
          'value_bool',
          measurements.valueBoolean,
        );
        await m.addColumn(outboxEntries, outboxEntries.failedAt);
        await m.createTable(taskCache);
      }
      if (from < 4) {
        // Inventory in the field (İP6): corner and coverage details,
        // verification tour results.
        await m.addColumn(sessionEvents, sessionEvents.dataJson);
        await m.createTable(verificationResults);
      }
      if (from < 5) {
        // Grid route (İP6): the routes made on this phone.
        await m.createTable(parcelRoutes);
      }
      if (from < 6) {
        // Scan platform and camera height from the pre-check.
        await m.addColumn(sessions, sessions.scanPlatform);
        await m.addColumn(sessions, sessions.cameraHeightM);
      }
    },
    beforeOpen: (details) async {
      await customStatement('PRAGMA foreign_keys = ON');
    },
  );
}
