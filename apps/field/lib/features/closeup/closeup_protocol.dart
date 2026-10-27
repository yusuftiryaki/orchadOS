import '../../core/db/field_repository.dart';
import '../tasks/field_task.dart';

/// A photo the crew must take, with a "shoot like this" drawing.
class ShotSpec {
  const ShotSpec({
    required this.code,
    required this.title,
    required this.hint,
    this.required = true,
    this.referenceImage,
  });

  /// Shot code of docs/uzman-ajan-onerileri.md, 4.2 (ASCII: `I2`, not
  /// `İ2`); stored as `capture.shot_code`.
  final String code;
  final String title;
  final String hint;
  final bool required;

  /// Asset path of the "böyle çek" drawing (SVG); null when there is none.
  final String? referenceImage;
}

/// One choice of a [CategoryQuestion]: the stored code and its label.
class CategoryOption {
  const CategoryOption(this.code, this.label);

  final String code;
  final String label;
}

/// A close-up question. Every question also offers "Göremedim"
/// ([UnseenAnswer]); a seen answer becomes a Measurement with source
/// `staff` and metric [metricCode].
sealed class CloseupQuestion {
  const CloseupQuestion({
    required this.metricCode,
    required this.text,
    this.referenceImage,
  });

  final String metricCode;
  final String text;

  /// Asset path of the reference picture; null until provided.
  final String? referenceImage;

  /// The seen answers in display order, with their button labels.
  List<(StaffAnswer, String)> get choices;
}

/// Yes/no question; stored in `value_boolean`.
class YesNoQuestion extends CloseupQuestion {
  const YesNoQuestion({
    required super.metricCode,
    required super.text,
    super.referenceImage,
  });

  @override
  List<(StaffAnswer, String)> get choices => const [
    (YesNoAnswer(true), 'Evet'),
    (YesNoAnswer(false), 'Hayır'),
  ];
}

/// Question with a fixed list of categories; stored in `value_category`.
class CategoryQuestion extends CloseupQuestion {
  const CategoryQuestion({
    required super.metricCode,
    required super.text,
    required this.options,
    super.referenceImage,
  });

  final List<CategoryOption> options;

  @override
  List<(StaffAnswer, String)> get choices => [
    for (final o in options) (CategoryAnswer(o.code), o.label),
  ];
}

/// Extra shots and questions the crew opens only when needed (winter "kuru
/// şüphesi", docs/uzman-ajan-onerileri.md 1.4). Once opened, they are
/// required like the others.
class OptionalBlock {
  const OptionalBlock({
    required this.code,
    required this.label,
    required this.detail,
    required this.shots,
    required this.questions,
  });

  final String code;

  /// Switch label.
  final String label;

  /// Shown under the switch.
  final String detail;
  final List<ShotSpec> shots;
  final List<CloseupQuestion> questions;
}

const _directionHint =
    'Ağacın güney tarafından, kuzeye bakarak; güneş arkanda.';

const _crown = ShotSpec(
  code: 'T',
  title: 'Taç (ağacın tamamı)',
  hint:
      '$_directionHint 6–8 m geri çekil (fidanda 3–4 m), göz hizası, zoom yok. '
      'Ağacın tepesi ve gövdenin dibi kadrajda.',
  referenceImage: 'assets/reference/T.svg',
);

const _deadTestHint =
    '20–30 cm. Kalem kalınlığında dal; kazınan yer ortada, yanında '
    'başparmağın. Her dal başka yönden.';

const _honeydew = YesNoQuestion(
  metricCode: 'honeydew_present',
  text: 'Yapraklar yapışkan ya da parlak mı?',
);

const _sootyMould = YesNoQuestion(
  metricCode: 'sooty_mould_present',
  text: 'Yaprakta siyah is var mı?',
);

/// Close-up shots and questions of one season (docs/uzman-ajan-onerileri.md,
/// 1.5 and 4.2). Shots go from far to near: crown first.
class CloseupProtocol {
  const CloseupProtocol({
    required this.version,
    required this.shots,
    required this.questions,
    this.extra,
  });

  /// Stored as `method_version` on every measurement.
  final String version;
  final List<ShotSpec> shots;
  final List<CloseupQuestion> questions;

  /// Block the crew may open for one tree; null when the season has none.
  final OptionalBlock? extra;

  /// Shots to take with [extra] open or closed.
  List<ShotSpec> shotsWith({required bool extraOpen}) => [
    ...shots,
    if (extraOpen && extra != null) ...extra!.shots,
  ];

  /// Questions to answer with [extra] open or closed.
  List<CloseupQuestion> questionsWith({required bool extraOpen}) => [
    ...questions,
    if (extraOpen && extra != null) ...extra!.questions,
  ];

  static CloseupProtocol forSeason(Season season) => switch (season) {
    Season.winter => winter,
    Season.spring => spring,
    Season.summer => summer,
    Season.harvest => harvest,
  };

  static const winter = CloseupProtocol(
    version: 'winter-v0.1',
    shots: [
      _crown,
      ShotSpec(
        code: 'K2',
        title: 'Gövde ve dip',
        hint:
            '1–1,5 m, telefon diz hizasında, hafif aşağı. Gövdenin güney '
            'yüzü; otu elinle ayır. Kök boğazı, dip sürgünleri ve ilk çatal '
            'kadrajda.',
        referenceImage: 'assets/reference/K2.svg',
      ),
      ShotSpec(
        code: 'K3',
        title: 'Yara ya da dal ucu (yakın)',
        hint:
            '30–50 cm, yüzeye dik. Yara, oyuk ya da reçine ortada, yanına '
            'elini koy. Yara yoksa bir dal ucu ve tomurcuğu.',
        referenceImage: 'assets/reference/K3.svg',
      ),
    ],
    questions: [
      YesNoQuestion(
        metricCode: 'trunk_damage_present',
        text: 'Gövdede yara, oyuk ya da kabuğu kalkmış yer var mı?',
      ),
      CategoryQuestion(
        metricCode: 'basal_sprout_level',
        text: 'Gövdenin dibinden ya da topraktan çıkan ince dallar var mı?',
        options: [
          CategoryOption('none', 'Yok'),
          CategoryOption('few', 'Birkaç'),
          CategoryOption('dense', 'Çok'),
        ],
      ),
      YesNoQuestion(
        metricCode: 'fresh_cut_present',
        text: 'Ağaçta açık renkli, yeni kesilmiş dal yeri var mı?',
      ),
      YesNoQuestion(
        metricCode: 'dead_scaffold_present',
        text: 'Kuru görünen kalın dal (kol) var mı?',
      ),
      YesNoQuestion(
        metricCode: 'gum_present',
        text: 'Gövdede ya da dipte reçine gibi sertleşmiş damla var mı?',
      ),
    ],
    extra: OptionalBlock(
      code: 'dead_check',
      label: 'Bu ağaç kuru görünüyor',
      detail:
          'Farklı yönlerden kalem kalınlığında üç dal seç. Her dalda '
          'tomurcuğa bak, dalı bük, kabuğu tırnağınla 1 cm kazı.',
      shots: [
        ShotSpec(
          code: 'K4_1',
          title: 'Dal ucu testi 1/3',
          hint: _deadTestHint,
          referenceImage: 'assets/reference/K4.svg',
        ),
        ShotSpec(
          code: 'K4_2',
          title: 'Dal ucu testi 2/3',
          hint: _deadTestHint,
          referenceImage: 'assets/reference/K4.svg',
        ),
        ShotSpec(
          code: 'K4_3',
          title: 'Dal ucu testi 3/3',
          hint: _deadTestHint,
          referenceImage: 'assets/reference/K4.svg',
        ),
      ],
      questions: [
        YesNoQuestion(
          metricCode: 'dead_test_no_buds',
          text: 'Baktığın üç dal ucunun hiçbirinde dolgun tomurcuk yok mu?',
        ),
        YesNoQuestion(
          metricCode: 'dead_test_snaps',
          text: "Üç ince dal da bükülünce esnemeden 'çıt' diye kırılıyor mu?",
        ),
        YesNoQuestion(
          metricCode: 'dead_test_brown_cambium',
          text: 'Üç dalda da kazınan kabuğun altı kahverengi ve kuru mu?',
        ),
      ],
    ),
  );

  static const spring = CloseupProtocol(
    version: 'spring-v0.1',
    shots: [
      _crown,
      ShotSpec(
        code: 'I2',
        title: 'Çiçek ya da sürgün salkımı',
        hint:
            '20–30 cm, salkım hizasında, yandan. Tek salkım ve bağlı olduğu '
            'dal; arkasına avucunu tut. Gökyüzüne karşı çekme.',
        referenceImage: 'assets/reference/I2.svg',
      ),
      ShotSpec(
        code: 'I3',
        title: 'Yaprak',
        hint:
            '20–30 cm, dalda (koparma), flaş yok. Bileşik yaprağın tamamı; '
            'yaprağı çevirip alt yüzünü de göster.',
        referenceImage: 'assets/reference/leaf.svg',
      ),
    ],
    questions: [
      YesNoQuestion(
        metricCode: 'flower_cluster_present',
        text: 'Ağaçta çiçek salkımı var mı?',
      ),
      YesNoQuestion(
        metricCode: 'pollen_present',
        text: 'Salkıma dokununca eline sarı toz bulaşıyor mu?',
      ),
      YesNoQuestion(
        metricCode: 'frost_damage_present',
        text: 'Kararmış ya da kurumuş salkım veya sürgün var mı?',
      ),
      YesNoQuestion(
        metricCode: 'shoot_tip_dieback_present',
        text: 'Ucu kurumuş genç sürgün var mı?',
      ),
      _honeydew,
      _sootyMould,
    ],
  );

  static const summer = CloseupProtocol(
    version: 'summer-v0.1',
    shots: [
      _crown,
      ShotSpec(
        code: 'Y2',
        title: 'Meyve salkımı',
        hint:
            '30 cm, salkım hizasında. Tacın dış ve güney yanında ilk '
            'gördüğün salkım; salkım ve sapı tam, meyveler net. Sıkma, '
            'koparma.',
        referenceImage: 'assets/reference/Y2.svg',
      ),
      ShotSpec(
        code: 'Y3_upper',
        title: 'Yaprak (üst yüz)',
        hint:
            '20–30 cm, dalda (koparma), flaş yok. Bileşik yaprağın tamamı, '
            'üst yüzü.',
        referenceImage: 'assets/reference/leaf.svg',
      ),
      ShotSpec(
        code: 'Y3_lower',
        title: 'Yaprak (alt yüz)',
        hint: 'Aynı yaprağı çevir: alt yüzü ve yaprak ucu kadrajda.',
        referenceImage: 'assets/reference/leaf.svg',
      ),
    ],
    questions: [
      YesNoQuestion(
        metricCode: 'fruit_present',
        text: 'Ağaçta meyve salkımı var mı?',
      ),
      _honeydew,
      YesNoQuestion(
        metricCode: 'white_flakes_present',
        text:
            'Yapraklarda ya da ağaç altında beyaz, şeker tanesi gibi pul '
            'var mı?',
      ),
      _sootyMould,
      YesNoQuestion(
        metricCode: 'green_fruit_drop_present',
        text: 'Ağaç altında çok sayıda dökülmüş yeşil meyve var mı?',
      ),
      YesNoQuestion(
        metricCode: 'dried_leaves_attached',
        text: 'Dallarda kurumuş, kahverengi yapraklar asılı mı?',
      ),
    ],
  );

  static const harvest = CloseupProtocol(
    version: 'harvest-v0.1',
    shots: [
      _crown,
      ShotSpec(
        code: 'H2',
        title: 'Kırık dal (varsa)',
        hint:
            'Kırık dal yoksa atla. 1–2 m, göğüs hizası. Kırık yer ve dalın '
            'gövdeye bağlandığı yer aynı karede.',
        required: false,
        referenceImage: 'assets/reference/H2.svg',
      ),
      ShotSpec(
        code: 'H3',
        title: 'Ağaç altı',
        hint:
            'Gövdeden 2–3 m, göğüs hizası, telefon 45° aşağı. Tacın '
            'altındaki toprak ve gövde dibi; gökyüzü görünmesin.',
        referenceImage: 'assets/reference/H3.svg',
      ),
    ],
    questions: [
      YesNoQuestion(
        metricCode: 'harvest_complete',
        text: 'Ağaçtaki salkımların hepsi toplanmış mı?',
      ),
      YesNoQuestion(
        metricCode: 'branch_break',
        text: 'Kırık ya da yarılmış dal var mı?',
      ),
      YesNoQuestion(
        metricCode: 'debris_under_tree_present',
        text: 'Ağaç altında yaprak, sap ya da kopmuş dal yığını var mı?',
      ),
      YesNoQuestion(
        metricCode: 'dry_weeds_present',
        text: 'Ağacın çevresinde diz boyunu aşan kuru ot ya da yığın var mı?',
      ),
    ],
  );
}
