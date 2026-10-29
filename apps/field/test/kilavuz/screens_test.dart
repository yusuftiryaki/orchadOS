// Screenshots of the field app for the staff guide
// (docs/kilavuz/07-saha-uygulamasi.md). Skipped unless run with
// `--dart-define=KILAVUZ_SHOTS=true`; see tool/kilavuz_screens.sh.
//
// Every screen is built with the same fakes as the widget tests (fake
// logger, fake camera, in-memory database) and synthetic data only.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/app/providers.dart';
import 'package:orchados_field/core/geo/geo.dart';
import 'package:orchados_field/core/media/synthetic_photo.dart';
import 'package:orchados_field/features/auth/login_screen.dart';
import 'package:orchados_field/features/boundary/boundary_corners.dart';
import 'package:orchados_field/features/boundary/boundary_screen.dart';
import 'package:orchados_field/features/checklist/precheck_screen.dart';
import 'package:orchados_field/features/notice/blocked_visit_screen.dart';
import 'package:orchados_field/features/notice/field_records.dart';
import 'package:orchados_field/features/session/session_controller.dart';
import 'package:orchados_field/features/tasks/field_task.dart';
import 'package:orchados_field/features/tasks/sample_parcel.dart';
import 'package:orchados_field/features/tasks/task_repository.dart';
import 'package:orchados_field/features/tasks/today_screen.dart';
import 'package:orchados_field/features/verification/verification_tour_screen.dart';

import '../support/fake_sync_server.dart';
import '../support/test_app.dart' show settle, shootAndUse, tapVisible;
import 'kilavuz_support.dart';

final _today = DateTime.utc(2026, 12, 3);

/// Sample slots with an active tree on each (needed for "Sorun gördüm").
final List<SlotPoint> _slots = [
  for (final s in sampleSlots(idPrefix: 'k12'))
    SlotPoint(
      id: s.id,
      code: s.code,
      rowNo: s.rowNo,
      positionNo: s.positionNo,
      position: s.position,
      uncertaintyM: s.uncertaintyM,
      treeId: 't-${s.code}',
    ),
];

SlotPoint _slot(String code) => _slots.firstWhere((s) => s.code == code);

final periodicTask = FieldTask(
  id: 'k-periodic',
  visitId: 'c0ffee00-0000-4000-8000-000000000012',
  orgId: 'org-kilavuz',
  parcelId: 'b2c4e6a8-0000-4000-8000-000000000012',
  parcelName: 'Deneme Bahçesi P-12',
  village: 'Örnekköy',
  kind: VisitKind.periodic,
  season: Season.winter,
  areaDecare: 20,
  plannedDate: _today,
  assignedToMe: true,
  slots: _slots,
  boundary: sampleBoundary(),
  rowAzimuthDeg: 0,
  originCorner: 'sw',
  estimatedTreeCount: 220,
  closeupTrees: const [
    TreeTarget(
      treeId: 't-S5-12',
      slotCode: 'S5-12',
      reason: 'Önceki ziyarette Dikkat',
    ),
    TreeTarget(treeId: 't-S7-3', slotCode: 'S7-3', reason: 'Rastgele örneklem'),
    TreeTarget(
      treeId: 't-S9-21',
      slotCode: 'S9-21',
      reason: 'Uzman isteği: gövde dibine yakından bakılsın',
    ),
  ],
);

final inventoryTask = FieldTask(
  id: 'k-inventory',
  visitId: 'c0ffee00-0000-4000-8000-000000000031',
  orgId: 'org-kilavuz',
  parcelId: 'b2c4e6a8-0000-4000-8000-000000000031',
  parcelName: 'Örnek Bahçe P-31',
  village: 'Denemeköy',
  kind: VisitKind.inventory,
  season: Season.winter,
  areaDecare: 14.5,
  plannedDate: _today.add(const Duration(days: 1)),
  assignedToMe: true,
);

final blockedTask = FieldTask(
  id: 'k-blocked',
  visitId: 'c0ffee00-0000-4000-8000-000000000007',
  orgId: 'org-kilavuz',
  parcelId: 'b2c4e6a8-0000-4000-8000-000000000007',
  parcelName: 'Deneme Bahçesi P-7',
  village: 'Örnekköy',
  kind: VisitKind.periodic,
  season: Season.winter,
  areaDecare: 8.2,
  plannedDate: _today.subtract(const Duration(days: 2)),
);

final tourTask = FieldTask(
  id: 'k-tour',
  visitId: 'c0ffee00-0000-4000-8000-0000000000a1',
  orgId: 'org-kilavuz',
  parcelId: periodicTask.parcelId,
  parcelName: 'Deneme Bahçesi P-12',
  village: 'Örnekköy',
  kind: VisitKind.verification,
  season: Season.winter,
  areaDecare: 20,
  plannedDate: _today,
  assignedToMe: true,
  notes: 'Envanter doğrulaması',
  slots: _slots,
  boundary: sampleBoundary(),
  verificationItems: sortForWalking([
    VerificationItem(
      id: 'k-vi-1',
      slot: _slot('S2-4'),
      reasons: const [
        VerificationReason.emptySlot,
        VerificationReason.possibleSapling,
      ],
      note: 'Panoramada fidan seçilemedi',
    ),
    VerificationItem(
      id: 'k-vi-2',
      slot: _slot('S2-9'),
      reasons: const [VerificationReason.highUncertainty],
      treeId: 't-S2-9',
    ),
    VerificationItem(
      id: 'k-vi-3',
      slot: _slot('S5-12'),
      reasons: const [VerificationReason.multiStem],
      note: 'Dipte iki gövde mi?',
      treeId: 't-S5-12',
    ),
  ]),
);

Finder _key(String k) => find.byKey(Key(k));

final _proj = LocalProjection(sampleOrigin);

/// Changes the phone height between shots.
Future<void> _resize(WidgetTester tester, double height) async {
  tester.view.physicalSize = Size(phoneWidth * pixelRatio, height * pixelRatio);
  await tester.pumpAndSettle();
}

/// Walks from [a] to [b] at 1 m/s, one status message per second.
Future<void> _walk(WidgetTester tester, ShotHarness h, Enu a, Enu b) async {
  final steps = (b - a).length.ceil();
  for (var k = 0; k <= steps; k++) {
    h.logger.position = _proj.toGeo(
      a + (b - a) * (k / (steps == 0 ? 1 : steps)),
    );
    h.logger.tick();
    h.clock.advance(const Duration(seconds: 1));
    if (k % 20 == 0) await tester.pump();
  }
  await settle(tester);
}

/// Shows a QR from the session screen and closes it again.
Future<void> _qr(WidgetTester tester, String key) async {
  await tapVisible(tester, _key(key));
  await settle(tester);
  await tester.tap(find.text('Tamam'));
  await tester.pumpAndSettle();
}

Future<void> _type(WidgetTester tester, String key, String text) async {
  await tapVisible(tester, _key(key));
  await tester.enterText(_key(key), text);
  await tester.pump();
}

void _unfocus() => FocusManager.instance.primaryFocus?.unfocus();

void main() {
  testWidgets('01 giriş', skip: kilavuzSkip != null, (tester) async {
    await tester.runAsync(loadFonts);
    phone(tester);
    final h = ShotHarness(auth: ShotAuthRepository(signedIn: false));
    await tester.pumpWidget(h.wrap(const LoginScreen()));
    await tester.pump();
    await tester.enterText(_key('login-email'), 'saha@ornek.example');
    await tester.enterText(_key('login-password'), 'parola123');
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pumpAndSettle();
    await shot(tester, '01-giris.png', [
      Mark(_key('login-email'), 1, at: MarkAt.right),
      Mark(_key('login-password'), 2, at: MarkAt.right),
      Mark(find.text('Giriş yap'), 3, at: MarkAt.right, dx: 90),
    ]);
    await h.dispose(tester);
  });

  testWidgets('02 bugünkü görevler', skip: kilavuzSkip != null, (tester) async {
    await tester.runAsync(loadFonts);
    phone(tester, height: 1300);
    final server = FakeSyncServer()..offline = true;
    final h = ShotHarness(
      server: server,
      tasks: ShotTasks(
        TaskList(
          [periodicTask, tourTask, inventoryTask, blockedTask],
          fetchedAt: DateTime.utc(2026, 12, 3, 6, 12),
          fromCache: true,
        ),
      ),
    );
    // A blocked visit recorded earlier: its records wait in the queue.
    await tester.runAsync(
      () => h.container
          .read(fieldRepositoryProvider)
          .saveBlockedVisit(
            visitId: blockedTask.visitId!,
            parcelId: blockedTask.parcelId,
            taskId: blockedTask.id,
            visitKind: blockedTask.kind.code,
            detail: BlockedDetail.gateClosed,
            note: 'Bahçe kapısı kilitli, bekçi yoktu.',
            photos: const [],
            time: h.container.read(gpsClockProvider).now(),
          ),
    );
    await tester.pumpWidget(h.wrap(const TodayScreen()));
    await settle(tester);
    await tester.pump();
    await settle(tester);
    await shot(tester, '02-bugunku-gorevler.png', [
      Mark(_key('pending-uploads'), 1, at: MarkAt.below),
      Mark(_key('sync-card'), 2, at: MarkAt.right),
      Mark(_key('tasks-offline'), 3, at: MarkAt.right),
      Mark(_key('task-${periodicTask.id}'), 4, at: MarkAt.left, dx: 18),
      Mark(find.text('Bugün').first, 5, at: MarkAt.left, dx: -4),
      Mark(_key('task-blocked-${periodicTask.id}'), 6, at: MarkAt.left, dx: 4),
      Mark(_key('task-${tourTask.id}'), 7, at: MarkAt.left, dx: 18),
      Mark(_key('task-blocked'), 8, at: MarkAt.right, dx: 30),
    ]);
    await h.dispose(tester);
  });

  testWidgets('03 gönderim hatası', skip: kilavuzSkip != null, (tester) async {
    await tester.runAsync(loadFonts);
    phone(tester);
    // The server refuses the event of a cancelled visit for good.
    final server = FakeSyncServer()
      ..refuse = (table, row) =>
          table == 'session_event' ? 'visit_cancelled' : null;
    final h = ShotHarness(
      server: server,
      tasks: ShotTasks(
        TaskList([periodicTask], fetchedAt: DateTime.utc(2026, 12, 3, 8)),
      ),
    );
    await tester.runAsync(
      () => h.container
          .read(fieldRepositoryProvider)
          .saveBlockedVisit(
            visitId: blockedTask.visitId!,
            parcelId: blockedTask.parcelId,
            taskId: blockedTask.id,
            visitKind: blockedTask.kind.code,
            detail: BlockedDetail.rain,
            photos: const [],
            time: h.container.read(gpsClockProvider).now(),
          ),
    );
    await tester.pumpWidget(h.wrap(const TodayScreen()));
    for (var i = 0; i < 3; i++) {
      await settle(tester);
    }
    await tester.tap(_key('sync-failed-details'));
    await settle(tester);
    await tester.pumpAndSettle();
    await shot(tester, '04-gonderim-hatasi.png', [
      Mark(find.text('Gönderilemeyen kayıtlar'), 1, at: MarkAt.left),
      Mark(_key('sync-retry-failed'), 2, at: MarkAt.left),
    ]);
    await tester.tap(find.text('Kapat'));
    await tester.pumpAndSettle();
    await shot(tester, '03-gonderim-uyarisi.png', [
      Mark(_key('sync-failed'), 1, at: MarkAt.right),
      Mark(_key('sync-failed-warning'), 2, at: MarkAt.right),
      Mark(_key('sync-failed-details'), 3, at: MarkAt.left),
      Mark(_key('sync-now'), 4, at: MarkAt.right),
    ]);
    await h.dispose(tester);
  });

  testWidgets(
    'ön kontrol, tarama, yakın plan, özet',
    skip: kilavuzSkip != null,
    (tester) async {
      await tester.runAsync(loadFonts);
      phone(tester);
      final server = FakeSyncServer()..offline = true;
      final h = ShotHarness(
        server: server,
        photos: const [SyntheticPhotoKind.blurry],
      );
      final controller = h.container.read(sessionControllerProvider.notifier);
      controller.selectTask(periodicTask);

      // --- Pre-check, logger not connected yet.
      await tester.pumpWidget(h.wrap(const PrecheckScreen()));
      await settle(tester);
      await shot(tester, '06-on-kontrol-baglanti.png', [
        Mark(_key('gnss-connect'), 1, at: MarkAt.right),
        Mark(_key('check-battery'), 2, at: MarkAt.right),
        Mark(_key('check-sd'), 3, at: MarkAt.right),
        Mark(_key('check-gnss'), 4, at: MarkAt.right),
      ]);

      // Connect at the parcel's south-west corner, then fill in everything.
      h.logger.position = _proj.toGeo(const Enu(4, -23.5));
      await tester.tap(_key('gnss-connect'));
      await settle(tester);
      await tapVisible(tester, _key('check-lens'));
      await tapVisible(tester, _key('check-camera'));
      await tapVisible(tester, _key('check-spraying-none'));
      await tapVisible(tester, _key('check-platform-walk'));
      await _type(tester, 'check-camera-height', '1,80');
      await tapVisible(tester, _key('check-notice-sign-yes'));
      await tapVisible(tester, _key('check-notice-badge-yes'));
      _unfocus();
      await tester.pumpAndSettle();
      await _resize(tester, 1880);
      await scrollTo(tester, find.text('Ön kontrol'));
      await shot(tester, '07-on-kontrol.png', [
        Mark(_key('check-battery'), 1, at: MarkAt.left, dx: 22),
        Mark(_key('check-lens'), 2, at: MarkAt.left, dx: 22),
        Mark(_key('check-camera'), 3, at: MarkAt.left, dx: 22),
        Mark(_key('check-spraying'), 4, at: MarkAt.left, dx: 22),
        Mark(_key('check-scan-setup'), 5, at: MarkAt.left, dx: 22),
        Mark(_key('check-camera-height'), 6, at: MarkAt.end),
        Mark(_key('check-notice'), 7, at: MarkAt.left, dx: 22),
        Mark(_key('precheck-continue'), 8, at: MarkAt.right),
      ]);

      // --- Session screen, before the start.
      await tapVisible(tester, _key('precheck-continue'));
      await tester.pumpAndSettle();
      await _resize(tester, phoneHeight);
      await shot(tester, '08-oturum-hazir.png', [
        Mark(find.text('Kaydedici'), 1, at: MarkAt.start),
        Mark(find.text('Doğruluk'), 2, at: MarkAt.start),
        Mark(find.text('Saat kaynağı'), 3, at: MarkAt.start),
        Mark(_key('session-start'), 4, at: MarkAt.right),
      ]);

      await tapVisible(tester, _key('session-start'));
      await settle(tester);
      h.clock.advance(const Duration(seconds: 4));
      h.logger.tick();
      await tapVisible(tester, _key('session-start-qr'));
      await settle(tester);
      await tester.pump(const Duration(milliseconds: 600));
      await shot(tester, '09-qr-saat.png', [
        Mark(find.byKey(const Key('qr-source-gps')), 1, at: MarkAt.right),
        Mark(_key('qr-code'), 2, at: MarkAt.left, dx: 30),
        Mark(_key('qr-text'), 3, at: MarkAt.left),
        Mark(find.textContaining('Kaydediciye işaret'), 4, at: MarkAt.left),
        Mark(find.text('Tamam'), 5, at: MarkAt.right, dx: 120),
      ]);
      await tester.tap(find.text('Tamam'));
      await tester.pumpAndSettle();

      // Walk the first corridor and into the second.
      await _walk(tester, h, const Enu(4, -23.5), const Enu(4, 152.5));
      await _walk(tester, h, const Enu(4, 152.5), const Enu(12, 152.5));
      await _walk(tester, h, const Enu(12, 152.5), const Enu(12, 110));
      await tester.pumpAndSettle();
      await scrollTo(tester, _key('route-card'), alignment: 0.0);
      await shot(tester, '10-oturum-rota.png', [
        Mark(_key('route-progress'), 1, at: MarkAt.left),
        Mark(_key('route-current'), 2, at: MarkAt.left),
        Mark(_key('route-walked'), 3, at: MarkAt.left),
        Mark(_key('route-remaining'), 4, at: MarkAt.left),
        Mark(_key('route-back'), 5, at: MarkAt.left, dx: 10),
        Mark(_key('route-skip'), 6, at: MarkAt.right),
        Mark(_key('route-stopgo'), 7, at: MarkAt.right, dx: -50),
      ]);
      await scrollTo(tester, _key('coverage-card'), alignment: 0.0);
      await shot(tester, '11-oturum-kapsama.png', [
        Mark(_key('coverage-map'), 1, at: MarkAt.left, dx: 24),
        Mark(_key('coverage-text'), 2, at: MarkAt.left),
        Mark(_key('coverage-warning'), 3, at: MarkAt.left),
        Mark(find.textContaining('Sıra boyunca:'), 4, at: MarkAt.left),
        Mark(find.textContaining('Dik koridorlar'), 5, at: MarkAt.left),
      ]);
      await scrollTo(tester, _key('session-start-qr'), alignment: 0.05);
      await shot(tester, '12-oturum-adimlar.png', [
        Mark(_key('session-start-qr'), 1, at: MarkAt.right),
        Mark(_key('session-problem'), 2, at: MarkAt.right),
        Mark(_key('field-instruction'), 3, at: MarkAt.right),
        Mark(_key('notice-objection'), 4, at: MarkAt.right),
        Mark(_key('session-end-qr'), 5, at: MarkAt.right),
        Mark(_key('session-stop'), 6, at: MarkAt.right),
      ]);

      // "Sorun gördüm".
      await tapVisible(tester, _key('session-problem'));
      await tester.pumpAndSettle();
      await shot(tester, '13-sorun-gordum.png', [
        Mark(find.text('Hangi ağaçta sorun gördünüz?'), 1, at: MarkAt.left),
        Mark(find.byKey(const Key('problem-candidates')), 2, at: MarkAt.right),
      ]);
      final firstCandidate = find.descendant(
        of: _key('problem-candidates'),
        matching: find.byType(ListTile),
      );
      await tester.tap(firstCandidate.at(1));
      await settle(tester);
      await tester.pumpAndSettle();

      // "Bir kişi itiraz etti".
      await tapVisible(tester, _key('notice-objection'));
      await tester.pumpAndSettle();
      await tester.enterText(
        _key('objection-note'),
        'Komşu bahçedeki işçi çekime itiraz etti. S9 ve S10 sıraları sonra '
        'taranacak.',
      );
      await tester.pumpAndSettle();
      await shot(tester, '14-itiraz.png', [
        Mark(_key('objection-note'), 1, at: MarkAt.right),
        Mark(find.text('Vazgeç'), 2, at: MarkAt.below),
        Mark(_key('objection-save'), 3, at: MarkAt.below),
      ]);
      await tester.tap(_key('objection-save'));
      await settle(tester);
      tester
          .state<ScaffoldMessengerState>(find.byType(ScaffoldMessenger))
          .clearSnackBars();
      await tester.pumpAndSettle();

      // End QR and stop.
      await scrollTo(tester, _key('session-end-qr'), alignment: 0.5);
      await _qr(tester, 'session-end-qr');
      await scrollTo(tester, _key('session-stop'), alignment: 0.5);
      await tester.tap(_key('session-stop'));
      await settle(tester);
      await tester.pumpAndSettle();
      await scrollTo(
        tester,
        find.textContaining('Kayıt durdu'),
        alignment: 0.1,
      );
      await shot(tester, '18-kayit-durdu.png', [
        Mark(find.textContaining('Kayıt durdu'), 1, at: MarkAt.left),
        Mark(_key('field-instruction'), 2, at: MarkAt.right),
        Mark(_key('session-next'), 3, at: MarkAt.right),
      ]);

      // --- Close-ups.
      await tapVisible(tester, _key('session-next'));
      await tester.pumpAndSettle();
      await tester.tap(_key('tree-t-S5-12'));
      await tester.pumpAndSettle();
      await shot(tester, '20-agac-fotograflar.png', [
        Mark(find.text('Taç (ağacın tamamı)'), 1, at: MarkAt.above),
        Mark(
          find.byKey(const Key('reference-drawing:assets/reference/T.svg')),
          2,
          at: MarkAt.start,
        ),
        Mark(find.textContaining('Böyle çek').first, 3, at: MarkAt.end),
        Mark(_key('shot-T'), 4, at: MarkAt.right),
      ]);

      // Camera: preview, then a blurry picture that is refused.
      await tapVisible(tester, _key('shot-T'));
      await tester.pumpAndSettle();
      await shot(tester, '23-cekim.png', [
        Mark(_key('capture-hint'), 1, at: MarkAt.end),
        Mark(_key('camera-preview'), 2, at: MarkAt.center),
        Mark(_key('camera-shutter'), 3, at: MarkAt.left, dx: -10),
      ]);
      await tester.tap(_key('camera-shutter'));
      await settle(tester);
      await tester.pumpAndSettle();
      await shot(tester, '24-kalite-reddi.png', [
        Mark(_key('review-verdict-reject'), 1, at: MarkAt.end),
        Mark(_key('review-retake'), 2, at: MarkAt.right),
      ]);
      await tester.tap(_key('review-retake'));
      await tester.pumpAndSettle();
      await tester.tap(_key('camera-shutter'));
      await settle(tester);
      await tester.pumpAndSettle();
      await tester.tap(_key('review-use'));
      await tester.pumpAndSettle();
      await settle(tester);
      await shootAndUse(tester, 'K2');
      await shootAndUse(tester, 'K3');
      for (final (q, a) in [
        ('trunk_damage_present', 'false'),
        ('basal_sprout_level', 'few'),
        ('fresh_cut_present', 'false'),
        ('dead_scaffold_present', 'unseen'),
        ('gum_present', 'false'),
      ]) {
        await tapVisible(tester, _key('q-$q-$a'));
        await tester.pump();
      }
      await scrollTo(tester, find.text('Sorular'), alignment: 0.0);
      await shot(tester, '21-agac-sorular.png', [
        Mark(find.textContaining('Gövdede yara'), 1, at: MarkAt.start),
        Mark(_key('q-basal_sprout_level-few'), 2, at: MarkAt.left, dx: 14),
        Mark(_key('q-trunk_damage_present-unseen'), 3, at: MarkAt.start),
      ]);
      await scrollTo(tester, _key('extra-dead_check'), alignment: 0.3);
      await shot(tester, '22-agac-kaydet.png', [
        Mark(_key('extra-dead_check'), 1, at: MarkAt.start),
        Mark(_key('tree-voice'), 2, at: MarkAt.right),
        Mark(_key('tree-save'), 3, at: MarkAt.right),
      ]);
      await tapVisible(tester, _key('tree-save'));
      await settle(tester);
      await tester.pump(const Duration(milliseconds: 500));
      await settle(tester);
      await tester.pumpAndSettle();
      await shot(tester, '19-yakin-plan-listesi.png', [
        Mark(_key('closeup-remaining'), 1, at: MarkAt.start),
        Mark(_key('tree-t-S5-12'), 2, at: MarkAt.right),
        Mark(_key('tree-t-S7-3'), 3, at: MarkAt.right),
        Mark(_key('closeup-finish'), 4, at: MarkAt.right),
      ]);

      // --- Summary, visit record, oral notice.
      await tester.tap(_key('closeup-finish'));
      await settle(tester);
      await tester.pumpAndSettle();
      await settle(tester);
      await _resize(tester, 1300);
      await shot(tester, '25-ziyaret-ozeti.png', [
        Mark(find.text('Kayıt süresi'), 1, at: MarkAt.start),
        Mark(find.text('QR saat işareti'), 2, at: MarkAt.start),
        Mark(find.text('Rota'), 3, at: MarkAt.start),
        Mark(find.text('Kapsama'), 4, at: MarkAt.start),
        Mark(find.text('Yakın plan ağaç'), 5, at: MarkAt.start),
        Mark(_key('summary-visit-log'), 6, at: MarkAt.right),
        Mark(_key('verbal-notice'), 7, at: MarkAt.right),
      ]);

      await tester.tap(_key('summary-visit-log'));
      await tester.pumpAndSettle();
      await _resize(tester, phoneHeight);
      await tester.tap(_key('visit-log-partly_cloudy'));
      await tester.tap(_key('visit-log-light'));
      await tester.enterText(_key('visit-log-temp'), '6');
      await tester.enterText(_key('visit-log-camera'), 'CAM-DENEME-0042');
      await tester.enterText(
        _key('visit-log-issues'),
        'Kaydedici bataryası 10.40 civarı değiştirildi.',
      );
      _unfocus();
      await tester.pumpAndSettle();
      await shot(tester, '26-ziyaret-kaydi.png', [
        Mark(find.text('Gökyüzü'), 1, at: MarkAt.start),
        Mark(find.text('Rüzgâr'), 2, at: MarkAt.start),
        Mark(_key('visit-log-temp'), 3, at: MarkAt.right),
        Mark(_key('visit-log-camera'), 4, at: MarkAt.right),
        Mark(_key('visit-log-issues'), 5, at: MarkAt.right),
        Mark(_key('visit-log-save'), 6, at: MarkAt.right),
      ]);
      await tester.tap(_key('visit-log-save'));
      await settle(tester);
      await tester.pumpAndSettle();
      await settle(tester);

      await tapVisible(tester, _key('verbal-notice-given'));
      await tester.pump();
      await tapVisible(tester, _key('verbal-notice-save'));
      await settle(tester);
      await tester.pumpAndSettle();
      await _resize(tester, 1250);
      await scrollTo(tester, _key('verbal-notice'), alignment: 0.0);
      await shot(tester, '27-sozlu-bilgi.png', [
        Mark(_key('verbal-notice-saved'), 1, at: MarkAt.right),
        Mark(_key('verbal-notice-given'), 2, at: MarkAt.right),
        Mark(_key('verbal-notice-nobody'), 3, at: MarkAt.right),
        Mark(_key('verbal-notice-not_given'), 4, at: MarkAt.right),
        Mark(_key('verbal-notice-save'), 5, at: MarkAt.right),
        Mark(_key('sync-card'), 6, at: MarkAt.right),
        Mark(_key('summary-finish'), 7, at: MarkAt.right),
      ]);
      await h.dispose(tester);
    },
  );

  testWidgets('envanter: sınır ve köşe', skip: kilavuzSkip != null, (
    tester,
  ) async {
    await tester.runAsync(loadFonts);
    phone(tester, height: 1250);
    final h = ShotHarness();
    final controller = h.container.read(sessionControllerProvider.notifier);
    controller.selectTask(inventoryTask);
    h.logger.position = _proj.toGeo(const Enu(-5, -5));
    await tester.runAsync(() async {
      await h.logger.connect();
      expect(await controller.start(), isTrue);
      await controller.qrShown(
        QrMoment.start,
        'OQ1:1:x',
        h.container.read(gpsClockProvider).now(),
      );
    });
    await tester.pumpWidget(h.wrap(const BoundaryScreen()));
    await settle(tester);
    var from = const Enu(-5, -5);
    for (final c in const [
      Enu(-5, -5),
      Enu(77, -5),
      Enu(77, 152),
      Enu(-5, 152),
    ]) {
      await _walk(tester, h, from, c);
      from = c;
      await tester.tap(_key('boundary-corner'));
      await settle(tester);
      h.clock.advance(const Duration(seconds: 20));
    }
    h.logger.tick();
    final corners = h.container.read(sessionControllerProvider).boundary;
    await tester.runAsync(
      () => controller.describeCorner(
        corners.corners.first.eventId,
        note: 'Köşede eski beton direk var.',
        markers: const [BoundaryMarker.stone, BoundaryMarker.fence],
      ),
    );
    await settle(tester);
    await tester.pumpAndSettle();
    await shot(tester, '15-sinir.png', [
      Mark(_key('boundary-fix'), 1, at: MarkAt.end),
      Mark(_key('boundary-corner'), 2, at: MarkAt.right),
      Mark(_key('boundary-map'), 3, at: MarkAt.left, dx: 24),
      Mark(_key('boundary-area'), 4, at: MarkAt.end),
      Mark(_key('corner-0'), 5, at: MarkAt.start),
      Mark(_key('corner-up-1'), 6, at: MarkAt.below),
      Mark(_key('boundary-delete-last'), 7, at: MarkAt.right),
    ]);

    // Corner 2: markers and a note with a phone number (refused).
    await tapVisible(tester, _key('corner-1'));
    await tester.pumpAndSettle();
    await tester.tap(_key('marker-wall'));
    await tester.tap(_key('marker-road'));
    await tester.enterText(
      _key('corner-note'),
      'Duvarın sahibi aranacak: 0555 000 00 12',
    );
    _unfocus();
    await tester.pumpAndSettle();
    await _resize(tester, phoneHeight);
    await shot(tester, '16-kose.png', [
      Mark(find.text('Sınırı ne belirliyor?'), 1, at: MarkAt.start),
      Mark(_key('corner-photo'), 2, at: MarkAt.right),
      Mark(_key('corner-note'), 3, at: MarkAt.right),
      Mark(find.text('Telefon numarası yazmayın'), 4, at: MarkAt.end),
      Mark(_key('corner-save'), 5, at: MarkAt.right),
    ]);
    await tester.pageBack();
    await tester.pumpAndSettle();

    // Who showed the boundary.
    await _type(tester, 'boundary-pointer-name', 'Örnek Kişi');
    await tapVisible(tester, _key('boundary-pointer-role-owner_relative'));
    _unfocus();
    await tester.pumpAndSettle();
    await tapVisible(tester, _key('boundary-pointer-save'));
    await settle(tester);
    await tester.pumpAndSettle();
    await scrollTo(tester, _key('boundary-pointer'), alignment: 0.05);
    await shot(tester, '17-siniri-gosteren-kisi.png', [
      Mark(_key('boundary-pointer-saved'), 1, at: MarkAt.right),
      Mark(_key('boundary-pointer-script'), 2, at: MarkAt.right),
      Mark(_key('boundary-pointer-name'), 3, at: MarkAt.right),
      Mark(_key('boundary-pointer-role-owner'), 4, at: MarkAt.left, dx: 4),
      Mark(_key('boundary-pointer-save'), 5, at: MarkAt.right),
    ]);
    await h.dispose(tester);
  });

  testWidgets('doğrulama turu', skip: kilavuzSkip != null, (tester) async {
    await tester.runAsync(loadFonts);
    phone(tester, height: 1100);
    final h = ShotHarness(server: FakeSyncServer()..offline = true);
    h.logger.position = _proj.toGeo(const Enu(4, 0));
    await tester.runAsync(h.logger.connect);
    await tester.pumpWidget(h.wrap(VerificationTourScreen(task: tourTask)));
    await settle(tester);
    await tester.pumpAndSettle();
    // S2-4: no tree.
    await tester.tap(_key('tour-item-S2-4'));
    await tester.pumpAndSettle();
    await tester.tap(_key('verify-absent'));
    await tester.enterText(_key('verify-note'), 'Yer boş, toprak işlenmiş.');
    _unfocus();
    await tester.pump();
    await tapVisible(tester, _key('verify-save'));
    await settle(tester);
    await tester.pumpAndSettle();
    await settle(tester);
    await shot(tester, '28-dogrulama-turu.png', [
      Mark(_key('tour-progress'), 1, at: MarkAt.end),
      Mark(find.text('Ofisin notu: Envanter doğrulaması'), 2, at: MarkAt.end),
      Mark(find.text('Açık kalemler'), 3, at: MarkAt.end),
      Mark(_key('tour-item-S2-9'), 4, at: MarkAt.end),
      Mark(find.text('Bakılanlar'), 5, at: MarkAt.end),
      Mark(_key('sync-card'), 6, at: MarkAt.right),
      Mark(_key('tour-finish'), 7, at: MarkAt.right),
    ]);
    await _resize(tester, 1000);
    await tester.tap(_key('tour-item-S2-9'));
    await tester.pumpAndSettle();
    await tester.tap(_key('verify-present'));
    await tester.enterText(
      _key('verify-note'),
      'Tek gövde, sağlıklı görünüyor.',
    );
    _unfocus();
    await tester.pumpAndSettle();
    await shot(tester, '29-dogrulama-kalemi.png', [
      Mark(_key('verify-route'), 1, at: MarkAt.start),
      Mark(_key('verify-distance'), 2, at: MarkAt.start),
      Mark(find.textContaining('Neden:'), 3, at: MarkAt.start),
      Mark(_key('verify-present'), 4, at: MarkAt.left, dx: 10),
      Mark(_key('verify-photo'), 5, at: MarkAt.right),
      Mark(_key('verify-note'), 6, at: MarkAt.right),
      Mark(_key('verify-save'), 7, at: MarkAt.right),
    ]);
    await h.dispose(tester);
  });

  testWidgets('ziyaret yapılamadı', skip: kilavuzSkip != null, (tester) async {
    await tester.runAsync(loadFonts);
    phone(tester, height: 1700);
    final h = ShotHarness();
    await tester.pumpWidget(h.wrap(const Scaffold()));
    // Pushed like from the task list, so that "Kaydet" can return.
    tester
        .state<NavigatorState>(find.byType(Navigator))
        .push(
          MaterialPageRoute<bool>(
            builder: (_) => BlockedVisitScreen(task: blockedTask),
          ),
        )
        .ignore();
    await tester.pumpAndSettle();
    await settle(tester);
    await tester.tap(_key('blocked-gate_closed'));
    await tester.pump();
    await tapVisible(tester, _key('blocked-photo'));
    await tester.pumpAndSettle();
    await tester.tap(_key('camera-shutter'));
    await settle(tester);
    await tester.pumpAndSettle();
    await tester.tap(_key('review-use'));
    await tester.pumpAndSettle();
    await settle(tester);
    await _type(tester, 'blocked-note', 'Kapı kilitli, bahçede kimse yok.');
    _unfocus();
    await tester.pumpAndSettle();
    await scrollTo(tester, find.text('Ziyaret yapılamadı'), alignment: 0.0);
    await shot(tester, '05-ziyaret-yapilamadi.png', [
      Mark(_key('blocked-group-customer'), 1, at: MarkAt.end),
      Mark(_key('blocked-group-accessOther'), 2, at: MarkAt.end),
      Mark(_key('blocked-evidence-hint'), 3, at: MarkAt.end),
      Mark(_key('blocked-photo'), 4, at: MarkAt.end),
      Mark(_key('blocked-note'), 5, at: MarkAt.end),
      Mark(_key('blocked-save'), 6, at: MarkAt.end),
    ]);
    // Saved, so that the photo is not dropped while the screen closes.
    await tester.tap(_key('blocked-save'));
    await settle(tester);
    await tester.pumpAndSettle();
    await h.dispose(tester);
  });
}
