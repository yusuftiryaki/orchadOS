/// Kind of visit a task asks for (docs/MVP.md, Modül 2 and 3).
enum VisitKind {
  inventory('inventory', 'Envanter'),
  periodic('periodic', 'Periyodik ziyaret');

  const VisitKind(this.code, this.label);
  final String code;
  final String label;
}

enum Season {
  winter('winter', 'Kış'),
  spring('spring', 'İlkbahar'),
  summer('summer', 'Yaz'),
  harvest('harvest', 'Hasat');

  const Season(this.code, this.label);
  final String code;
  final String label;
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
  });

  final String id;
  final String parcelId;
  final String parcelName;
  final String village;
  final VisitKind kind;
  final Season season;
  final double areaDecare;
  final List<TreeTarget> closeupTrees;

  bool get isInventory => kind == VisitKind.inventory;
}
