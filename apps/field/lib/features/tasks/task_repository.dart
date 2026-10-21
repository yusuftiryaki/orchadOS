import 'dart:convert';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../../core/db/database.dart';
import '../../core/time/clock.dart';
import 'closeup_selection.dart';
import 'field_task.dart';

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

  static const List<FieldTask> sampleTasks = [
    FieldTask(
      id: 'task-1',
      parcelId: 'b2c4e6a8-0000-4000-8000-000000000012',
      parcelName: 'Kızılburç P-12',
      village: 'Kızılburç',
      kind: VisitKind.periodic,
      season: Season.winter,
      areaDecare: 20,
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
  ];

  @override
  Future<TaskList> todaysTasks() async => const TaskList(sampleTasks);
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
/// the parcel's active trees (slot codes) and the close-up list.
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
          'id, org_id, parcel_id, kind, planned_date, lead_user_id, '
          'parcel(name, village, estimated_area_m2)',
        )
        .eq('status', 'planned')
        .inFilter('kind', ['inventory', 'periodic_scan'])
        .lte('planned_date', _date(until))
        .order('planned_date')
        .order('id');

    final treesByParcel = <String, List<ParcelTree>>{};
    final tasks = <FieldTask>[];
    for (final v in visits) {
      final id = v['id'] as String;
      final parcelId = v['parcel_id'] as String;
      final kind = v['kind'] == 'inventory'
          ? VisitKind.inventory
          : VisitKind.periodic;
      final planned = DateTime.parse(v['planned_date'] as String);
      final parcel = (v['parcel'] as Map?)?.cast<String, Object?>() ?? {};
      final area = (parcel['estimated_area_m2'] as num?)?.toDouble() ?? 0;
      var closeups = const <TreeTarget>[];
      if (kind == VisitKind.periodic) {
        final trees = treesByParcel[parcelId] ??= await _trees(parcelId);
        closeups = selectCloseupTrees(trees, visitId: id);
      }
      tasks.add(
        FieldTask(
          id: id,
          visitId: id,
          orgId: v['org_id'] as String,
          parcelId: parcelId,
          parcelName: parcel['name'] as String? ?? '',
          village: parcel['village'] as String? ?? '',
          kind: kind,
          season: Season.forDate(planned),
          // 1 dönüm = 1000 m².
          areaDecare: area / 1000,
          closeupTrees: closeups,
          plannedDate: planned,
          assignedToMe: v['lead_user_id'] == userId,
        ),
      );
    }
    // Stable: within each group the server order (day, id) stays.
    return [
      ...tasks.where((t) => t.assignedToMe),
      ...tasks.where((t) => !t.assignedToMe),
    ];
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

  static String _date(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';
}
