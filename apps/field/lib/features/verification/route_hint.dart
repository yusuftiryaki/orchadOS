import '../../core/geo/geo.dart';
import '../tasks/field_task.dart';

// Directions to a slot for the verification tour. The crew finds a slot by
// its code and by counting along the row (docs/MVP.md, Modül 2, step 9); the
// distance and bearing help only when the logger sends a position.

/// Which end of the row position 1 is at, e.g. [Compass.south]; null when
/// the row has fewer than two located slots.
Compass? rowStart(int rowNo, List<SlotPoint> parcelSlots) {
  SlotPoint? first;
  SlotPoint? last;
  for (final s in parcelSlots) {
    if (s.rowNo != rowNo || s.position == null || s.isInterstitial) continue;
    if (first == null || s.positionNo < first.positionNo) first = s;
    if (last == null || s.positionNo > last.positionNo) last = s;
  }
  if (first == null || last == null || first.positionNo == last.positionNo) {
    return null;
  }
  return Compass.of(bearingDeg(last.position!, first.position!));
}

/// "S5 sırasında, güneyden 12. yer". Interstitial slots (S5-12a) lie between
/// two positions: "S5 sırasında, güneyden 12. ile 13. yer arasında".
String describeRoute(SlotPoint slot, List<SlotPoint> parcelSlots) {
  final start = rowStart(slot.rowNo, parcelSlots);
  final from = start == null ? 'sıra başından' : start.from;
  final n = slot.positionNo;
  final where = slot.isInterstitial
      ? '$n. ile ${n + 1}. yer arasında'
      : '$n. yer';
  return 'S${slot.rowNo} sırasında, $from $where';
}

/// "38 m kuzeydoğuda"; "Buradasınız" within [hereM]. Null without both
/// positions.
String? describeDistance(GeoPoint? here, GeoPoint? target, {double hereM = 3}) {
  if (here == null || target == null) return null;
  final d = distanceM(here, target);
  if (d < hereM) return 'Buradasınız (${d.round()} m)';
  final dir = Compass.of(bearingDeg(here, target));
  return '${d.round()} m ${dir.at}';
}
