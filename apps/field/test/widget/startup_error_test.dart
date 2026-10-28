import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/app/startup_error.dart';

void main() {
  testWidgets('a failing start shows the error instead of a blank screen', (
    tester,
  ) async {
    await guardedStartup(() async => throw StateError('no database'));
    await tester.pump();
    expect(find.text('Uygulama başlatılamadı'), findsOneWidget);
    expect(find.textContaining('no database'), findsOneWidget);
  });

  testWidgets('a working start shows nothing extra', (tester) async {
    await guardedStartup(
      () async => runApp(const MaterialApp(home: Text('ok'))),
    );
    await tester.pump();
    expect(find.byKey(const Key('startup-error')), findsNothing);
  });
}
