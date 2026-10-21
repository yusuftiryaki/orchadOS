import 'dart:math' as math;

// Plane geometry at orchard scale (a few hundred metres): points are
// projected to a local east/north plane around a reference point
// (equirectangular). Over 1 km the error is far below the GNSS accuracy the
// app works with; survey-grade positions come from the pipeline (PPK).

const double _earthRadiusM = 6371008.8;

double _rad(double deg) => deg * math.pi / 180;

/// A WGS84 position (degrees).
class GeoPoint {
  const GeoPoint(this.lat, this.lon);

  final double lat;
  final double lon;

  /// `[lon, lat]` GeoJSON coordinates; null when malformed.
  static GeoPoint? fromCoordinates(Object? c) {
    if (c is! List || c.length < 2) return null;
    final lon = c[0];
    final lat = c[1];
    if (lon is! num || lat is! num) return null;
    return GeoPoint(lat.toDouble(), lon.toDouble());
  }

  /// GeoJSON `Point` (as PostgREST returns geometry columns); null otherwise.
  static GeoPoint? fromGeoJson(Object? g) {
    if (g is! Map || g['type'] != 'Point') return null;
    return fromCoordinates(g['coordinates']);
  }

  Map<String, Object?> toJson() => {'lat': lat, 'lon': lon};

  static GeoPoint fromJson(Map<String, Object?> j) =>
      GeoPoint((j['lat']! as num).toDouble(), (j['lon']! as num).toDouble());

  @override
  bool operator ==(Object other) =>
      other is GeoPoint && other.lat == lat && other.lon == lon;

  @override
  int get hashCode => Object.hash(lat, lon);

  @override
  String toString() => 'GeoPoint($lat, $lon)';
}

/// Outer ring of a GeoJSON `Polygon` (closing point dropped); null otherwise.
List<GeoPoint>? polygonFromGeoJson(Object? g) {
  if (g is! Map || g['type'] != 'Polygon') return null;
  final rings = g['coordinates'];
  if (rings is! List || rings.isEmpty || rings.first is! List) return null;
  final ring = [
    for (final c in rings.first as List) ?GeoPoint.fromCoordinates(c),
  ];
  if (ring.length > 1 && ring.first == ring.last) ring.removeLast();
  return ring.length >= 3 ? ring : null;
}

/// East/north offset in metres from a reference point.
class Enu {
  const Enu(this.e, this.n);

  final double e;
  final double n;

  Enu operator -(Enu o) => Enu(e - o.e, n - o.n);
  Enu operator +(Enu o) => Enu(e + o.e, n + o.n);
  Enu operator *(double k) => Enu(e * k, n * k);

  double dot(Enu o) => e * o.e + n * o.n;
  double get length => math.sqrt(e * e + n * n);

  @override
  String toString() => 'Enu(${e.toStringAsFixed(2)}, ${n.toStringAsFixed(2)})';
}

/// Equirectangular projection around [origin].
class LocalProjection {
  LocalProjection(this.origin) : _cosLat = math.cos(_rad(origin.lat));

  final GeoPoint origin;
  final double _cosLat;

  Enu toLocal(GeoPoint p) => Enu(
    _rad(p.lon - origin.lon) * _cosLat * _earthRadiusM,
    _rad(p.lat - origin.lat) * _earthRadiusM,
  );

  GeoPoint toGeo(Enu v) => GeoPoint(
    origin.lat + v.n / _earthRadiusM * 180 / math.pi,
    origin.lon + v.e / (_earthRadiusM * _cosLat) * 180 / math.pi,
  );
}

/// Horizontal distance in metres (haversine).
double distanceM(GeoPoint a, GeoPoint b) {
  final dLat = _rad(b.lat - a.lat);
  final dLon = _rad(b.lon - a.lon);
  final h =
      math.pow(math.sin(dLat / 2), 2) +
      math.cos(_rad(a.lat)) *
          math.cos(_rad(b.lat)) *
          math.pow(math.sin(dLon / 2), 2);
  return 2 * _earthRadiusM * math.asin(math.min(1, math.sqrt(h)));
}

/// Initial bearing from [a] to [b], degrees clockwise from north (0–360).
double bearingDeg(GeoPoint a, GeoPoint b) {
  final p1 = _rad(a.lat);
  final p2 = _rad(b.lat);
  final dl = _rad(b.lon - a.lon);
  final y = math.sin(dl) * math.cos(p2);
  final x =
      math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl);
  return (math.atan2(y, x) * 180 / math.pi + 360) % 360;
}

/// Eight compass directions, in Turkish.
enum Compass {
  north('kuzey', 'kuzeyden', 'kuzeyde', 'K'),
  northEast('kuzeydoğu', 'kuzeydoğudan', 'kuzeydoğuda', 'KD'),
  east('doğu', 'doğudan', 'doğuda', 'D'),
  southEast('güneydoğu', 'güneydoğudan', 'güneydoğuda', 'GD'),
  south('güney', 'güneyden', 'güneyde', 'G'),
  southWest('güneybatı', 'güneybatıdan', 'güneybatıda', 'GB'),
  west('batı', 'batıdan', 'batıda', 'B'),
  northWest('kuzeybatı', 'kuzeybatıdan', 'kuzeybatıda', 'KB');

  const Compass(this.label, this.from, this.at, this.short);

  /// "kuzeydoğu".
  final String label;

  /// Ablative: "kuzeydoğudan" (counting *from* that end).
  final String from;

  /// Locative: "kuzeydoğuda" (the target lies there).
  final String at;
  final String short;

  static Compass of(double bearingDeg) =>
      values[((bearingDeg % 360 + 360) % 360 / 45).round() % 8];
}

/// Area of a simple polygon in m² (shoelace on the local plane). Fewer than
/// three points have no area.
double polygonAreaM2(List<GeoPoint> ring) {
  if (ring.length < 3) return 0;
  final proj = LocalProjection(ring.first);
  final pts = [for (final p in ring) proj.toLocal(p)];
  var twice = 0.0;
  for (var i = 0; i < pts.length; i++) {
    final a = pts[i];
    final b = pts[(i + 1) % pts.length];
    twice += a.e * b.n - b.e * a.n;
  }
  return twice.abs() / 2;
}

/// 1 dönüm = 1000 m².
double m2ToDecare(double m2) => m2 / 1000;

/// Distance in metres from [p] to the segment [a]–[b] (local plane).
double pointSegmentDistance(Enu p, Enu a, Enu b) {
  final ab = b - a;
  final len2 = ab.dot(ab);
  if (len2 == 0) return (p - a).length;
  final t = ((p - a).dot(ab) / len2).clamp(0.0, 1.0);
  return (p - (a + ab * t)).length;
}
