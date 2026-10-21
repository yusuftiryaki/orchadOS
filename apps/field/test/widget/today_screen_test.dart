import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/core/sync/sync_server.dart';
import 'package:orchados_field/features/tasks/field_task.dart';
import 'package:orchados_field/features/tasks/task_repository.dart';
import 'package:orchados_field/features/tasks/today_screen.dart';

import '../support/test_app.dart';

class _Source implements TaskSource {
  bool offline = false;

  @override
  Future<List<FieldTask>> fetch({
    required String userId,
    required DateTime today,
  }) async {
    if (offline) throw const SyncError.transient('network', 'offline');
    return [
      FieldTask(
        id: 'v-1',
        visitId: 'v-1',
        orgId: 'org-1',
        parcelId: 'P-12',
        parcelName: 'Örnek P-1',
        village: 'Kızılburç',
        kind: VisitKind.periodic,
        season: Season.winter,
        areaDecare: 19.6,
        plannedDate: today,
        assignedToMe: true,
      ),
    ];
  }
}

void main() {
  testWidgets('server tasks, then the kept list when offline', (tester) async {
    final source = _Source();
    final h = TestHarness(
      tasks: (h) => CachedTaskRepository(
        source: source,
        cache: TaskCacheStore(h.db),
        clock: h.clock,
        userId: () => 'field-user',
      ),
    );
    await tester.pumpWidget(h.wrap(const TodayScreen()));
    await settle(tester);
    await tester.pump();

    expect(find.text('Örnek P-1'), findsOneWidget);
    expect(find.textContaining('Size atanmış'), findsOneWidget);
    expect(find.text('Bugün · Size atanmış'), findsOneWidget);
    expect(find.byKey(const Key('tasks-offline')), findsNothing);

    // No signal: pull to refresh shows the kept list with a note.
    source.offline = true;
    h.container.invalidate(todaysTasksProvider);
    await settle(tester);
    await tester.pump();
    expect(find.text('Örnek P-1'), findsOneWidget);
    expect(find.byKey(const Key('tasks-offline')), findsOneWidget);
    expect(
      find.textContaining('Son indirilen liste gösteriliyor'),
      findsOneWidget,
    );

    await h.dispose(tester);
  });
}
