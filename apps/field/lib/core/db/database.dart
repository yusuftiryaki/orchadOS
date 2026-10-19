import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'database.g.dart';

// Local, offline store of the field app.
//
// Tables follow docs/veri-modeli.md so that sync can map rows one to one:
// [Sessions] → Session, [Captures] → Capture (close-up photo),
// [Measurements] → Measurement with source `staff`. [SessionEvents] are the
// phone-side copy of what was sent to the logger (corner, qr_sync, …).
// Every insert is paired with an [OutboxEntries] row in the same transaction.

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

  /// `recording`, `stopped` or `closed` (visit summary confirmed).
  TextColumn get status => text()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Events the phone sent to the logger (or recorded locally).
@DataClassName('SessionEventRow')
class SessionEvents extends Table {
  TextColumn get id => text()();
  TextColumn get sessionId => text().references(Sessions, #id)();

  /// `session_start`, `session_stop`, `corner`, `qr_sync`.
  TextColumn get eventType => text()();
  TextColumn get payload => text()();
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

  /// `closeup_photo`.
  TextColumn get kind => text()();

  /// `phone_camera`.
  TextColumn get sensor => text()();
  TextColumn get mediaType => text()();
  IntColumn get byteSize => integer()();
  TextColumn get localPath => text()();

  /// Subject: `tree` and the tree id; slot code kept for the field crew.
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
  BoolColumn get valueBool => boolean().nullable()();
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

/// Records waiting to be uploaded. Sync itself comes later.
@DataClassName('OutboxEntry')
class OutboxEntries extends Table {
  IntColumn get id => integer().autoIncrement()();

  /// `session`, `session_event`, `capture`, `measurement`.
  TextColumn get entityType => text()();
  TextColumn get entityId => text()();
  DateTimeColumn get createdAt => dateTime()();
  IntColumn get attempts => integer().withDefault(const Constant(0))();
  TextColumn get lastError => text().nullable()();
  DateTimeColumn get lastAttemptAt => dateTime().nullable()();
  DateTimeColumn get sentAt => dateTime().nullable()();
}

@DriftDatabase(
  tables: [Sessions, SessionEvents, Captures, Measurements, OutboxEntries],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase(super.e);

  /// On-device database file `orchados_field.sqlite`.
  factory AppDatabase.open() =>
      AppDatabase(driftDatabase(name: 'orchados_field'));

  @override
  int get schemaVersion => 2;

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
    },
    beforeOpen: (details) async {
      await customStatement('PRAGMA foreign_keys = ON');
    },
  );
}
