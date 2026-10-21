/// Kind of visit a task asks for (docs/MVP.md, Modül 2 and 3).
enum VisitKind {
  inventory('inventory', 'Envanter'),
  periodic('periodic', 'Periyodik ziyaret');

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

  bool get isInventory => kind == VisitKind.inventory;

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
  );
}
