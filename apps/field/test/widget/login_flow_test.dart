import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/app/app.dart';
import 'package:orchados_field/features/checklist/precheck_screen.dart';

import '../support/test_app.dart';

void main() {
  testWidgets('dev sign-in leads to today\'s tasks', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.5;
    addTearDown(tester.view.reset);
    final h = TestHarness();
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: h.container,
        child: const FieldApp(),
      ),
    );
    await settle(tester);
    expect(find.text('orchadOS Saha'), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('login-email')),
      'field@example.com',
    );
    await tester.enterText(find.byKey(const Key('login-password')), 'yanlis');
    await tester.tap(find.text('Giriş yap'));
    await settle(tester);
    expect(find.text('E-posta ya da parola hatalı'), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('login-password')),
      'orchados-dev',
    );
    await tester.tap(find.text('Giriş yap'));
    await settle(tester);
    expect(find.text('Bugünkü görevler'), findsOneWidget);
    expect(find.text('Kızılburç P-12'), findsOneWidget);
    expect(find.text('Envanter · Kış'), findsOneWidget);

    await tester.tap(find.text('Kızılburç P-12'));
    await settle(tester);
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byType(PrecheckScreen), findsOneWidget);
    await h.dispose(tester);
  });
}
