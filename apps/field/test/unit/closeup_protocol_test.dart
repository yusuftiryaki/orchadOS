import 'dart:io';

import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/core/db/database.dart';
import 'package:orchados_field/core/db/field_repository.dart';
import 'package:orchados_field/core/sync/sync_rows.dart';
import 'package:orchados_field/features/closeup/closeup_protocol.dart';
import 'package:orchados_field/features/tasks/field_task.dart';

import '../../tool/reference_drawings.dart' as drawings;

void main() {
  List<String> codes(CloseupProtocol p) => [
    for (final q in p.questions) q.metricCode,
  ];
  List<String> shots(CloseupProtocol p) => [for (final s in p.shots) s.code];

  test('protocol versions (methodology v0.2)', () {
    expect(
      [for (final s in Season.values) CloseupProtocol.forSeason(s).version],
      ['winter-v0.2', 'spring-v0.1', 'summer-v0.2', 'harvest-v0.1'],
    );
  });

  test('shots go from far to near, crown first', () {
    expect(shots(CloseupProtocol.winter), ['T', 'K2', 'K3']);
    expect(shots(CloseupProtocol.spring), ['T', 'I2', 'I3']);
    expect(shots(CloseupProtocol.summer), ['T', 'Y2', 'Y3_upper', 'Y3_lower']);
    expect(shots(CloseupProtocol.harvest), ['T', 'H2', 'H3']);
    // The broken branch is shot only when there is one.
    final h2 = CloseupProtocol.harvest.shots[1];
    expect(h2.required, isFalse);
    for (final s in Season.values) {
      final p = CloseupProtocol.forSeason(s);
      expect(p.shots.first.hint, contains('güney tarafından, kuzeye bakarak'));
    }
  });

  test('question metric codes', () {
    expect(codes(CloseupProtocol.winter), [
      'trunk_damage_present',
      'basal_sprout_level',
      'fresh_cut_present',
      'dead_scaffold_present',
      'gum_present',
    ]);
    expect(codes(CloseupProtocol.spring), [
      'flower_cluster_present',
      'pollen_present',
      'frost_damage_present',
      'shoot_tip_dieback_present',
      'honeydew_present',
      'sooty_mould_present',
    ]);
    expect(codes(CloseupProtocol.summer), [
      'fruit_present',
      'honeydew_present',
      'white_flakes_present',
      'sooty_mould_present',
      'green_fruit_drop_present',
      'dried_leaves_attached',
      'early_emptied_cluster_present',
    ]);
    expect(codes(CloseupProtocol.harvest), [
      'harvest_complete',
      'branch_break',
      'debris_under_tree_present',
      'dry_weeds_present',
    ]);
  });

  test('parcel questions: the fence gap, summer only', () {
    expect(
      [
        for (final q in CloseupProtocol.summer.parcelQuestions)
          (q.metricCode, q.text),
      ],
      [('fence_breach_present', 'Tel ya da çitte yeni açılmış geçit var mı?')],
    );
    for (final s in [Season.winter, Season.spring, Season.harvest]) {
      expect(CloseupProtocol.forSeason(s).parcelQuestions, isEmpty);
    }
  });

  test('basal sprouts is a category question', () {
    final q = CloseupProtocol.winter.questions[1] as CategoryQuestion;
    expect(q.metricCode, 'basal_sprout_level');
    expect(
      [for (final o in q.options) (o.code, o.label)],
      [('none', 'Yok'), ('few', 'Birkaç'), ('dense', 'Çok')],
    );
    expect(q.choices.first.$1, const CategoryAnswer('none'));
    final yesNo = CloseupProtocol.winter.questions.first;
    expect([for (final c in yesNo.choices) c.$2], ['Evet', 'Hayır']);
  });

  test('winter dead check: three branches, three tests, closed by default', () {
    final p = CloseupProtocol.winter;
    final extra = p.extra!;
    expect(extra.label, 'Bu ağaç kuru görünüyor');
    expect([for (final s in extra.shots) s.code], ['K4_1', 'K4_2', 'K4_3']);
    expect(
      [for (final q in extra.questions) q.metricCode],
      ['dead_test_live_bud', 'dead_test_snaps', 'dead_test_brown_cambium'],
    );
    expect(p.shotsWith(extraOpen: false), p.shots);
    expect(p.shotsWith(extraOpen: true), hasLength(6));
    expect(p.questionsWith(extraOpen: true), hasLength(8));
    for (final s in [Season.spring, Season.summer, Season.harvest]) {
      expect(CloseupProtocol.forSeason(s).extra, isNull);
    }
  });

  test('every shot has a drawing that is a declared, parsable asset', () async {
    final pubspec = File('pubspec.yaml').readAsStringSync();
    expect(pubspec, contains('- assets/reference/'));
    final paths = <String>{
      for (final s in Season.values)
        for (final shot in CloseupProtocol.forSeason(
          s,
        ).shotsWith(extraOpen: true))
          shot.referenceImage!,
    };
    expect(paths, hasLength(9));
    for (final path in paths) {
      final svg = File(path).readAsStringSync();
      expect(svg, contains('Nereden çekilir'));
      expect(svg, contains('Yanlış:'));
      final info = await vg.loadPicture(SvgStringLoader(svg), null);
      expect(info.size.width, 360, reason: path);
      expect(info.size.height, 600, reason: path);
      info.picture.dispose();
    }
  });

  test('committed drawings match the generator', () {
    for (final shot in drawings.shots) {
      expect(
        File('assets/reference/${shot.name}.svg').readAsStringSync(),
        drawings.render(shot),
        reason: 'run dart run tool/reference_drawings.dart (${shot.name})',
      );
    }
  });

  test('a category answer syncs as value_category, yes/no as boolean', () {
    MeasurementRow row({bool? b, String? t}) => MeasurementRow(
      id: 'm-1',
      sessionId: 's-1',
      subjectType: 'tree',
      subjectId: 't-1',
      metricCode: 'basal_sprout_level',
      valueBoolean: b,
      valueText: t,
      method: closeupQuestionMethod,
      methodVersion: 'winter-v0.1',
      source: 'staff',
      measuredAt: DateTime.utc(2026, 12, 3),
      evidenceJson: '[]',
    );
    final category = measurementRow(
      row(t: 'dense'),
      orgId: 'o',
      parcelId: 'p',
      metricDefinitionId: 'md',
    );
    expect(category['value_category'], 'dense');
    expect(category.containsKey('value_boolean'), isFalse);
    final yesNo = measurementRow(
      row(b: false),
      orgId: 'o',
      parcelId: 'p',
      metricDefinitionId: 'md',
    );
    expect(yesNo['value_boolean'], isFalse);
    expect(yesNo.containsKey('value_category'), isFalse);
  });
}
