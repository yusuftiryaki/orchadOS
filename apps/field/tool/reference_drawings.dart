// Generates the "böyle çek" drawings in assets/reference/ (one per shot
// code; docs/uzman-ajan-onerileri.md 4.1 and 4.2).
//
//   dart run tool/reference_drawings.dart
//
// Two panels of 360×300 units, one under the other:
//   A — side view: person, phone height, distance arrow, view cone, sun.
//   B — what the phone screen must show: the frame with green-checked items
//       and a small red-crossed example of a common mistake.
// Drawn to be read at phone width; distances near the tree are not to scale
// (the label gives the real distance). Keep the drawings simple: they are
// instructions, not illustrations.
import 'dart:io';
import 'dart:math' as math;

// Colours of 4.1.
const trunk = '#5D4037';
const deadBranch = '#9E9E9E';
const leaf = '#43A047';
const leafDark = '#2E7D32';
const soil = '#D7C2A3';
const soilLine = '#A1887F';
const ink = '#424242';
const right = '#2E7D32';
const wrong = '#C62828';
const sky = '#EEF5FB';
const paper = '#FFFFFF';
const skin = '#F1C27D';
const sunColour = '#F9A825';

const groundY = 250.0;

String _n(num v) => v is int || v == v.roundToDouble()
    ? v.round().toString()
    : v.toStringAsFixed(1);

String _esc(String s) =>
    s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

String text(
  num x,
  num y,
  String s, {
  num size = 14,
  String anchor = 'start',
  String fill = ink,
  bool bold = false,
}) =>
    '<text x="${_n(x)}" y="${_n(y)}" font-family="sans-serif" '
    'font-size="${_n(size)}" fill="$fill" text-anchor="$anchor"'
    '${bold ? ' font-weight="bold"' : ''}>${_esc(s)}</text>';

String line(
  num x1,
  num y1,
  num x2,
  num y2, {
  String stroke = ink,
  num width = 2,
  bool dashed = false,
}) =>
    '<line x1="${_n(x1)}" y1="${_n(y1)}" x2="${_n(x2)}" y2="${_n(y2)}" '
    'stroke="$stroke" stroke-width="${_n(width)}" stroke-linecap="round"'
    '${dashed ? ' stroke-dasharray="5 4"' : ''}/>';

String rect(
  num x,
  num y,
  num w,
  num h, {
  String fill = 'none',
  String stroke = 'none',
  num width = 2,
  num r = 0,
}) =>
    '<rect x="${_n(x)}" y="${_n(y)}" width="${_n(w)}" height="${_n(h)}" '
    'rx="${_n(r)}" fill="$fill" stroke="$stroke" stroke-width="${_n(width)}"/>';

String circle(
  num cx,
  num cy,
  num r, {
  String fill = 'none',
  String stroke = 'none',
  num width = 2,
}) =>
    '<circle cx="${_n(cx)}" cy="${_n(cy)}" r="${_n(r)}" fill="$fill" '
    'stroke="$stroke" stroke-width="${_n(width)}"/>';

String ellipse(num cx, num cy, num rx, num ry, {String fill = leaf}) =>
    '<ellipse cx="${_n(cx)}" cy="${_n(cy)}" rx="${_n(rx)}" ry="${_n(ry)}" '
    'fill="$fill"/>';

String path(
  String d, {
  String fill = 'none',
  String stroke = ink,
  num width = 2,
}) =>
    '<path d="$d" fill="$fill" stroke="$stroke" stroke-width="${_n(width)}" '
    'stroke-linecap="round" stroke-linejoin="round"/>';

/// Small arrow head at (x2, y2) pointing away from (x1, y1).
String arrowHead(num x1, num y1, num x2, num y2, {String colour = ink}) {
  final dx = x2 - x1, dy = y2 - y1;
  final len = (dx * dx + dy * dy).toDouble();
  final l = len == 0 ? 1.0 : math.sqrt(len);
  final ux = dx / l, uy = dy / l;
  const s = 7.0;
  final ax = x2 - ux * s - uy * s * 0.6, ay = y2 - uy * s + ux * s * 0.6;
  final bx = x2 - ux * s + uy * s * 0.6, by = y2 - uy * s - ux * s * 0.6;
  return path(
    'M${_n(ax)} ${_n(ay)} L${_n(x2)} ${_n(y2)} L${_n(bx)} ${_n(by)} Z',
    fill: colour,
    stroke: colour,
    width: 1,
  );
}

String arrow(num x1, num y1, num x2, num y2, {String colour = ink}) =>
    line(x1, y1, x2, y2, stroke: colour) +
    arrowHead(x1, y1, x2, y2, colour: colour);

/// Double-headed horizontal distance arrow with its label above.
String distance(num x1, num x2, num y, String label) =>
    line(x1, y, x2, y) +
    arrowHead(x2, y, x1, y) +
    arrowHead(x1, y, x2, y) +
    text((x1 + x2) / 2, y - 6, label, anchor: 'middle', bold: true);

/// Dashed line from the phone down to the ground, and the height label
/// ending at [labelX] (right-aligned, usually left of the person).
String phoneHeight(num x, num y, String label, {required num labelX}) =>
    line(x, y + 6, x, groundY, dashed: true, width: 1.5) +
    text(labelX, (y + groundY) / 2 + 5, label, size: 12, anchor: 'end');

/// Two thin lines from the phone: the top and bottom of the frame.
String cone(num px, num py, num tx, num ty, num bx, num by) =>
    line(px, py, tx, ty, stroke: deadBranch, width: 1.5) +
    line(px, py, bx, by, stroke: deadBranch, width: 1.5);

String sun(num x, num y, {String label = 'güneş arkanda'}) {
  final rays = StringBuffer();
  for (var i = 0; i < 8; i++) {
    final a = i * math.pi / 4;
    rays.write(
      line(
        x + 13 * math.cos(a),
        y + 13 * math.sin(a),
        x + 19 * math.cos(a),
        y + 19 * math.sin(a),
        stroke: sunColour,
      ),
    );
  }
  return circle(x, y, 9, fill: sunColour) +
      rays.toString() +
      text(x - 8, y + 34, label, size: 11);
}

/// Stick figure standing at [x] on the ground, holding the phone at
/// ([px], [py]). 1.7 m ≈ 51 units at 1 m = 30 units; drawn a bit larger
/// (64) to stay legible.
String person(num x, num px, num py, {bool crouch = false}) {
  final b = StringBuffer();
  if (crouch) {
    // Squatting: head low, bent legs.
    const hy = groundY - 52;
    b
      ..write(circle(x, hy, 8, fill: skin, stroke: ink))
      ..write(line(x, hy + 8, x - 4, groundY - 22, width: 3))
      ..write(
        path(
          'M${_n(x - 4)} ${_n(groundY - 22)} L${_n(x + 8)} ${_n(groundY - 14)} '
          'L${_n(x + 2)} $groundY',
          width: 3,
        ),
      )
      ..write(
        path(
          'M${_n(x - 4)} ${_n(groundY - 22)} L${_n(x - 12)} ${_n(groundY - 10)} '
          'L${_n(x - 10)} $groundY',
          width: 3,
        ),
      )
      ..write(line(x - 2, hy + 18, px, py, width: 3));
  } else {
    const hy = groundY - 58;
    b
      ..write(circle(x, hy, 8, fill: skin, stroke: ink))
      ..write(line(x, hy + 8, x, groundY - 26, width: 3))
      ..write(line(x, groundY - 26, x - 8, groundY, width: 3))
      ..write(line(x, groundY - 26, x + 8, groundY, width: 3))
      ..write(line(x, hy + 18, px, py, width: 3));
  }
  b.write(rect(px - 2, py - 6, 5, 12, fill: ink, r: 1));
  return b.toString();
}

/// Leafy tree; trunk base at [x] on the ground.
String leafyTree(num x, {num height = 150, num crown = 110}) =>
    rect(x - 6, groundY - height * 0.45, 12, height * 0.45, fill: trunk) +
    ellipse(x, groundY - height * 0.7, crown / 2, height * 0.32) +
    ellipse(
      x - crown * 0.25,
      groundY - height * 0.62,
      crown * 0.3,
      height * 0.2,
      fill: leafDark,
    );

/// Bare winter tree; trunk base at [x].
String bareTree(num x, {num height = 150}) {
  final top = groundY - height;
  final fork = groundY - height * 0.4;
  return rect(x - 6, fork, 12, height * 0.4, fill: trunk) +
      path(
        'M${_n(x)} ${_n(fork)} L${_n(x - 40)} ${_n(top + 30)} '
        'M${_n(x)} ${_n(fork)} L${_n(x + 38)} ${_n(top + 25)} '
        'M${_n(x)} ${_n(fork)} L${_n(x + 4)} ${_n(top)} '
        'M${_n(x - 22)} ${_n(fork - 35)} L${_n(x - 46)} ${_n(fork - 50)} '
        'M${_n(x + 20)} ${_n(fork - 40)} L${_n(x + 48)} ${_n(fork - 48)}',
        stroke: trunk,
        width: 4,
      );
}

String ground() =>
    rect(0, groundY, 360, 300 - groundY, fill: soil) +
    line(0, groundY, 360, groundY, stroke: soilLine);

/// Green check mark at ([x], [y]) (top-left of a 16×16 box).
String check(num x, num y) => path(
  'M${_n(x)} ${_n(y + 8)} L${_n(x + 6)} ${_n(y + 14)} L${_n(x + 16)} ${_n(y + 2)}',
  stroke: right,
  width: 3.5,
);

/// Red cross over a box.
String cross(num x, num y, num w, num h) =>
    line(x, y, x + w, y + h, stroke: wrong, width: 4) +
    line(x + w, y, x, y + h, stroke: wrong, width: 4);

/// A frame item: green check, label, and an arrow to a point in the frame
/// (in frame-local units, see [Shot.frame]).
class Item {
  const Item(this.label, [this.fx, this.fy]);
  final String label;

  /// Arrow target; null for a rule without a place in the frame.
  final num? fx, fy;
}

/// One drawing.
class Shot {
  const Shot({
    required this.name,
    required this.title,
    required this.side,
    required this.frame,
    required this.items,
    required this.wrongFrame,
    required this.wrongLabel,
    this.note,
  });

  final String name;
  final String title;

  /// Panel A content (0..360 × 0..300).
  final String side;

  /// Panel B screen content in frame-local units (100 × 160).
  final String frame;
  final List<Item> items;

  /// The mistake, in the same local units.
  final String wrongFrame;
  final String wrongLabel;

  /// Extra line under the frame (B), optional.
  final String? note;
}

// Panel B geometry: main frame 100×160 local units drawn at scale 1.4.
const fx0 = 24.0, fy0 = 336.0, fScale = 1.4;
const fw = 100.0, fh = 160.0;
// Wrong example: same local units at scale 0.5.
const wx0 = 276.0, wy0 = 468.0, wScale = 0.5;

String _screen(
  String content,
  num x0,
  num y0,
  num scale,
  String id, {
  String border = ink,
}) {
  final w = fw * scale, h = fh * scale;
  return '<clipPath id="$id"><rect x="${_n(x0)}" y="${_n(y0)}" '
      'width="${_n(w)}" height="${_n(h)}" rx="${_n(4 * scale)}"/></clipPath>'
      '<g clip-path="url(#$id)">'
      '${rect(x0, y0, w, h, fill: paper)}'
      '<g transform="translate(${_n(x0)} ${_n(y0)}) scale(${_n(scale)})">'
      '$content</g></g>'
      '${rect(x0 - 3, y0 - 3, w + 6, h + 6, stroke: border, width: 3, r: 6 * scale)}';
}

String render(Shot s) {
  final b = StringBuffer()
    ..write(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 600" '
      'width="360" height="600">',
    )
    // Panel A.
    ..write(rect(0, 0, 360, 300, fill: sky))
    ..write(ground())
    ..write(s.side)
    ..write(rect(0, 0, 360, 30, fill: paper))
    ..write(text(12, 21, 'A · Nereden çekilir', size: 15, bold: true))
    ..write(text(348, 21, s.title, size: 13, anchor: 'end'))
    // Panel B.
    ..write(rect(0, 300, 360, 300, fill: paper))
    ..write(line(0, 300, 360, 300, stroke: deadBranch, width: 1))
    ..write(text(12, 322, 'B · Ekranda ne görünmeli', size: 15, bold: true))
    ..write(_screen(s.frame, fx0, fy0, fScale, '${s.name}-ok', border: right));
  // Items: label column to the right of the frame, arrows into it.
  const lx = 180.0;
  final items = [...s.items]
    ..sort((a, b) => (a.fy ?? 999).compareTo(b.fy ?? 999));
  for (final (i, item) in items.indexed) {
    final y = 352.0 + i * 32;
    b
      ..write(check(lx, y - 13))
      ..write(text(lx + 22, y, item.label, size: 13));
    if (item.fx != null) {
      b.write(
        arrow(
          lx - 4,
          y - 5,
          fx0 + item.fx! * fScale,
          fy0 + item.fy! * fScale,
          colour: right,
        ),
      );
    }
  }
  if (s.note != null) {
    b.write(text(fx0, fy0 + fh * fScale + 26, s.note!, size: 12));
  }
  b
    ..write(
      _screen(s.wrongFrame, wx0, wy0, wScale, '${s.name}-bad', border: wrong),
    )
    ..write(cross(wx0, wy0, fw * wScale, fh * wScale))
    ..write(
      text(
        wx0 - 8,
        wy0 + 20,
        'Yanlış:',
        size: 12,
        anchor: 'end',
        fill: wrong,
        bold: true,
      ),
    )
    ..write(
      text(
        352,
        wy0 + fh * wScale + 16,
        s.wrongLabel,
        size: 12,
        anchor: 'end',
        fill: wrong,
      ),
    )
    ..write('</svg>\n');
  return b.toString();
}

// ---- Frame-local helpers (100 × 160) ----

String fGround(num y) => rect(0, y, 100, 160 - y, fill: soil);
String fSky() => rect(0, 0, 100, 160, fill: sky);

/// Pistachio leaf: compound, 4 oval leaflets and a top one on a stalk.
String fLeaf(num cx, num cy, num scale, {bool dots = false}) {
  final b = StringBuffer()
    ..write(
      line(
        cx,
        cy + 34 * scale,
        cx,
        cy - 26 * scale,
        stroke: leafDark,
        width: 2 * scale,
      ),
    );
  for (final (dx, dy) in const [(-14, 6), (14, 6), (-13, -14), (13, -14)]) {
    b.write(ellipse(cx + dx * scale, cy + dy * scale, 11 * scale, 7 * scale));
  }
  b.write(ellipse(cx, cy - 32 * scale, 9 * scale, 12 * scale));
  if (dots) {
    for (final (dx, dy) in const [
      (-16, 5),
      (12, 8),
      (-10, -15),
      (15, -12),
      (2, -34),
    ]) {
      b.write(
        circle(cx + dx * scale, cy + dy * scale, 1.8 * scale, fill: paper),
      );
    }
  }
  return b.toString();
}

/// Open hand (palm and thumb) with its top-left at ([x], [y]).
String fHand(num x, num y, num s) =>
    rect(x, y, 26 * s, 30 * s, fill: skin, r: 8 * s) +
    rect(x + 22 * s, y - 2 * s, 9 * s, 20 * s, fill: skin, r: 4 * s);

String _dots(List<(num, num)> at, num r, String fill) =>
    [for (final (x, y) in at) circle(x, y, r, fill: fill)].join();

/// Panel A for a close shot at a leafy tree: the person stands left of the
/// crown, phone at [py], target at the crown edge. Not to scale.
String closeLeafy(String height, String dist, num py) =>
    leafyTree(292) +
    person(176, 200, py) +
    phoneHeight(200, py, height, labelX: 162) +
    cone(202, py, 238, py - 14, 238, py + 14) +
    distance(202, 238, 275, dist);

final shots = <Shot>[
  Shot(
    name: 'T',
    title: 'Taç: ağacın tamamı',
    side:
        sun(32, 62) +
        leafyTree(285) +
        person(80, 94, 196) +
        phoneHeight(94, 196, 'göz hizası', labelX: 68) +
        cone(96, 196, 285, 70, 285, groundY) +
        distance(84, 279, 275, '6–8 m') +
        text(150, 50, 'güneyden kuzeye bak', size: 12) +
        arrow(150, 58, 230, 58),
    frame:
        fSky() +
        fGround(132) +
        rect(46, 92, 8, 42, fill: trunk) +
        ellipse(50, 66, 34, 46) +
        ellipse(40, 74, 18, 24, fill: leafDark),
    items: const [
      Item('Tepe görünüyor', 50, 22),
      Item('Ağaç ortada', 76, 70),
      Item('Gövde dibi ve zemin', 52, 134),
      Item('Zoom yok, 6–8 m geri'),
    ],
    wrongFrame:
        fSky() +
        fGround(150) +
        rect(44, 110, 12, 42, fill: trunk) +
        ellipse(50, 40, 60, 80),
    wrongLabel: 'tepe kesik',
  ),
  Shot(
    name: 'K2',
    title: 'Kış: gövde ve dip',
    side:
        sun(32, 62) +
        bareTree(282) +
        person(154, 178, 228, crouch: true) +
        phoneHeight(178, 228, 'diz hizası', labelX: 138) +
        cone(180, 228, 280, 150, 278, groundY) +
        distance(180, 276, 275, '1–1,5 m'),
    frame:
        fSky() +
        fGround(118) +
        rect(40, 20, 20, 104, fill: trunk) +
        path('M50 22 L22 0 M50 22 L80 0', stroke: trunk, width: 6) +
        path(
          'M38 124 L30 104 M62 124 L70 106 M60 124 L64 100',
          stroke: leafDark,
          width: 2,
        ) +
        path('M40 124 Q50 132 60 124', stroke: soilLine, width: 2),
    items: const [
      Item('İlk çatal', 50, 22),
      Item('Gövdenin güney yüzü', 58, 66),
      Item('Dip sürgünü', 68, 108),
      Item('Kök boğazı', 50, 126),
    ],
    wrongFrame:
        fGround(0) +
        ellipse(50, 70, 14, 14, fill: trunk) +
        path(
          'M10 110 l6 -18 l6 18 M28 120 l6 -20 l6 20 M60 116 l6 -22 l6 22 '
          'M78 104 l6 -18 l6 18 M20 70 l6 -20 l6 20 M70 70 l6 -18 l6 18',
          stroke: leafDark,
          width: 3,
        ),
    wrongLabel: 'tepeden, dip otla kapalı',
    note: 'Ot gövdeyi kapatıyorsa önce elinle ayır.',
  ),
  Shot(
    name: 'K3',
    title: 'Kış: yara ya da dal ucu',
    side:
        bareTree(282) +
        ellipse(282, 190, 4, 8, fill: '#1B1B1B') +
        person(176, 200, 190) +
        phoneHeight(200, 190, 'yara hizası', labelX: 162) +
        cone(202, 190, 274, 174, 274, 206) +
        distance(202, 274, 275, '30–50 cm') +
        text(40, 60, 'Telefon yüzeye dik.', size: 12),
    frame:
        rect(0, 0, 100, 160, fill: '#8D6E63') +
        path(
          'M12 0 L14 160 M30 0 L28 160 M70 0 L72 160 M88 0 L86 160',
          stroke: trunk,
          width: 2,
        ) +
        ellipse(46, 74, 16, 24, fill: '#2B1D16') +
        fHand(66, 96, 1),
    items: const [
      Item('Kenarda sağlam kabuk', 14, 30),
      Item('Yara ortada', 46, 74),
      Item('Yanında elin (ölçek)', 78, 108),
    ],
    wrongFrame:
        rect(0, 0, 100, 160, fill: '#8D6E63') +
        ellipse(50, 80, 48, 74, fill: '#2B1D16'),
    wrongLabel: 'el yok, çok yakın',
    note: 'Yara yoksa bir dal ucu ve tomurcuğu.',
  ),
  Shot(
    name: 'K4',
    title: 'Kuru şüphesi: dal ucu testi',
    side:
        bareTree(282) +
        person(170, 194, 150) +
        phoneHeight(194, 150, 'dal hizası', labelX: 156) +
        cone(196, 150, 242, 132, 242, 160) +
        distance(196, 242, 275, '20–30 cm') +
        text(40, 60, 'Farklı yönlerden 3 dal,', size: 12) +
        text(40, 76, 'her dal için 1 fotoğraf.', size: 12),
    frame:
        rect(0, 0, 100, 160, fill: sky) +
        line(0, 130, 100, 30, stroke: deadBranch, width: 7) +
        line(42, 88, 58, 72, stroke: '#C5E1A5', width: 7) +
        fHand(58, 104, 0.9),
    items: const [
      Item('Kalem kalınlığında dal', 16, 114),
      Item('Kazınan yer ortada', 50, 80),
      Item('Yanında başparmak', 66, 110),
    ],
    wrongFrame:
        rect(0, 0, 100, 160, fill: sky) +
        line(0, 130, 100, 30, stroke: deadBranch, width: 7) +
        fHand(36, 66, 1.3),
    wrongLabel: 'kazınan yer kapalı',
    note: 'Kabuk altı: yeşil = canlı, kahverengi = kuru.',
  ),
  Shot(
    name: 'I2',
    title: 'İlkbahar: çiçek salkımı',
    side:
        closeLeafy('salkım hizası', '20–30 cm', 168) +
        text(40, 60, 'Bir elinle salkımın', size: 12) +
        text(40, 76, 'arkasına avucunu tut.', size: 12),
    frame:
        rect(0, 0, 100, 160, fill: '#E8F5E9') +
        rect(18, 30, 64, 96, fill: skin, r: 24) +
        line(50, 0, 50, 40, stroke: trunk, width: 4) +
        _dots(
          const [
            (44, 46),
            (56, 48),
            (40, 60),
            (52, 62),
            (62, 64),
            (46, 76),
            (58, 78),
            (50, 90),
            (42, 88),
            (56, 100),
            (50, 112),
          ],
          6,
          '#AD1457',
        ),
    items: const [
      Item('Bağlı olduğu dal', 50, 14),
      Item('Tek salkım, bütün', 60, 70),
      Item('Arkada avuç', 26, 112),
    ],
    wrongFrame:
        rect(0, 0, 100, 160, fill: '#BBDEFB') +
        _dots(
          const [(44, 50), (56, 52), (48, 66), (60, 70), (50, 84), (42, 96)],
          8,
          '#37474F',
        ),
    wrongLabel: 'gökyüzüne karşı',
  ),
  Shot(
    name: 'leaf',
    title: 'Yaprak: üst ve alt yüz',
    side:
        closeLeafy('yaprak hizası', '20–30 cm', 172) +
        text(40, 60, 'Dalda çek, koparma.', size: 12) +
        text(40, 76, 'Flaş yok.', size: 12),
    frame:
        rect(0, 0, 100, 160, fill: '#F1F8E9') +
        line(0, 80, 100, 80, stroke: deadBranch, width: 1) +
        fLeaf(50, 42, 0.85) +
        fLeaf(50, 122, 0.85, dots: true),
    items: const [
      Item('Üst yüz: yaprağın tamamı', 62, 34),
      Item('Alt yüz: yaprağı çevir', 62, 114),
      Item('Pul varsa ortada'),
    ],
    wrongFrame:
        fGround(0) +
        fLeaf(50, 80, 1.1) +
        path(
          'M14 30 l6 -12 l6 12 M70 130 l6 -12 l6 12',
          stroke: leafDark,
          width: 3,
        ),
    wrongLabel: 'yere düşmüş yaprak',
  ),
  Shot(
    name: 'Y2',
    title: 'Yaz: meyve salkımı',
    side:
        closeLeafy('salkım hizası', '30 cm', 176) +
        text(40, 60, 'Tacın dış yanından,', size: 12) +
        text(40, 76, 'ilk gördüğün salkım.', size: 12),
    frame:
        rect(0, 0, 100, 160, fill: '#F1F8E9') +
        path(
          'M50 0 L50 30 M50 30 L36 60 M50 30 L64 62 M50 30 L50 70',
          stroke: '#8D6E63',
          width: 2.5,
        ) +
        [
          for (final (x, y) in const [
            (36, 66),
            (64, 68),
            (50, 76),
            (40, 88),
            (60, 90),
            (50, 100),
            (44, 112),
            (56, 114),
          ])
            ellipse(x, y, 7, 9, fill: '#C5D86D'),
        ].join() +
        circle(60, 90, 2, fill: '#6D4C41'),
    items: const [
      Item('Salkım ve sapı tam', 50, 16),
      Item('Meyve yüzeyi net', 40, 88),
      Item('Lekeler görünmeli', 60, 92),
    ],
    wrongFrame:
        rect(0, 0, 100, 160, fill: '#F1F8E9') +
        [
          for (final (x, y) in const [(40, 70), (60, 72), (50, 86)])
            ellipse(x, y, 9, 11, fill: '#C5D86D'),
        ].join() +
        fHand(28, 60, 1.6),
    wrongLabel: 'elle sıkma, koparma',
  ),
  Shot(
    name: 'H2',
    title: 'Hasat: kırık dal',
    side:
        sun(32, 62) +
        leafyTree(282) +
        path('M282 140 L236 196 L222 226', stroke: trunk, width: 5) +
        person(150, 168, 184) +
        phoneHeight(168, 184, 'göğüs hizası', labelX: 136) +
        cone(170, 184, 284, 120, 250, groundY) +
        distance(170, 276, 275, '1–2 m'),
    frame:
        fSky() +
        fGround(140) +
        rect(62, 20, 16, 122, fill: trunk) +
        path('M66 50 L40 70 L34 76', stroke: trunk, width: 6) +
        path('M34 76 L18 112 L10 136', stroke: trunk, width: 5) +
        path('M30 70 l8 4 l-6 4 l8 4', stroke: wrong, width: 2),
    items: const [
      Item('Gövdeye bağlantı', 66, 50),
      Item('Kırık yer', 34, 76),
      Item('İkisi aynı karede'),
    ],
    wrongFrame: fGround(0) + path('M14 120 L86 60', stroke: trunk, width: 7),
    wrongLabel: 'sadece yerdeki dal',
    note: "Sonra kırık yeri 30 cm'den bir kez daha çek.",
  ),
  Shot(
    name: 'H3',
    title: 'Hasat: ağaç altı',
    side:
        sun(32, 62) +
        leafyTree(282) +
        line(
          222,
          groundY - 4,
          342,
          groundY - 4,
          stroke: leafDark,
          dashed: true,
        ) +
        person(150, 168, 184) +
        phoneHeight(168, 184, 'göğüs hizası', labelX: 136) +
        text(136, 170, '45° aşağı', size: 12, anchor: 'end') +
        cone(170, 184, 196, groundY, 262, groundY) +
        distance(170, 276, 275, '2–3 m'),
    frame:
        fGround(0) +
        rect(44, 0, 12, 34, fill: trunk) +
        path(
          'M14 60 l12 4 M30 90 l10 -6 M64 70 l14 6 M72 110 l-10 6 '
          'M20 130 l14 2 M50 120 l4 12 M82 140 l-8 -6',
          stroke: '#6D4C41',
          width: 2.5,
        ) +
        ellipse(36, 74, 5, 3, fill: '#A1887F') +
        ellipse(80, 96, 5, 3, fill: '#A1887F'),
    items: const [
      Item('Gövde dibi', 50, 24),
      Item('Tacın altındaki toprak', 70, 100),
      Item('Gökyüzü yok'),
    ],
    wrongFrame: fSky() + fGround(80) + rect(44, 20, 12, 62, fill: trunk),
    wrongLabel: 'yarısı gökyüzü',
  ),
];

void main(List<String> args) {
  final dir = Directory(args.isEmpty ? 'assets/reference' : args.first)
    ..createSync(recursive: true);
  for (final s in shots) {
    File('${dir.path}/${s.name}.svg').writeAsStringSync(render(s));
  }
  stdout.writeln('${shots.length} drawings in ${dir.path}');
}
