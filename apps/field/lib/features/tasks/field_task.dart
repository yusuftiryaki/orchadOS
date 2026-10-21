import '../../core/geo/geo.dart';

/// Kind of visit a task asks for (docs/MVP.md, Modül 2 and 3).
enum VisitKind {
  inventory('inventory', 'Envanter'),
  periodic('periodic', 'Periyodik ziyaret'),

  /// Inventory verification tour (Modül 2, step 9): no recording, the crew
  /// walks to the listed slots and records what is there.
  verification('verification', 'Doğrulama turu');

  const VisitKind(this.code, this.label);
  final String code;
  final String label;

  static VisitKind fromCode(String code) =>
      values.firstWhere((k) => k.code == code);
}

enum Season {
  winter('winter', 'Kış'),
  spring('spring', 'İlkbahar'),
  summer('summer', 'Yaz'),
  harvest('harvest', 'Hasat');

  const Season(this.code, this.label);
  final String code;
  final String label;

  static Season fromCode(String code) =>
      values.firstWhere((s) => s.code == code);

  /// Visit season of a planned day (docs/MVP.md, Modül 3): winter Dec–Feb,
  /// spring Mar–May, summer Jun–Jul, harvest Aug–Nov. The visit row has no
  /// season of its own; March and November, outside the MVP table, go to the
  /// visit that follows or precedes them.
  static Season forDate(DateTime day) => switch (day.month) {
    12 || 1 || 2 => Season.winter,
    3 || 4 || 5 => Season.spring,
    6 || 7 => Season.summer,
    _ => Season.harvest,
  };
}

/// A planting position of the parcel (`public.slot`), for maps, coverage and
/// directions.
class SlotPoint {
  const SlotPoint({
    required this.id,
    required this.code,
    required this.rowNo,
    required this.positionNo,
    this.position,
    this.uncertaintyM,
  });

  final String id;

  /// `S5-12`, `S5-12a`.
  final String code;
  final int rowNo;
  final int positionNo;

  /// Null until the office has located the slot.
  final GeoPoint? position;
  final double? uncertaintyM;

  /// Interstitial slot (code with a letter).
  bool get isInterstitial => !RegExp(r'\d$').hasMatch(code);

  Map<String, Object?> toJson() => {
    'id': id,
    'code': code,
    'row_no': rowNo,
    'position_no': positionNo,
    if (position != null) 'lat': position!.lat,
    if (position != null) 'lon': position!.lon,
    if (uncertaintyM != null) 'uncertainty_m': uncertaintyM,
  };

  factory SlotPoint.fromJson(Map<String, Object?> j) => SlotPoint(
    id: j['id']! as String,
    code: j['code']! as String,
    rowNo: j['row_no']! as int,
    positionNo: j['position_no']! as int,
    position: j['lat'] == null
        ? null
        : GeoPoint(
            (j['lat']! as num).toDouble(),
            (j['lon']! as num).toDouble(),
          ),
    uncertaintyM: (j['uncertainty_m'] as num?)?.toDouble(),
  );
}

/// Why the office put a slot on the verification list
/// (`public.verification_reason`).
enum VerificationReason {
  highUncertainty('high_uncertainty', 'Konum belirsiz'),
  emptySlot('empty_slot', 'Boş yer'),
  unsure('unsure', 'Ofis emin değil'),
  multiStem('multi_stem', 'Çok gövdeli olabilir'),
  possibleSapling('possible_sapling', 'Fidan olabilir'),
  offRow('off_row', 'Sıra dışında'),
  triangulation('triangulation', 'Üçgenleme uyarısı'),
  other('other', 'Diğer');

  const VerificationReason(this.code, this.label);
  final String code;
  final String label;

  static VerificationReason fromCode(String code) =>
      values.firstWhere((r) => r.code == code, orElse: () => other);
}

/// An open item of a verification tour (`public.verification_item`).
class VerificationItem {
  const VerificationItem({
    required this.id,
    required this.slot,
    required this.reasons,
    this.note,
    this.treeId,
  });

  final String id;
  final SlotPoint slot;
  final List<VerificationReason> reasons;

  /// The office's note for the crew.
  final String? note;

  /// Active tree of the slot when the item was created; null = empty slot.
  final String? treeId;

  Map<String, Object?> toJson() => {
    'id': id,
    'slot': slot.toJson(),
    'reasons': [for (final r in reasons) r.code],
    'note': note,
    'tree_id': treeId,
  };

  factory VerificationItem.fromJson(Map<String, Object?> j) => VerificationItem(
    id: j['id']! as String,
    slot: SlotPoint.fromJson((j['slot']! as Map).cast<String, Object?>()),
    reasons: [
      for (final r in j['reasons']! as List)
        VerificationReason.fromCode(r as String),
    ],
    note: j['note'] as String?,
    treeId: j['tree_id'] as String?,
  );
}

/// Walking order of a tour: row by row, along each row (positions, then
/// interstitials after their slot).
List<VerificationItem> sortForWalking(Iterable<VerificationItem> items) =>
    [...items]..sort((a, b) {
      final r = a.slot.rowNo.compareTo(b.slot.rowNo);
      if (r != 0) return r;
      final p = a.slot.positionNo.compareTo(b.slot.positionNo);
      if (p != 0) return p;
      return a.slot.code.compareTo(b.slot.code);
    });

/// A tree the crew should photograph and answer questions about.
class TreeTarget {
  const TreeTarget({
    required this.treeId,
    required this.slotCode,
    required this.reason,
  });

  final String treeId;

  /// Slot code such as `S5-12` (docs/MVP.md, "Kodlama kuralı").
  final String slotCode;

  /// Why the tree is on the list (shown to the crew).
  final String reason;

  Map<String, Object?> toJson() => {
    'tree_id': treeId,
    'slot_code': slotCode,
    'reason': reason,
  };

  factory TreeTarget.fromJson(Map<String, Object?> j) => TreeTarget(
    treeId: j['tree_id']! as String,
    slotCode: j['slot_code']! as String,
    reason: j['reason']! as String,
  );
}

/// One job for today: a parcel and what to do there.
///
/// Holds no owner identity or phone number; those live in a separate schema
/// (KVKK) and are not needed in the field app.
class FieldTask {
  const FieldTask({
    required this.id,
    required this.parcelId,
    required this.parcelName,
    required this.village,
    required this.kind,
    required this.season,
    required this.areaDecare,
    this.closeupTrees = const [],
    this.visitId,
    this.orgId,
    this.plannedDate,
    this.assignedToMe = false,
    this.notes,
    this.slots = const [],
    this.boundary,
    this.verificationItems = const [],
  });

  final String id;
  final String parcelId;
  final String parcelName;
  final String village;
  final VisitKind kind;
  final Season season;
  final double areaDecare;
  final List<TreeTarget> closeupTrees;

  /// Planned visit on the server (`public.session.id`). The recording on the
  /// phone and on the logger uses this id, and the sync fills in that row.
  /// Null for the sample tasks: those get a fresh id that the server does
  /// not know.
  final String? visitId;
  final String? orgId;
  final DateTime? plannedDate;

  /// The visit's lead is the signed-in user.
  final bool assignedToMe;

  /// Notes of the planned visit (`session.notes`).
  final String? notes;

  /// Slots of the parcel with their positions (map, coverage, directions);
  /// empty before the inventory.
  final List<SlotPoint> slots;

  /// Latest boundary version of the parcel (outer ring); null when none.
  final List<GeoPoint>? boundary;

  /// Open items of a verification tour, in walking order.
  final List<VerificationItem> verificationItems;

  bool get isInventory => kind == VisitKind.inventory;
  bool get isVerification => kind == VisitKind.verification;

  Map<String, Object?> toJson() => {
    'id': id,
    'parcel_id': parcelId,
    'parcel_name': parcelName,
    'village': village,
    'kind': kind.code,
    'season': season.code,
    'area_decare': areaDecare,
    'closeup_trees': [for (final t in closeupTrees) t.toJson()],
    'visit_id': visitId,
    'org_id': orgId,
    'planned_date': plannedDate?.toIso8601String(),
    'assigned_to_me': assignedToMe,
    'notes': notes,
    'slots': [for (final sl in slots) sl.toJson()],
    'boundary': boundary == null
        ? null
        : [for (final p in boundary!) p.toJson()],
    'verification_items': [for (final v in verificationItems) v.toJson()],
  };

  factory FieldTask.fromJson(Map<String, Object?> j) => FieldTask(
    id: j['id']! as String,
    parcelId: j['parcel_id']! as String,
    parcelName: j['parcel_name']! as String,
    village: j['village']! as String,
    kind: VisitKind.fromCode(j['kind']! as String),
    season: Season.fromCode(j['season']! as String),
    areaDecare: (j['area_decare']! as num).toDouble(),
    closeupTrees: [
      for (final t in j['closeup_trees']! as List)
        TreeTarget.fromJson((t as Map).cast<String, Object?>()),
    ],
    visitId: j['visit_id'] as String?,
    orgId: j['org_id'] as String?,
    plannedDate: j['planned_date'] == null
        ? null
        : DateTime.parse(j['planned_date']! as String),
    assignedToMe: j['assigned_to_me'] as bool? ?? false,
    notes: j['notes'] as String?,
    slots: [
      for (final sl in j['slots'] as List? ?? const [])
        SlotPoint.fromJson((sl as Map).cast<String, Object?>()),
    ],
    boundary: j['boundary'] == null
        ? null
        : [
            for (final p in j['boundary']! as List)
              GeoPoint.fromJson((p as Map).cast<String, Object?>()),
          ],
    verificationItems: [
      for (final v in j['verification_items'] as List? ?? const [])
        VerificationItem.fromJson((v as Map).cast<String, Object?>()),
    ],
  );
}
