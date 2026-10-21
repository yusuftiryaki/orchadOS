import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/core/db/database.dart';

/// Tables of schema 1 as the first field app release created them.
const _schemaV1 = [
  'CREATE TABLE "sessions" ("id" TEXT NOT NULL, "parcel_id" TEXT NOT NULL, '
      '"task_id" TEXT NULL, "session_type" TEXT NOT NULL, '
      '"visit_kind" TEXT NOT NULL, "season" TEXT NULL, '
      '"operator_id" TEXT NULL, "methodology_version" TEXT NOT NULL, '
      '"app_version" TEXT NOT NULL, "logger_name" TEXT NULL, '
      '"logger_firmware" TEXT NULL, "started_at" TEXT NOT NULL, '
      '"start_gps_time_ms" INTEGER NULL, "stopped_at" TEXT NULL, '
      '"stop_gps_time_ms" INTEGER NULL, "status" TEXT NOT NULL, '
      'PRIMARY KEY ("id"))',
  'CREATE TABLE "session_events" ("id" TEXT NOT NULL, '
      '"session_id" TEXT NOT NULL REFERENCES sessions (id), '
      '"event_type" TEXT NOT NULL, "payload" TEXT NOT NULL, '
      '"phone_time" TEXT NOT NULL, "gps_time_ms" INTEGER NOT NULL, '
      '"time_source" TEXT NOT NULL, "logger_result" TEXT NOT NULL, '
      'PRIMARY KEY ("id"))',
  'CREATE TABLE "captures" ("sha256" TEXT NOT NULL, '
      '"session_id" TEXT NOT NULL REFERENCES sessions (id), '
      '"kind" TEXT NOT NULL, "sensor" TEXT NOT NULL, '
      '"media_type" TEXT NOT NULL, "byte_size" INTEGER NOT NULL, '
      '"local_path" TEXT NOT NULL, "subject_type" TEXT NOT NULL, '
      '"subject_id" TEXT NOT NULL, "slot_code" TEXT NULL, '
      '"shot_code" TEXT NOT NULL, "captured_at" TEXT NOT NULL, '
      '"gps_time_ms" INTEGER NOT NULL, "time_source" TEXT NOT NULL, '
      'PRIMARY KEY ("sha256"))',
  'CREATE TABLE "measurements" ("id" TEXT NOT NULL, '
      '"session_id" TEXT NOT NULL REFERENCES sessions (id), '
      '"subject_type" TEXT NOT NULL, "subject_id" TEXT NOT NULL, '
      '"metric_code" TEXT NOT NULL, "value_bool" INTEGER NULL '
      'CHECK ("value_bool" IN (0, 1)), "value_num" REAL NULL, '
      '"value_text" TEXT NULL, "unit" TEXT NULL, "uncertainty" REAL NULL, '
      '"method" TEXT NOT NULL, "method_version" TEXT NOT NULL, '
      '"source" TEXT NOT NULL, "measured_at" TEXT NOT NULL, '
      '"evidence_json" TEXT NOT NULL, PRIMARY KEY ("id"))',
  'CREATE TABLE "outbox_entries" ("id" INTEGER NOT NULL PRIMARY KEY '
      'AUTOINCREMENT, "entity_type" TEXT NOT NULL, '
      '"entity_id" TEXT NOT NULL, "created_at" TEXT NOT NULL, '
      '"attempts" INTEGER NOT NULL DEFAULT 0, "last_error" TEXT NULL, '
      '"last_attempt_at" TEXT NULL, "sent_at" TEXT NULL)',
];

void main() {
  test('schema 1 → 4 keeps old rows: quality columns, value_boolean, outbox', () async {
    final db = AppDatabase(
      NativeDatabase.memory(
        setup: (raw) {
          for (final sql in _schemaV1) {
            raw.execute(sql);
          }
          raw
            ..execute(
              "INSERT INTO sessions VALUES ('s1', 'P-1', NULL, 'scan', "
              "'periodic', 'winter', NULL, 'field-v0', '0.1.0', NULL, NULL, "
              "'2026-12-03T08:30:00.000Z', 1, NULL, NULL, 'recording')",
            )
            ..execute(
              "INSERT INTO captures VALUES ('abc', 's1', 'closeup_photo', "
              "'phone_camera', 'image/jpeg', 3, 'mem://abc', 'tree', 't-1', "
              "'S1-1', 'trunk', '2026-12-03T08:31:00.000Z', 1000, 'phone')",
            )
            ..execute(
              "INSERT INTO measurements VALUES ('m1', 's1', 'tree', 't-1', "
              "'pruned', 1, NULL, NULL, NULL, NULL, 'field_question', "
              "'winter-v0', 'staff', '2026-12-03T08:32:00.000Z', '[\"abc\"]')",
            )
            ..execute(
              "INSERT INTO session_events VALUES ('e1', 's1', 'corner', '1', "
              "'2026-12-03T08:31:00.000Z', 1000, 'gps', 'ok')",
            )
            ..execute(
              'INSERT INTO outbox_entries (entity_type, entity_id, created_at) '
              "VALUES ('measurement', 'm1', '2026-12-03T08:32:00.000Z')",
            )
            ..userVersion = 1;
        },
      ),
    );
    addTearDown(db.close);

    final old = await db.select(db.captures).getSingle();
    expect(old.sha256, 'abc');
    expect(old.timeSource, 'phone');
    expect(old.qcVerdict, isNull);
    expect(old.qcVersion, isNull);
    expect(old.qcSharpness, isNull);
    // Schema 3: value_bool → value_boolean, failed_at, task cache.
    final m = await db.select(db.measurements).getSingle();
    expect(m.valueBoolean, isTrue);
    final entry = await db.select(db.outboxEntries).getSingle();
    expect(entry.failedAt, isNull);
    expect(entry.sentAt, isNull);
    expect(await db.select(db.taskCache).get(), isEmpty);
    // Schema 4: event details, verification results.
    final event = await db.select(db.sessionEvents).getSingle();
    expect(event.eventType, 'corner');
    expect(event.dataJson, isNull);
    expect(await db.select(db.verificationResults).get(), isEmpty);
    final version = await db.customSelect('PRAGMA user_version').getSingle();
    expect(version.read<int>('user_version'), 4);
  });
}
