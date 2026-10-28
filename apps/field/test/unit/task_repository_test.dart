import 'dart:convert';
import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/core/db/database.dart';
import 'package:orchados_field/core/sync/sync_server.dart';
import 'package:orchados_field/core/time/clock.dart';
import 'package:orchados_field/features/tasks/closeup_selection.dart';
import 'package:orchados_field/features/tasks/field_task.dart';
import 'package:orchados_field/features/tasks/task_repository.dart';

class FakeTaskSource implements TaskSource {
  List<FieldTask> tasks = [];
  bool offline = false;
  final List<String> users = [];

  @override
  Future<List<FieldTask>> fetch({
    required String userId,
    required DateTime today,
  }) async {
    users.add(userId);
    if (offline) throw const SyncError.transient('network', 'offline');
    return tasks;
  }
}

const visit = FieldTask(
  id: 'e1900000-0000-4000-8000-000000000001',
  visitId: 'e1900000-0000-4000-8000-000000000001',
  orgId: 'b0000000-0000-4000-8000-000000000001',
  parcelId: 'c0000000-0000-4000-8000-000000000001',
  parcelName: 'Örnek parsel',
  village: 'Kızılburç',
  kind: VisitKind.periodic,
  season: Season.winter,
  areaDecare: 19.584,
  assignedToMe: true,
  closeupTrees: [
    TreeTarget(
      treeId: 'tree-1',
      slotCode: 'S5-12',
      reason: 'Rastgele örneklem',
    ),
  ],
);

void main() {
  late AppDatabase db;
  late FakeClock clock;
  late FakeTaskSource source;
  String? user = 'field-user';

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    clock = FakeClock(DateTime.utc(2026, 12, 3, 6));
    source = FakeTaskSource();
    user = 'field-user';
  });

  tearDown(() => db.close());

  CachedTaskRepository repo() => CachedTaskRepository(
    source: source,
    cache: TaskCacheStore(db),
    clock: clock,
    userId: () => user,
  );

  test('online: the downloaded list is shown and kept', () async {
    source.tasks = [visit];
    final list = await repo().todaysTasks();
    expect(list.fromCache, isFalse);
    expect(list.fetchedAt, clock.now());
    expect(list.tasks.single.visitId, visit.visitId);
    expect(source.users, ['field-user']);
  });

  test('offline: the last downloaded list of the same user', () async {
    source.tasks = [visit];
    await repo().todaysTasks();
    final fetched = clock.now();

    clock.advance(const Duration(hours: 3));
    source.offline = true;
    final list = await repo().todaysTasks();
    expect(list.fromCache, isTrue);
    expect(list.fetchedAt, fetched);
    final t = list.tasks.single;
    expect(t.id, visit.id);
    expect(t.orgId, visit.orgId);
    expect(t.kind, VisitKind.periodic);
    expect(t.season, Season.winter);
    expect(t.assignedToMe, isTrue);
    expect(t.closeupTrees.single.slotCode, 'S5-12');

    // Another user on the same phone does not get it.
    user = 'other-user';
    await expectLater(repo().todaysTasks(), throwsA(isA<SyncError>()));
  });

  test('a newer download replaces the kept list', () async {
    source.tasks = [visit];
    await repo().todaysTasks();
    source.tasks = [];
    await repo().todaysTasks();
    source.offline = true;
    expect((await repo().todaysTasks()).tasks, isEmpty);
  });

  test('signed out: no tasks', () async {
    user = null;
    expect((await repo().todaysTasks()).tasks, isEmpty);
    expect(source.users, isEmpty);
  });

  test('a task survives JSON', () {
    final planned = DateTime(2026, 12, 10);
    final t = FieldTask.fromJson(
      FieldTask(
        id: 'x',
        parcelId: 'p',
        parcelName: 'P',
        village: 'V',
        kind: VisitKind.inventory,
        season: Season.harvest,
        areaDecare: 1.5,
        plannedDate: planned,
      ).toJson(),
    );
    expect(t.kind, VisitKind.inventory);
    expect(t.season, Season.harvest);
    expect(t.areaDecare, 1.5);
    expect(t.plannedDate, planned);
    expect(t.visitId, isNull);
    expect(t.closeupTrees, isEmpty);
  });

  test('season of a planned day: shared vectors with web and AI worker', () {
    // test-vectors/season.json at the repository root; tests run in apps/field.
    final vectors =
        jsonDecode(File('../../test-vectors/season.json').readAsStringSync())
            as Map<String, Object?>;
    final calendars = (vectors['calendars']! as Map).cast<String, Object?>();
    final versions = (vectors['versions']! as Map).cast<String, Object?>();
    var cases = 0;
    for (final MapEntry(key: version, value: calendar) in versions.entries) {
      final seasons = calendars[calendar]! as List;
      for (var m = 1; m <= 12; m++) {
        final v = version == 'null' ? null : version;
        expect(
          Season.forDate(DateTime(2027, m, 15), v).code,
          seasons[m - 1],
          reason: '$version, month $m',
        );
        cases++;
      }
    }
    expect(cases, 60);
  });

  test('a visit keeps the season of its methodology', () {
    final lateMarch = DateTime(2027, 3, 28);
    final earlyAugust = DateTime(2027, 8, 5);
    expect(Season.forDate(lateMarch, 'methodology-v0.2'), Season.winter);
    expect(Season.forDate(earlyAugust, 'methodology-v0.2'), Season.summer);
    expect(Season.forDate(lateMarch, 'methodology-v0.1'), Season.spring);
    expect(Season.forDate(earlyAugust, 'methodology-v0.1'), Season.harvest);
    // November is winter in every version (the field app used to say harvest).
    expect(Season.forDate(DateTime(2026, 11, 20), null), Season.winter);
  });

  group('close-up trees', () {
    List<ParcelTree> parcel(int n, {Map<int, String> classes = const {}}) => [
      for (var i = 0; i < n; i++)
        ParcelTree(
          treeId: 'tree-$i',
          slotCode: 'S${i ~/ 10 + 1}-${i % 10 + 1}',
          rowNo: i ~/ 10 + 1,
          positionNo: i % 10 + 1,
          latestClass: classes[i],
        ),
    ];

    test('flagged trees first, then a 10% sample of the rest', () {
      final trees = parcel(
        95,
        classes: {40: 'problem', 7: 'attention', 3: 'healthy', 60: 'dead'},
      );
      final list = selectCloseupTrees(trees, visitId: 'v-1');
      expect(list.take(3).map((t) => (t.slotCode, t.reason)), [
        ('S1-8', 'Önceki ziyarette Dikkat'),
        ('S5-1', 'Önceki ziyarette Sorunlu'),
        ('S7-1', 'Önceki ziyarette Kuru'),
      ]);
      final sample = list.skip(3).toList();
      expect(sample, hasLength(10)); // ceil(95 · 10%)
      expect(sample.every((t) => t.reason == 'Rastgele örneklem'), isTrue);
      expect(
        sample.map((t) => t.treeId).toSet().intersection({
          'tree-40',
          'tree-7',
          'tree-60',
        }),
        isEmpty,
      );
    });

    test('the same visit draws the same sample on every phone', () {
      final trees = parcel(50);
      final a = selectCloseupTrees(trees, visitId: 'v-1');
      final b = selectCloseupTrees(trees.reversed.toList(), visitId: 'v-1');
      final c = selectCloseupTrees(trees, visitId: 'v-2');
      expect(b.map((t) => t.treeId), a.map((t) => t.treeId));
      expect(c.map((t) => t.treeId), isNot(a.map((t) => t.treeId)));
      // Listed in walking order (row, position).
      final rows = [for (final t in a) int.parse(t.treeId.split('-')[1])];
      expect(rows, [...rows]..sort());
    });

    test('no trees, no list', () {
      expect(selectCloseupTrees(const [], visitId: 'v'), isEmpty);
    });
  });
}
