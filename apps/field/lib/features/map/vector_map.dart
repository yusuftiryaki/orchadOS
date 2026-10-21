import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/geo/geo.dart';

// Offline vector map: boundary, slots, the walked track and the current
// position drawn on a plain background, north up. No base map tiles (not
// needed in the field and no tile licence to manage); a tile layer can be
// put underneath later without changing the layers.

/// A point to draw (slot, corner).
class MapDot {
  const MapDot(this.at, {required this.color, this.radius = 3, this.label});

  final GeoPoint at;
  final Color color;
  final double radius;
  final String? label;
}

class VectorMap extends StatelessWidget {
  const VectorMap({
    super.key,
    this.boundary,
    this.draft,
    this.dots = const [],
    this.tracks = const [],
    this.here,
    this.height = 280,
  });

  /// Parcel boundary (closed ring).
  final List<GeoPoint>? boundary;

  /// Boundary being walked: corners in order, closed with a dashed edge.
  final List<GeoPoint>? draft;
  final List<MapDot> dots;

  /// Walked track pieces (gaps are separate pieces).
  final List<List<GeoPoint>> tracks;

  /// Current receiver position.
  final GeoPoint? here;
  final double height;

  bool get _hasGeometry =>
      (boundary?.isNotEmpty ?? false) ||
      (draft?.isNotEmpty ?? false) ||
      dots.isNotEmpty ||
      tracks.any((t) => t.isNotEmpty) ||
      here != null;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      height: height,
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
      ),
      clipBehavior: Clip.antiAlias,
      child: _hasGeometry
          ? CustomPaint(painter: _MapPainter(this, scheme), size: Size.infinite)
          : const Center(
              child: Text(
                'Haritada gösterilecek konum yok',
                style: TextStyle(fontSize: 16),
              ),
            ),
    );
  }
}

class _MapPainter extends CustomPainter {
  _MapPainter(this.map, this.scheme);

  final VectorMap map;
  final ColorScheme scheme;

  static const double _pad = 16;

  @override
  void paint(Canvas canvas, Size size) {
    final all = <GeoPoint>[
      ...?map.boundary,
      ...?map.draft,
      for (final d in map.dots) d.at,
      for (final t in map.tracks) ...t,
      ?map.here,
    ];
    if (all.isEmpty) return;
    final proj = LocalProjection(all.first);
    final pts = [for (final p in all) proj.toLocal(p)];
    final loE = pts.map((p) => p.e).reduce(math.min);
    final hiE = pts.map((p) => p.e).reduce(math.max);
    final loN = pts.map((p) => p.n).reduce(math.min);
    final hiN = pts.map((p) => p.n).reduce(math.max);
    // At least 20 m across, so a single point does not fill the screen.
    final spanE = math.max(hiE - loE, 20.0);
    final spanN = math.max(hiN - loN, 20.0);
    final minE = (loE + hiE) / 2 - spanE / 2;
    final maxN = (loN + hiN) / 2 + spanN / 2;
    final scale = math.min(
      (size.width - 2 * _pad) / spanE,
      (size.height - 2 * _pad) / spanN,
    );
    final offX = (size.width - spanE * scale) / 2;
    final offY = (size.height - spanN * scale) / 2;
    Offset xy(GeoPoint g) {
      final v = proj.toLocal(g);
      return Offset(offX + (v.e - minE) * scale, offY + (maxN - v.n) * scale);
    }

    final boundary = map.boundary;
    if (boundary != null && boundary.length >= 3) {
      final path = Path()..addPolygon([for (final p in boundary) xy(p)], true);
      canvas
        ..drawPath(
          path,
          Paint()..color = scheme.primary.withValues(alpha: 0.06),
        )
        ..drawPath(
          path,
          Paint()
            ..color = scheme.primary
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2,
        );
    }

    final draft = map.draft;
    if (draft != null && draft.isNotEmpty) {
      final p = [for (final g in draft) xy(g)];
      final edge = Paint()
        ..color = Colors.indigo
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3;
      if (p.length >= 3) {
        canvas.drawPath(
          Path()..addPolygon(p, true),
          Paint()..color = Colors.indigo.withValues(alpha: 0.12),
        );
      }
      for (var i = 1; i < p.length; i++) {
        canvas.drawLine(p[i - 1], p[i], edge);
      }
      if (p.length >= 3) _dashed(canvas, p.last, p.first, edge);
    }

    final trackPaint = Paint()
      ..color = Colors.orange.shade800
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5
      ..strokeJoin = StrokeJoin.round;
    for (final t in map.tracks) {
      if (t.length < 2) continue;
      canvas.drawPath(
        Path()..addPolygon([for (final g in t) xy(g)], false),
        trackPaint,
      );
    }

    for (final d in map.dots) {
      final c = xy(d.at);
      canvas.drawCircle(c, d.radius, Paint()..color = d.color);
      final label = d.label;
      if (label != null) _text(canvas, label, c + Offset(d.radius + 2, -8));
    }

    final here = map.here;
    if (here != null) {
      final c = xy(here);
      canvas
        ..drawCircle(c, 9, Paint()..color = Colors.white)
        ..drawCircle(c, 7, Paint()..color = Colors.blue.shade700);
    }

    _scaleBar(canvas, size, scale);
    _text(canvas, 'K ↑', Offset(size.width - 34, 6));
  }

  void _dashed(Canvas canvas, Offset a, Offset b, Paint paint) {
    final d = b - a;
    final len = d.distance;
    if (len == 0) return;
    const dash = 8.0;
    for (var s = 0.0; s < len; s += 2 * dash) {
      final e = math.min(s + dash, len);
      canvas.drawLine(a + d * (s / len), a + d * (e / len), paint);
    }
  }

  void _scaleBar(Canvas canvas, Size size, double pxPerM) {
    const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    final target = size.width / 4 / pxPerM;
    final m = steps.lastWhere((s) => s <= target, orElse: () => 1);
    final w = m * pxPerM;
    final y = size.height - 10;
    final p = Paint()
      ..color = scheme.onSurface
      ..strokeWidth = 2;
    canvas
      ..drawLine(Offset(10, y), Offset(10 + w, y), p)
      ..drawLine(Offset(10, y - 4), Offset(10, y + 1), p)
      ..drawLine(Offset(10 + w, y - 4), Offset(10 + w, y + 1), p);
    _text(canvas, '$m m', Offset(14 + w, y - 14));
  }

  void _text(Canvas canvas, String s, Offset at) {
    final tp = TextPainter(
      text: TextSpan(
        text: s,
        style: TextStyle(color: scheme.onSurface, fontSize: 12),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, at);
  }

  @override
  bool shouldRepaint(_MapPainter old) => true;
}
