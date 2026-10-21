import '../tasks/field_task.dart';

/// A photo the crew must take, with a "shoot like this" example.
class ShotSpec {
  const ShotSpec({
    required this.code,
    required this.title,
    required this.hint,
    this.required = true,
    this.referenceImage,
  });

  final String code;
  final String title;
  final String hint;
  final bool required;

  /// Asset path of the example photo; null until the methodology provides it.
  final String? referenceImage;
}

/// A yes/no observation question. The answer becomes a Measurement with
/// source `staff` and metric [metricCode].
class YesNoQuestion {
  const YesNoQuestion({
    required this.metricCode,
    required this.text,
    this.referenceImage,
  });

  final String metricCode;
  final String text;

  /// Asset path of the reference picture; null until provided.
  final String? referenceImage;
}

/// Close-up shots and questions of one season (docs/MVP.md, Modül 3).
class CloseupProtocol {
  const CloseupProtocol({
    required this.version,
    required this.shots,
    required this.questions,
  });

  /// Stored as `method_version` on every measurement.
  final String version;
  final List<ShotSpec> shots;
  final List<YesNoQuestion> questions;

  /// Draft question sets; the methodology document (İP10) will replace them.
  static CloseupProtocol forSeason(Season season) => switch (season) {
    Season.winter => const CloseupProtocol(
      version: 'winter-v0',
      shots: [
        ShotSpec(
          code: 'trunk',
          title: 'Gövde',
          hint: 'Gövdeyi dipten ilk dallara kadar çek',
        ),
        ShotSpec(
          code: 'cuts',
          title: 'Kesim yerleri',
          hint: 'Budama kesimlerini yakından çek',
        ),
        ShotSpec(
          code: 'crown',
          title: 'Taç',
          hint: 'Ağacın tamamı kadrajda olsun',
          required: false,
        ),
      ],
      questions: [
        YesNoQuestion(
          metricCode: 'dead_branch_present',
          text: 'Kuru dal var mı?',
        ),
        YesNoQuestion(
          metricCode: 'trunk_damage_present',
          text: 'Gövdede yara, oyuk ya da kabuk soyulması var mı?',
        ),
        YesNoQuestion(
          metricCode: 'root_sucker_present',
          text: 'Dipte sürgün var mı?',
        ),
        YesNoQuestion(metricCode: 'pruned', text: 'Bu kış budanmış mı?'),
      ],
    ),
    Season.spring => const CloseupProtocol(
      version: 'spring-v0',
      shots: [
        ShotSpec(code: 'flowers', title: 'Çiçek', hint: 'Çiçek salkımını çek'),
        ShotSpec(code: 'shoots', title: 'Sürgün', hint: 'Genç sürgünleri çek'),
      ],
      questions: [
        YesNoQuestion(
          metricCode: 'frost_damage_present',
          text: 'Don hasarı var mı?',
        ),
        YesNoQuestion(
          metricCode: 'pest_sign_present',
          text: 'Zararlı belirtisi var mı?',
        ),
        YesNoQuestion(
          metricCode: 'dead_branch_present',
          text: 'Kuru dal var mı?',
        ),
      ],
    ),
    Season.summer => const CloseupProtocol(
      version: 'summer-v0',
      shots: [
        ShotSpec(code: 'cluster', title: 'Salkım', hint: 'Meyve salkımını çek'),
        ShotSpec(code: 'crown', title: 'Taç', hint: 'Ağacın tamamını çek'),
      ],
      questions: [
        YesNoQuestion(
          metricCode: 'fruit_present',
          text: 'Ağaçta meyve var mı?',
        ),
        YesNoQuestion(
          metricCode: 'pest_sign_present',
          text: 'Zararlı belirtisi var mı?',
        ),
        YesNoQuestion(
          metricCode: 'drought_stress_sign',
          text: 'Kuraklık belirtisi var mı?',
        ),
      ],
    ),
    Season.harvest => const CloseupProtocol(
      version: 'harvest-v0',
      shots: [
        ShotSpec(
          code: 'broken',
          title: 'Dal kırıkları',
          hint: 'Kırık dalları çek',
        ),
        ShotSpec(code: 'crown', title: 'Taç', hint: 'Ağacın tamamını çek'),
      ],
      questions: [
        YesNoQuestion(
          metricCode: 'harvest_complete',
          text: 'Hasat tamamlanmış mı?',
        ),
        YesNoQuestion(metricCode: 'branch_break', text: 'Kırık dal var mı?'),
        YesNoQuestion(
          metricCode: 'theft_sign_present',
          text: 'Hırsızlık izi var mı?',
        ),
      ],
    ),
  };
}
