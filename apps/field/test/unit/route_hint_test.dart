import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/core/geo/geo.dart';
import 'package:orchados_field/features/tasks/field_task.dart';
import 'package:orchados_field/features/tasks/sample_parcel.dart';
import 'package:orchados_field/features/verification/route_hint.dart';

void main() {
  final slots = sampleSlots(idPrefix: 'p', rows: 6, positions: 15);
  SlotPoint slot(String code) => slots.firstWhere((s) => s.code == code);
  final proj = LocalProjection(sampleOrigin);

  group('describeRoute', () {
    test('counts from the end where position 1 is', () {
      // Sample rows run north–south with position 1 at the south end.
      expect(rowStart(5, slots), Compass.south);
      expect(
        describeRoute(slot('S5-12'), slots),
        'S5 sırasında, güneyden 12. yer',
      );
    });

    test('rows numbered from the north count from the north', () {
      final flipped = [
        for (final s in slots)
          SlotPoint(
            id: s.id,
            code: s.code,
            rowNo: s.rowNo,
            positionNo: s.positionNo,
            position: proj.toGeo(Enu(s.rowNo * 8.0, -s.positionNo * 7.0)),
          ),
      ];
      expect(
        describeRoute(flipped.firstWhere((s) => s.code == 'S2-3'), flipped),
        'S2 sırasında, kuzeyden 3. yer',
      );
    });

    test('rows running east–west', () {
      final eastWest = [
        for (var p = 1; p <= 5; p++)
          SlotPoint(
            id: 's$p',
            code: 'S1-$p',
            rowNo: 1,
            positionNo: p,
            position: proj.toGeo(Enu(-p * 7.0, 0)),
          ),
      ];
      expect(
        describeRoute(eastWest[3], eastWest),
        'S1 sırasında, doğudan 4. yer',
      );
    });

    test('interstitial slot lies between two positions', () {
      const a = SlotPoint(id: 'x', code: 'S5-12a', rowNo: 5, positionNo: 12);
      expect(a.isInterstitial, isTrue);
      expect(slot('S5-12').isInterstitial, isFalse);
      expect(
        describeRoute(a, slots),
        'S5 sırasında, güneyden 12. ile 13. yer arasında',
      );
    });

    test('without located slots: count from the row start', () {
      const s = SlotPoint(id: 'x', code: 'S3-7', rowNo: 3, positionNo: 7);
      expect(rowStart(3, [s]), isNull);
      expect(describeRoute(s, [s]), 'S3 sırasında, sıra başından 7. yer');
    });
  });

  group('describeDistance', () {
    test('distance and direction to the slot', () {
      final target = slot('S1-1').position!;
      final here = proj.toGeo(const Enu(-30, -40));
      // 50 m, bearing atan2(30, 40) = 36.9° → north-east.
      expect(describeDistance(here, target), '50 m kuzeydoğuda');
      expect(
        describeDistance(proj.toGeo(const Enu(20, 0)), target),
        '20 m batıda',
      );
    });

    test('close enough', () {
      final target = slot('S1-1').position!;
      expect(
        describeDistance(proj.toGeo(const Enu(1, 1)), target),
        'Buradasınız (1 m)',
      );
    });

    test('nothing without a position', () {
      expect(describeDistance(null, slot('S1-1').position), isNull);
      expect(describeDistance(sampleOrigin, null), isNull);
    });
  });

  group('verification items', () {
    test('walking order: row, position, interstitial after its slot', () {
      VerificationItem item(String code, int row, int pos) => VerificationItem(
        id: code,
        slot: SlotPoint(id: code, code: code, rowNo: row, positionNo: pos),
        reasons: const [VerificationReason.unsure],
      );
      final sorted = sortForWalking([
        item('S5-12a', 5, 12),
        item('S2-9', 2, 9),
        item('S5-12', 5, 12),
        item('S2-10', 2, 10),
        item('S10-1', 10, 1),
      ]);
      expect(
        [for (final i in sorted) i.id],
        ['S2-9', 'S2-10', 'S5-12', 'S5-12a', 'S10-1'],
      );
    });

    test('task JSON keeps items, slots and boundary', () {
      final task = FieldTask(
        id: 'tour-1',
        visitId: 'tour-1',
        parcelId: 'P-12',
        parcelName: 'Örnek',
        village: 'Köy',
        kind: VisitKind.verification,
        season: Season.winter,
        areaDecare: 20,
        notes: 'Sabah',
        slots: [slot('S2-4'), slot('S2-9')],
        boundary: sampleBoundary(rows: 6, positions: 15),
        verificationItems: [
          VerificationItem(
            id: 'vi-1',
            slot: slot('S2-4'),
            reasons: const [
              VerificationReason.emptySlot,
              VerificationReason.possibleSapling,
            ],
            note: 'Fidan?',
          ),
        ],
      );
      final back = FieldTask.fromJson(task.toJson());
      expect(back.isVerification, isTrue);
      expect(back.notes, 'Sabah');
      expect(back.slots.map((s) => s.code), ['S2-4', 'S2-9']);
      expect(back.slots.first.position, slot('S2-4').position);
      expect(back.boundary, hasLength(4));
      final item = back.verificationItems.single;
      expect(item.slot.code, 'S2-4');
      expect(item.reasons, [
        VerificationReason.emptySlot,
        VerificationReason.possibleSapling,
      ]);
      expect(item.note, 'Fidan?');
      expect(item.treeId, isNull);
      expect(
        VerificationReason.fromCode('new_reason'),
        VerificationReason.other,
      );
    });
  });
}
