import 'dart:async';
import 'dart:typed_data';

import 'package:orchados_field/core/sync/sync_server.dart';

/// In-memory server with the same idempotency rules as the database: rows
/// are keyed by their conflict columns, objects by path.
class FakeSyncServer implements SyncServer {
  FakeSyncServer({
    Map<String, String>? parcels,
    Map<String, String>? visits,
    Map<String, String>? metrics,
  }) : parcels = parcels ?? {'P-12': 'org-1'},
       visits = visits ?? {},
       metrics =
           metrics ??
           {
             for (final code in const [
               'dead_branch_present',
               'trunk_damage_present',
               'root_sucker_present',
               'pruned',
             ])
               code: 'md-$code',
           };

  /// parcel id → org id (visible parcels).
  final Map<String, String> parcels;

  /// visit id → status.
  final Map<String, String> visits;

  /// metric code → id.
  final Map<String, String> metrics;

  /// Written values per visit (last write wins, like an UPDATE).
  final Map<String, Map<String, Object?>> visitValues = {};

  /// table → conflict key → row.
  final Map<String, Map<String, Map<String, Object?>>> tables = {};

  /// Media objects by path.
  final Map<String, Uint8List> objects = {};

  /// Every call in order, e.g. `insert:measurement`, `upload:<path>`.
  final List<String> calls = [];

  /// While true every call fails like a phone without signal.
  bool offline = false;

  /// Fails the next calls with a network error, then works again.
  int failNextCalls = 0;

  /// The connection drops after this many calls (counted in [calls]).
  int? offlineAfterCalls;

  /// Refuses matching inserts for good: returns the reason or null.
  String? Function(String table, Map<String, Object?> row)? refuse;

  /// Media uploads that are accepted but do not show up (to test the check
  /// before a photo is removed from the phone).
  bool dropUploads = false;

  /// Lets a test hold a call until it completes [gate].
  Completer<void>? gate;

  Map<String, Map<String, Object?>> table(String name) =>
      tables.putIfAbsent(name, () => {});

  Future<void> _call(String name) async {
    calls.add(name);
    final g = gate;
    if (g != null) await g.future;
    final limit = offlineAfterCalls;
    if (offline || (limit != null && calls.length > limit)) {
      throw const SyncError.transient('network', 'offline');
    }
    if (failNextCalls > 0) {
      failNextCalls--;
      throw const SyncError.transient('network', 'connection reset');
    }
  }

  @override
  Future<String?> parcelOrg(String parcelId) async {
    await _call('parcel:$parcelId');
    return parcels[parcelId];
  }

  @override
  Future<Map<String, String>> metricIds() async {
    await _call('metrics');
    return Map.of(metrics);
  }

  @override
  Future<bool> updateVisit(
    String id,
    Map<String, Object?> values, {
    required List<String> whileStatus,
  }) async {
    await _call('visit:$id');
    final status = visits[id];
    if (status == null || !whileStatus.contains(status)) return false;
    visitValues[id] = {...?visitValues[id], ...values};
    final s = values['status'];
    if (s is String) visits[id] = s;
    return true;
  }

  @override
  Future<String?> visitStatus(String id) async {
    await _call('visit-status:$id');
    return visits[id];
  }

  @override
  Future<void> insertIgnoringDuplicates(
    String table,
    Map<String, Object?> row, {
    required String onConflict,
  }) async {
    await _call('insert:$table');
    final reason = refuse?.call(table, row);
    if (reason != null) throw SyncError.permanent(reason, 'refused by test');
    final key = onConflict.split(',').map((c) => '${row[c]}').join('/');
    this.table(table).putIfAbsent(key, () => row);
  }

  @override
  Future<void> uploadMedia(
    String path,
    Uint8List bytes, {
    required String contentType,
  }) async {
    await _call('upload:$path');
    if (!dropUploads) objects.putIfAbsent(path, () => bytes);
  }

  @override
  Future<bool> mediaExists(String path) async {
    await _call('exists:$path');
    return objects.containsKey(path);
  }
}
