import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/app/providers.dart';
import 'package:orchados_field/core/geo/geo.dart';
import 'package:orchados_field/features/map/vector_map.dart';
import 'package:orchados_field/features/session/session_controller.dart';
import 'package:orchados_field/features/session/session_screen.dart';
import 'package:orchados_field/features/summary/visit_summary_screen.dart';
import 'package:orchados_field/features/tasks/sample_parcel.dart';
import 'package:orchados_field/features/tasks/task_repository.dart';

import '../support/test_app.dart';

void main() {
  final periodic = FakeTaskRepository.sampleTasks[0];
  final proj = LocalProjection(sampleOrigin);

  Future<TestHarness> recording(WidgetTester tester, {GeoPoint? at}) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);
    final h = TestHarness();
    h.container.read(sessionControllerProvider.notifier).selectTask(periodic);
    h.logger.position = at;
    await tester.runAsync(h.logger.connect);
    await tester.pumpWidget(h.wrap(const SessionScreen()));
    await settle(tester);
    await tapVisible(tester, find.byKey(const Key('session-start')));
    await settle(tester);
    return h;
  }

  /// Walks from [a] to [b] at 1 m/s, one status message per second.
  Future<void> walk(WidgetTester tester, TestHarness h, Enu a, Enu b) async {
    final steps = (b - a).length.ceil();
    for (var k = 0; k <= steps; k++) {
      h.logger.position = proj.toGeo(a + (b - a) * (k / steps));
      h.logger.tick();
      h.clock.advance(const Duration(seconds: 1));
      if (k % 20 == 0) await tester.pump();
    }
    await settle(tester);
  }

  String text(WidgetTester tester, String key) =>
      tester.widget<Text>(find.byKey(Key(key))).data!;

  testWidgets('track over the parcel: covered share, corridors, summary', (
    tester,
  ) async {
    final h = await recording(tester, at: proj.toGeo(const Enu(-3, -5)));
    expect(find.byKey(const Key('coverage-card')), findsOneWidget);
    final map0 = tester.widget<VectorMap>(
      find.byKey(const Key('coverage-map')),
    );
    expect(map0.boundary, hasLength(4));
    expect(map0.dots, hasLength(220));

    // Up the corridor west of row 1 (3 m from its trees).
    await walk(tester, h, const Enu(-3, -5), const Enu(-3, 152));
    expect(
      text(tester, 'coverage-text'),
      "Yerlerin %10'unun 4 m yakınından geçildi.",
    );
    expect(find.text('22 / 220 yer · iz 0,16 km'), findsOneWidget);
    expect(find.byKey(const Key('coverage-warning')), findsOneWidget);
    expect(find.text('Sıra boyunca: 1 / 10 sıra'), findsOneWidget);
    expect(find.text('Dik koridorlar: 0 / 22'), findsOneWidget);
    final row1 = tester.widget<Container>(find.byKey(const Key('row-1')));
    expect((row1.decoration! as BoxDecoration).color, Colors.green.shade600);
    final map = tester.widget<VectorMap>(find.byKey(const Key('coverage-map')));
    expect(map.tracks.single.length, greaterThan(150));
    expect(
      map.dots.where((d) => d.color == Colors.green.shade600),
      hasLength(22),
    );
    expect(map.here, isNotNull);

    // Across the parcel at position 1 (3 m south of the first trees).
    await walk(tester, h, const Enu(-3, 152), const Enu(-3, -3));
    await walk(tester, h, const Enu(-3, -3), const Enu(80, -3));
    expect(find.text('Dik koridorlar: 1 / 22'), findsOneWidget);
    expect(
      text(tester, 'coverage-text'),
      "Yerlerin %14'ünün 4 m yakınından geçildi.",
    );

    // Stop: the coverage is stored with the visit and shown in the summary.
    final controller = h.container.read(sessionControllerProvider.notifier);
    await tester.runAsync(() async {
      await controller.qrShown(
        QrMoment.start,
        'OQ1:1:x',
        h.container.read(gpsClockProvider).now(),
      );
      await controller.qrShown(
        QrMoment.end,
        'OQ1:2:x',
        h.container.read(gpsClockProvider).now(),
      );
      expect(await controller.stop(), isTrue);
    });
    // No more points after the stop.
    final pointsAtStop = h.container
        .read(sessionControllerProvider)
        .coverage!
        .summary
        .trackPoints;
    await walk(tester, h, const Enu(80, -3), const Enu(80, 40));
    expect(
      h.container.read(sessionControllerProvider).coverage!.summary.trackPoints,
      pointsAtStop,
    );

    final id = h.container.read(sessionControllerProvider).sessionId!;
    final events = (await tester.runAsync(
      () => h.container.read(fieldRepositoryProvider).events(id),
    ))!;
    expect(events.map((e) => e.eventType).toList().sublist(events.length - 2), [
      'coverage',
      'session_stop',
    ]);
    final cov = events.firstWhere((e) => e.eventType == 'coverage');
    expect(cov.payload, '31/220');
    final data = jsonDecode(cov.dataJson!) as Map;
    expect(data['slots_covered'], 31);
    expect(data['rows_done'], [1]);
    expect(data['cross_done'], [1]);
    expect(data['radius_m'], 4);
    expect((data['uncovered_slot_codes'] as List).first, 'S2-2');

    await tester.pumpWidget(h.wrap(const VisitSummaryScreen()));
    await settle(tester);
    await tester.pumpAndSettle();
    expect(find.text('%14 (4 m)'), findsOneWidget);
    expect(
      text(tester, 'summary-coverage'),
      "Yerlerin %14'ünün 4 m yakınından geçildi.",
    );
    expect(
      text(tester, 'summary-coverage-warning'),
      startsWith('Kapsama %95 hedefinin altında. Kaçırılan yerler: S2-2, '),
    );
    await h.dispose(tester);
  });

  testWidgets('without positions from the logger: no coverage, said so', (
    tester,
  ) async {
    final h = await recording(tester);
    expect(
      text(tester, 'coverage-text'),
      'Kaydediciden konum gelmiyor; kapsama gösterilemiyor.',
    );
    h.logger.tick();
    await settle(tester);
    expect(
      h.container.read(sessionControllerProvider).coverage!.summary.trackPoints,
      0,
    );
    await h.dispose(tester);
  });
}
