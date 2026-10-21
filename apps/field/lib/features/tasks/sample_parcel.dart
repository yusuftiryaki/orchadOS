import '../../core/geo/geo.dart';
import 'field_task.dart';

// A synthetic orchard for the sample tasks and the FAKE_GNSS demo: a grid of
// rows running north–south near Gaziantep. Not a real parcel.

/// South-west corner of the sample grid (position 1 of row 1).
const GeoPoint sampleOrigin = GeoPoint(37.0662, 37.3833);

const double sampleRowSpacingM = 8;
const double sampleTreeSpacingM = 7;

final LocalProjection _proj = LocalProjection(sampleOrigin);

/// Slots of [rows] rows with [positions] positions each; position 1 is at
/// the south end, rows are numbered west to east. Ids are `<prefix>-S<r>-<p>`.
List<SlotPoint> sampleSlots({
  required String idPrefix,
  int rows = 10,
  int positions = 22,
}) => [
  for (var r = 1; r <= rows; r++)
    for (var p = 1; p <= positions; p++)
      SlotPoint(
        id: '$idPrefix-S$r-$p',
        code: 'S$r-$p',
        rowNo: r,
        positionNo: p,
        position: _proj.toGeo(
          Enu((r - 1) * sampleRowSpacingM, (p - 1) * sampleTreeSpacingM),
        ),
        uncertaintyM: 0.3,
      ),
];

/// Rectangle around the grid with [marginM] metres on each side.
List<GeoPoint> sampleBoundary({
  int rows = 10,
  int positions = 22,
  double marginM = 5,
}) {
  final e = (rows - 1) * sampleRowSpacingM + marginM;
  final n = (positions - 1) * sampleTreeSpacingM + marginM;
  return [
    _proj.toGeo(Enu(-marginM, -marginM)),
    _proj.toGeo(Enu(e, -marginM)),
    _proj.toGeo(Enu(e, n)),
    _proj.toGeo(Enu(-marginM, n)),
  ];
}

/// Demo walk for the fake logger: up and down the corridors between rows
/// (along the rows), then across them, at [speedMps]; loops.
GeoPoint Function(DateTime now) sampleWalk({
  required DateTime start,
  int rows = 10,
  int positions = 22,
  double speedMps = 1.2,
}) {
  final length = (positions - 1) * sampleTreeSpacingM;
  final width = (rows - 1) * sampleRowSpacingM;
  final waypoints = <Enu>[];
  // Along: corridors between rows, alternating direction.
  for (var c = 0; c <= rows; c++) {
    final e = (c - 0.5) * sampleRowSpacingM;
    final ends = [Enu(e, -3), Enu(e, length + 3)];
    waypoints.addAll(c.isEven ? ends : ends.reversed);
  }
  // Across: between positions, every second gap.
  for (var g = 0; g < positions; g += 2) {
    final n = (g + 0.5) * sampleTreeSpacingM;
    final ends = [Enu(width + 4, n), Enu(-4, n)];
    waypoints.addAll((g ~/ 2).isEven ? ends : ends.reversed);
  }
  final legs = <double>[];
  var total = 0.0;
  for (var i = 1; i < waypoints.length; i++) {
    final d = (waypoints[i] - waypoints[i - 1]).length;
    legs.add(d);
    total += d;
  }
  return (now) {
    var s = (now.difference(start).inMilliseconds / 1000 * speedMps) % total;
    for (var i = 0; i < legs.length; i++) {
      if (s <= legs[i]) {
        final a = waypoints[i];
        final b = waypoints[i + 1];
        return _proj.toGeo(a + (b - a) * (s / legs[i]));
      }
      s -= legs[i];
    }
    return _proj.toGeo(waypoints.last);
  };
}
