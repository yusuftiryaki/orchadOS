import 'dart:convert';

import 'package:crypto/crypto.dart';

import 'field_task.dart';

/// An active tree of the parcel, as downloaded with the task.
class ParcelTree {
  const ParcelTree({
    required this.treeId,
    required this.slotCode,
    required this.rowNo,
    required this.positionNo,
    this.latestClass,
  });

  final String treeId;
  final String slotCode;
  final int rowNo;
  final int positionNo;

  /// Overall class of the newest assessment (`tree_latest_assessment`).
  final String? latestClass;
}

const _flaggedReasons = {
  'attention': 'Önceki ziyarette Dikkat',
  'problem': 'Önceki ziyarette Sorunlu',
  'dead': 'Önceki ziyarette Kuru',
};

/// Close-up trees of a periodic visit (docs/metodoloji.md, section 7):
/// 1. trees whose latest class is attention, problem or dead;
/// 2. a random sample of [sampleShare] of the parcel's trees from the rest.
///
/// The sample is drawn from a hash of visit and tree id, so every phone
/// that downloads the visit gets the same list. Simplification: the
/// methodology stratifies the sample over 10×10 m cells; this draw is not
/// stratified (rows are spread evenly by the hash in practice). Trees the
/// crew flags during the scan and the expert's requests are not on the
/// server yet.
List<TreeTarget> selectCloseupTrees(
  List<ParcelTree> trees, {
  required String visitId,
  double sampleShare = 0.10,
}) {
  int bySlot(ParcelTree a, ParcelTree b) {
    final r = a.rowNo.compareTo(b.rowNo);
    if (r != 0) return r;
    final p = a.positionNo.compareTo(b.positionNo);
    return p != 0 ? p : a.slotCode.compareTo(b.slotCode);
  }

  final flagged = [
    for (final t in trees)
      if (_flaggedReasons.containsKey(t.latestClass)) t,
  ]..sort(bySlot);
  final flaggedIds = {for (final t in flagged) t.treeId};

  String draw(ParcelTree t) =>
      sha256.convert(utf8.encode('$visitId/${t.treeId}')).toString();
  final rest = [
    for (final t in trees)
      if (!flaggedIds.contains(t.treeId)) t,
  ]..sort((a, b) => draw(a).compareTo(draw(b)));
  final sampleSize = trees.isEmpty ? 0 : (trees.length * sampleShare).ceil();
  final sample = rest.take(sampleSize).toList()..sort(bySlot);

  return [
    for (final t in flagged)
      TreeTarget(
        treeId: t.treeId,
        slotCode: t.slotCode,
        reason: _flaggedReasons[t.latestClass]!,
      ),
    for (final t in sample)
      TreeTarget(
        treeId: t.treeId,
        slotCode: t.slotCode,
        reason: 'Rastgele örneklem',
      ),
  ];
}

/// Crew-facing text of the server's reasons (`closeup_list`, docs/arayuzler.md
/// "Yakın plan listesi ve uzman istekleri").
const closeupReasonLabels = {
  'previous_class': 'Önceki ziyarette dikkat/sorunlu/kuru',
  'sample': 'Rastgele örneklem',
  'staff_problem': 'Sorun gördüm',
  'expert_request': 'Uzman istedi',
};

/// Close-up list from the rows of `rpc/closeup_list` (already in slot order).
List<TreeTarget> closeupTargetsFromServer(List<Map<String, Object?>> rows) => [
  for (final r in rows)
    if (r['tree_id'] is String)
      TreeTarget(
        treeId: r['tree_id']! as String,
        slotCode: r['slot_code'] as String? ?? '',
        reason: [
          for (final reason in (r['reasons'] as List?) ?? const [])
            closeupReasonLabels[reason] ?? '$reason',
        ].join(' · '),
      ),
];

/// The list with the trees the crew marked "Sorun gördüm" on this phone and
/// that the server does not know yet (offline marks), appended at the end.
List<TreeTarget> withProblemMarks(
  List<TreeTarget> list,
  Iterable<TreeTarget> marked,
) {
  final have = {for (final t in list) t.treeId};
  return [
    ...list,
    for (final t in marked)
      if (have.add(t.treeId))
        TreeTarget(
          treeId: t.treeId,
          slotCode: t.slotCode,
          reason: closeupReasonLabels['staff_problem']!,
        ),
  ];
}
