import 'dart:convert';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../../core/db/database.dart';
import '../../core/geo/geo.dart';
import '../../core/time/clock.dart';
import '../route/grid_route.dart';
import '../route/route_store.dart';
import 'closeup_selection.dart';
import 'field_task.dart';
import 'sample_parcel.dart';

/// Tasks to show and where they came from.
class TaskList {
  const TaskList(this.tasks, {this.fetchedAt, this.fromCache = false});

  final List<FieldTask> tasks;

  /// When the list was downloaded; null for the sample tasks.
  final DateTime? fetchedAt;

  /// The server could not be reached; this is the last downloaded list.
  final bool fromCache;
}

/// Source of today's tasks.
abstract interface class TaskRepository {
  Future<TaskList> todaysTasks();
}

/// Fixed sample tasks for development and tests.
class FakeTaskRepository implements TaskRepository {
  const FakeTaskRepository();

  /// Periodic visit, inventory and verification tour on synthetic parcels
  /// (sample_parcel.dart). The periodic and verification parcels have
  /// located slots and a boundary; the inventory parcel has neither yet.
  static final List<FieldTask> sampleTasks = [
    FieldTask(
      id: 'task-1',
      parcelId: 'b2c4e6a8-0000-4000-8000-000000000012',
      parcelName: 'Kızılburç P-12',
      village: 'Kızılburç',
      kind: VisitKind.periodic,
      season: Season.winter,
      areaDecare: 20,
      slots: _sampleTourSlots,
      boundary: sampleBoundary(),
      rowAzimuthDeg: 0,
      originCorner: 'sw',
      estimatedTreeCount: 220,
      closeupTrees: [
        TreeTarget(
          treeId: 't-0512',
          slotCode: 'S5-12',
          reason: 'Önceki ziyarette Dikkat',
        ),
        TreeTarget(
          treeId: 't-0703',
          slotCode: 'S7-3',
          reason: 'Rastgele örneklem',
        ),
        TreeTarget(
          treeId: 't-0921',
          slotCode: 'S9-21a',
          reason: 'Taramada sorun işaretlendi',
        ),
      ],
    ),
    FieldTask(
      id: 'task-2',
      parcelId: 'b2c4e6a8-0000-4000-8000-000000000031',
      parcelName: 'Yukarıbayır P-31',
      village: 'Yukarıbayır',
      kind: VisitKind.inventory,
      season: Season.winter,
      areaDecare: 14.5,
      closeupTrees: [
        TreeTarget(
          treeId: 't-3101',
          slotCode: 'S1-4',
          reason: 'Doğrulama: belirsiz ağaç',
        ),
      ],
    ),
    FieldTask(
      id: 'task-3',
      parcelId: 'b2c4e6a8-0000-4000-8000-000000000012',
      parcelName: 'Kızılburç P-12',
      village: 'Kızılburç',
      kind: VisitKind.verification,
      season: Season.winter,
      areaDecare: 20,
      notes: 'Envanter doğrulaması',
      slots: _sampleTourSlots,
      boundary: sampleBoundary(),
      verificationItems: sortForWalking([
        VerificationItem(
          id: 'vi-3',
          slot: _sampleTourSlots.firstWhere((s) => s.code == 'S5-12'),
          reasons: const [VerificationReason.multiStem],
          note: 'Dipte iki gövde mi?',
          treeId: 't-0512',
        ),
        VerificationItem(
          id: 'vi-1',
          slot: _sampleTourSlots.firstWhere((s) => s.code == 'S2-4'),
          reasons: const [
            VerificationReason.emptySlot,
            VerificationReason.possibleSapling,
          ],
          note: 'Panoramada fidan seçilemedi',
        ),
        VerificationItem(
          id: 'vi-2',
          slot: _sampleTourSlots.firstWhere((s) => s.code == 'S2-9'),
          reasons: const [VerificationReason.highUncertainty],
          treeId: 't-0209',
        ),
      ]),
    ),
  ];

  static final List<SlotPoint> _sampleTourSlots = sampleSlots(idPrefix: 'p12');

  @override
  Future<TaskList> todaysTasks() async => TaskList(sampleTasks);
}

/// Downloads the planned visits of a user.
abstract interface class TaskSource {
  Future<List<FieldTask>> fetch({
    required String userId,
    required DateTime today,
  });
}

/// The last downloaded list per user, in the local database.
class TaskCacheStore {
  TaskCacheStore(this._db);

  final AppDatabase _db;

  Future<void> save(String userId, List<FieldTask> tasks, DateTime at) => _db
      .into(_db.taskCache)
      .insertOnConflictUpdate(
        TaskCacheCompanion.insert(
          userId: userId,
          tasksJson: jsonEncode([for (final t in tasks) t.toJson()]),
          fetchedAt: at,
        ),
      );

  Future<TaskList?> load(String userId) async {
    final row = await (_db.select(
      _db.taskCache,
    )..where((c) => c.userId.equals(userId))).getSingleOrNull();
    if (row == null) return null;
    return TaskList(
      [
        for (final t in jsonDecode(row.tasksJson) as List)
          FieldTask.fromJson((t as Map).cast<String, Object?>()),
      ],
      fetchedAt: row.fetchedAt,
      fromCache: true,
    );
  }
}

/// Server first; when the server cannot be reached, the last list
/// downloaded on this phone for the same user.
class CachedTaskRepository implements TaskRepository {
  CachedTaskRepository({
    required this.source,
    required this.cache,
    required this.clock,
    required this.userId,
    this.timeout = const Duration(seconds: 20),
  });

  final TaskSource source;
  final TaskCacheStore cache;
  final Clock clock;

  /// Signed-in user; null before sign-in.
  final String? Function() userId;
  final Duration timeout;

  @override
  Future<TaskList> todaysTasks() async {
    final user = userId();
    if (user == null) return const TaskList([]);
    final now = clock.now();
    try {
      final tasks = await source
          .fetch(userId: user, today: now.toLocal())
          .timeout(timeout);
      await cache.save(user, tasks, now);
      return TaskList(tasks, fetchedAt: now);
    } catch (_) {
      final cached = await cache.load(user);
      if (cached != null) return cached;
      rethrow;
    }
  }
}

/// Planned visits from Supabase (PostgREST, the user's token; row level
/// security limits them to the user's org).
///
/// A task is a `public.session` with `status = planned` and kind inventory
/// or periodic scan, planned up to [daysAhead] days from today (so that the
/// list is on the phone before the crew leaves for an orchard without
/// signal). Visits led by the user come first. Periodic visits come with
/// the parcel's active trees (slot codes) and the close-up list; every task
/// carries the parcel's slots with positions and its latest boundary (map
/// and coverage). Verification tours (`kind = verification`) come with
/// their open items (docs/arayuzler.md, "Doğrulama kalemleri").
class SupabaseTaskSource implements TaskSource {
  SupabaseTaskSource(this._client, {this.daysAhead = 7});

  final SupabaseClient _client;
  final int daysAhead;

  static const _pageSize = 1000;

  @override
  Future<List<FieldTask>> fetch({
    required String userId,
    required DateTime today,
  }) async {
    final day = DateTime(today.year, today.month, today.day);
    final until = day.add(Duration(days: daysAhead));
    final visits = await _client
        .from('session')
        .select(
          'id, org_id, parcel_id, kind, planned_date, lead_user_id, notes, '
          'methodology_version, '
          'parcel(name, village, estimated_area_m2, estimated_tree_count, '
          'row_azimuth_deg, numbering_origin_corner)',
        )
        .eq('status', 'planned')
        .inFilter('kind', ['inventory', 'periodic_scan', 'verification'])
        .lte('planned_date', _date(until))
        .order('planned_date')
        .order('id');

    final treesByParcel = <String, List<ParcelTree>>{};
    final slotsByParcel = <String, List<SlotPoint>>{};
    final boundaryByParcel = <String, List<GeoPoint>?>{};
    final routeByParcel = <String, StoredRoute?>{};
    final tasks = <FieldTask>[];
    for (final v in visits) {
      final id = v['id'] as String;
      final parcelId = v['parcel_id'] as String;
      final kind = switch (v['kind']) {
        'inventory' => VisitKind.inventory,
        'verification' => VisitKind.verification,
        _ => VisitKind.periodic,
      };
      final planned = DateTime.parse(v['planned_date'] as String);
      final parcel = (v['parcel'] as Map?)?.cast<String, Object?>() ?? {};
      final area = (parcel['estimated_area_m2'] as num?)?.toDouble() ?? 0;
      var closeups = const <TreeTarget>[];
      if (kind == VisitKind.periodic) {
        closeups =
            await _closeupList(id) ??
            selectCloseupTrees(
              treesByParcel[parcelId] ??= await _trees(parcelId),
              visitId: id,
            );
      }
      final slots = slotsByParcel[parcelId] ??= await _slots(parcelId);
      if (!boundaryByParcel.containsKey(parcelId)) {
        boundaryByParcel[parcelId] = await _boundary(parcelId);
      }
      if (kind != VisitKind.verification &&
          !routeByParcel.containsKey(parcelId)) {
        routeByParcel[parcelId] = await _route(parcelId);
      }
      final items = kind == VisitKind.verification
          ? await _verificationItems(id, slots)
          : const <VerificationItem>[];
      tasks.add(
        FieldTask(
          id: id,
          visitId: id,
          orgId: v['org_id'] as String,
          parcelId: parcelId,
          parcelName: parcel['name'] as String? ?? '',
          village: parcel['village'] as String? ?? '',
          kind: kind,
          season: Season.forDate(planned, v['methodology_version'] as String?),
          // 1 dönüm = 1000 m².
          areaDecare: area / 1000,
          closeupTrees: closeups,
          plannedDate: planned,
          assignedToMe: v['lead_user_id'] == userId,
          notes: v['notes'] as String?,
          slots: slots,
          boundary: boundaryByParcel[parcelId],
          verificationItems: items,
          rowAzimuthDeg: (parcel['row_azimuth_deg'] as num?)?.toDouble(),
          originCorner: parcel['numbering_origin_corner'] as String?,
          estimatedTreeCount: parcel['estimated_tree_count'] as int?,
          route: routeByParcel[parcelId],
        ),
      );
    }
    // Stable: within each group the server order (day, id) stays.
    return [
      ...tasks.where((t) => t.assignedToMe),
      ...tasks.where((t) => !t.assignedToMe),
    ];
  }

  /// The server's close-up list (stratified sample, crew marks, expert
  /// requests); null when the server cannot give it, and the phone falls
  /// back to its own unstratified selection.
  Future<List<TreeTarget>?> _closeupList(String visitId) async {
    try {
      final rows = await _client.rpc(
        'closeup_list',
        params: {'p_session_id': visitId},
      );
      return closeupTargetsFromServer([
        for (final r in rows as List) (r as Map).cast<String, Object?>(),
      ]);
    } on Object {
      return null;
    }
  }

  Future<List<ParcelTree>> _trees(String parcelId) async {
    final latest = <String, String>{};
    for (final r
        in await _client
            .from('tree_latest_assessment')
            .select('tree_id, overall_class')
            .eq('parcel_id', parcelId)
            .not('overall_class', 'is', null)) {
      latest[r['tree_id'] as String] = r['overall_class'] as String;
    }
    final trees = <ParcelTree>[];
    for (var from = 0; ; from += _pageSize) {
      final page = await _client
          .from('tree')
          .select('id, slot(code, row_no, position_no)')
          .eq('parcel_id', parcelId)
          .eq('status', 'active')
          .order('id')
          .range(from, from + _pageSize - 1);
      for (final r in page) {
        final slot = (r['slot'] as Map).cast<String, Object?>();
        final id = r['id'] as String;
        trees.add(
          ParcelTree(
            treeId: id,
            slotCode: slot['code']! as String,
            rowNo: slot['row_no']! as int,
            positionNo: slot['position_no']! as int,
            latestClass: latest[id],
          ),
        );
      }
      if (page.length < _pageSize) break;
    }
    return trees;
  }

  static String? _activeTree(Object? trees) {
    for (final t in (trees as List?) ?? const []) {
      final m = (t as Map).cast<String, Object?>();
      if (m['status'] == 'active') return m['id'] as String?;
    }
    return null;
  }

  Future<List<SlotPoint>> _slots(String parcelId) async {
    final slots = <SlotPoint>[];
    for (var from = 0; ; from += _pageSize) {
      final page = await _client
          .from('slot')
          .select(
            'id, code, row_no, position_no, position, position_uncertainty_m, '
            'tree(id, status)',
          )
          .eq('parcel_id', parcelId)
          .order('id')
          .range(from, from + _pageSize - 1);
      for (final r in page) {
        slots.add(
          SlotPoint(
            id: r['id'] as String,
            code: r['code'] as String,
            rowNo: r['row_no'] as int,
            positionNo: r['position_no'] as int,
            position: GeoPoint.fromGeoJson(r['position']),
            uncertaintyM: (r['position_uncertainty_m'] as num?)?.toDouble(),
            treeId: _activeTree(r['tree']),
          ),
        );
      }
      if (page.length < _pageSize) break;
    }
    return slots;
  }

  /// Outer ring of the newest boundary version; null when there is none.
  Future<List<GeoPoint>?> _boundary(String parcelId) async {
    final rows = await _client
        .from('boundary')
        .select('geom')
        .eq('parcel_id', parcelId)
        .order('version', ascending: false)
        .limit(1);
    return rows.isEmpty ? null : polygonFromGeoJson(rows.first['geom']);
  }

  /// Newest grid route version of the parcel; null when none.
  Future<StoredRoute?> _route(String parcelId) async {
    final rows = await _client
        .from('parcel_route')
        .select('id, version, route')
        .eq('parcel_id', parcelId)
        .order('version', ascending: false)
        .limit(1);
    if (rows.isEmpty) return null;
    final r = rows.first;
    return StoredRoute(
      id: r['id'] as String,
      parcelId: parcelId,
      version: r['version'] as int,
      route: GridRoute.fromJson((r['route'] as Map).cast<String, Object?>()),
    );
  }

  /// Open items of a tour, in walking order.
  Future<List<VerificationItem>> _verificationItems(
    String sessionId,
    List<SlotPoint> slots,
  ) async {
    final bySlot = {for (final s in slots) s.id: s};
    final rows = await _client
        .from('verification_item')
        .select('id, slot_id, tree_id, reasons, note')
        .eq('session_id', sessionId)
        .eq('status', 'open');
    return sortForWalking([
      for (final r in rows)
        if (bySlot[r['slot_id']] case final slot?)
          VerificationItem(
            id: r['id'] as String,
            slot: slot,
            reasons: [
              for (final c in r['reasons'] as List)
                VerificationReason.fromCode(c as String),
            ],
            note: r['note'] as String?,
            treeId: r['tree_id'] as String?,
          ),
    ]);
  }

  static String _date(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';
}
