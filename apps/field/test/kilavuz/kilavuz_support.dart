// Screenshot support for the staff guide (docs/kilavuz/07-saha-uygulamasi.md).
//
// The shots are taken only when the test runs with
// `--dart-define=KILAVUZ_SHOTS=true` (tool/kilavuz_screens.sh); a plain
// `flutter test` skips them. Text is drawn with Roboto and the Material icon
// font from the Flutter SDK, not the test font.

import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/app/providers.dart';
import 'package:orchados_field/app/theme.dart';
import 'package:orchados_field/core/audio/alert_sound.dart';
import 'package:orchados_field/core/db/database.dart';
import 'package:orchados_field/core/device/wakelock.dart';
import 'package:orchados_field/core/geo/geo.dart';
import 'package:orchados_field/core/media/field_camera.dart';
import 'package:orchados_field/core/media/media_store.dart';
import 'package:orchados_field/core/media/synthetic_photo.dart';
import 'package:orchados_field/core/quality/photo_quality.dart';
import 'package:orchados_field/core/sync/sync_server.dart';
import 'package:orchados_field/core/time/clock.dart';
import 'package:orchados_field/features/auth/auth_repository.dart';
import 'package:orchados_field/features/gnss/fake_gnss_logger.dart';
import 'package:orchados_field/features/map/vector_map.dart';
import 'package:orchados_field/features/tasks/task_repository.dart';

import '../support/test_app.dart' show FakeBeeper, settle;

/// True when the guide's screenshots are wanted.
const kilavuzShots = bool.fromEnvironment('KILAVUZ_SHOTS');

/// Skip reason for the normal test run (null = run).
const String? kilavuzSkip = kilavuzShots
    ? null
    : 'guide screenshots: run tool/kilavuz_screens.sh';

/// Phone size of the guide's images (logical pixels) and pixel ratio.
const phoneWidth = 390.0;
const phoneHeight = 844.0;
const pixelRatio = 2.0;

/// Where the images go, relative to apps/field.
const outDir = '../../docs/kilavuz/img/saha';

/// Signed-in operator of the shots (synthetic).
const shotUser = FieldUser(
  id: 'a0000000-0000-4000-8000-000000000003',
  email: 'saha@ornek.example',
);

/// Sign-in that accepts the synthetic user; not the development one, so the
/// login screen looks like the release build.
class ShotAuthRepository implements AuthRepository {
  ShotAuthRepository({this.signedIn = true});

  final bool signedIn;

  @override
  FieldUser? get currentUser => signedIn ? shotUser : null;

  @override
  Future<FieldUser> signIn({
    required String email,
    required String password,
  }) async => shotUser;

  @override
  Future<void> signOut() async {}
}

/// Fixed task list.
class ShotTasks implements TaskRepository {
  ShotTasks(this.list);

  final TaskList list;

  @override
  Future<TaskList> todaysTasks() async => list;
}

/// One numbered marker: [n] at the [target]'s rect.
class Mark {
  const Mark(this.target, this.n, {this.at = MarkAt.left, this.dx = 0});

  final Finder target;
  final int n;
  final MarkAt at;

  /// Extra horizontal shift (logical pixels).
  final double dx;
}

/// [start] and [end]: on the screen's left or right edge, level with the
/// target (over the card border, not over its content).
enum MarkAt { left, right, center, below, above, start, end }

class _Placed {
  const _Placed(this.center, this.n);

  final Offset center;
  final int n;
}

final _marks = ValueNotifier<List<_Placed>>(const []);
final _shotKey = GlobalKey();

/// Hardware fakes and the provider container for one shot sequence, like
/// test/support/test_app.dart, with a sign-in and tasks of its own.
class ShotHarness {
  ShotHarness({
    DateTime? now,
    AuthRepository? auth,
    TaskRepository? tasks,
    this.server,
    List<SyntheticPhotoKind> photos = const [],
  }) : clock = FakeClock(now ?? DateTime.utc(2026, 12, 3, 8, 30)),
       db = AppDatabase(NativeDatabase.memory()),
       camera = FakeFieldCamera(script: photos),
       media = MemoryMediaStore() {
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
    logger = FakeGnssLogger(clock: clock);
    container = ProviderContainer(
      overrides: [
        clockProvider.overrideWithValue(clock),
        databaseProvider.overrideWithValue(db),
        gnssLoggerProvider.overrideWithValue(logger),
        cameraProvider.overrideWithValue(camera),
        mediaStoreProvider.overrideWithValue(media),
        beeperProvider.overrideWithValue(FakeBeeper()),
        alertSoundProvider.overrideWithValue(FakeAlertSound()),
        wakelockProvider.overrideWithValue(FakeWakelock()),
        photoQualityCheckerProvider.overrideWithValue(
          const PhotoQualityChecker(useIsolate: false),
        ),
        authRepositoryProvider.overrideWithValue(auth ?? ShotAuthRepository()),
        syncServerProvider.overrideWithValue(server),
        if (tasks != null) taskRepositoryProvider.overrideWithValue(tasks),
      ],
    );
    container.read(gpsClockProvider);
  }

  final FakeClock clock;
  final AppDatabase db;
  final FakeFieldCamera camera;
  final MemoryMediaStore media;
  final SyncServer? server;
  late final FakeGnssLogger logger;
  late final ProviderContainer container;

  /// The app under a repaint boundary with the marker layer on top.
  Widget wrap(Widget home) => RepaintBoundary(
    key: _shotKey,
    child: Directionality(
      textDirection: TextDirection.ltr,
      child: Stack(
        children: [
          UncontrolledProviderScope(
            container: container,
            child: MaterialApp(
              debugShowCheckedModeBanner: false,
              theme: buildTheme(),
              home: home,
            ),
          ),
          const Positioned.fill(child: IgnorePointer(child: _MarkLayer())),
        ],
      ),
    ),
  );

  Future<void> dispose(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await settle(tester);
    container.dispose();
    await settle(tester);
    await tester.runAsync(() async {
      await logger.dispose();
      await db.close();
    });
  }
}

class _MarkLayer extends StatelessWidget {
  const _MarkLayer();

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<List<_Placed>>(
    valueListenable: _marks,
    builder: (context, marks, _) => Stack(
      children: [
        for (final m in marks)
          Positioned(
            left: m.center.dx - 14,
            top: m.center.dy - 14,
            child: Container(
              width: 28,
              height: 28,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: const Color(0xFFD6336C),
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 3),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x66000000),
                    blurRadius: 6,
                    offset: Offset(0, 2),
                  ),
                ],
              ),
              child: Text(
                '${m.n}',
                textDirection: TextDirection.ltr,
                style: const TextStyle(
                  fontFamily: 'Roboto',
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                  height: 1,
                ),
              ),
            ),
          ),
      ],
    ),
  );
}

/// Sets the phone size; [height] for a long screen captured whole.
void phone(WidgetTester tester, {double height = phoneHeight}) {
  tester.view.physicalSize = Size(phoneWidth * pixelRatio, height * pixelRatio);
  tester.view.devicePixelRatio = pixelRatio;
  addTearDown(tester.view.reset);
}

bool _fontsLoaded = false;

/// Loads Roboto, a monospace face and the Material icons once.
Future<void> loadFonts() async {
  if (_fontsLoaded) return;
  final dir = _materialFontsDir();
  Future<ByteData> read(String path) async =>
      ByteData.sublistView(await File(path).readAsBytes());
  final roboto = FontLoader('Roboto');
  for (final f in [
    'Roboto-Regular.ttf',
    'Roboto-Medium.ttf',
    'Roboto-Bold.ttf',
    'Roboto-Black.ttf',
    'Roboto-Light.ttf',
  ]) {
    roboto.addFont(read('$dir/$f'));
  }
  await roboto.load();
  final icons = FontLoader('MaterialIcons')
    ..addFont(read('$dir/MaterialIcons-Regular.otf'));
  await icons.load();
  // "monospace" on the QR screen: DejaVu Sans Mono where installed.
  const mono = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf';
  // Symbols Roboto lacks (the map's north arrow): Android falls back to a
  // system font; here DejaVu Sans where installed.
  const sans = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  if (File(sans).existsSync()) {
    await (FontLoader('DejaVu Sans')..addFont(read(sans))).load();
  }
  final monoLoader = FontLoader('monospace')
    ..addFont(read(File(mono).existsSync() ? mono : '$dir/Roboto-Regular.ttf'));
  await monoLoader.load();
  _fontsLoaded = true;
}

String _materialFontsDir() {
  final env = Platform.environment['KILAVUZ_FONT_DIR'];
  if (env != null && env.isNotEmpty) return env;
  final root = Platform.environment['FLUTTER_ROOT'];
  if (root != null) {
    final d = '$root/bin/cache/artifacts/material_fonts';
    if (Directory(d).existsSync()) return d;
  }
  // flutter_tester lives in bin/cache/artifacts/engine/<platform>/.
  final exe = File(Platform.resolvedExecutable).parent;
  final d = '${exe.parent.parent.path}/material_fonts';
  if (Directory(d).existsSync()) return d;
  throw StateError('Material fonts not found; set KILAVUZ_FONT_DIR');
}

/// Draws [marks], writes `<outDir>/<file>` and removes the marks.
Future<void> shot(
  WidgetTester tester,
  String file, [
  List<Mark> marks = const [],
]) async {
  await tester.pump();
  // Styles without a family (button labels, app bar titles) get the test
  // font in flutter_tester; on a phone they get the platform font, Roboto.
  _patchFonts(tester.binding.renderViews.first);
  _relabelMaps(tester);
  await tester.pump();
  final size = tester.view.physicalSize / tester.view.devicePixelRatio;
  final placed = <_Placed>[];
  for (final m in marks) {
    final found = m.target.evaluate();
    if (found.isEmpty) {
      throw StateError('marker ${m.n} of $file: target not found');
    }
    final r = tester.getRect(m.target.first);
    final c = switch (m.at) {
      MarkAt.left => Offset(r.left - 16, r.center.dy),
      MarkAt.start => Offset(0, r.center.dy),
      MarkAt.end => Offset(size.width, r.center.dy),
      MarkAt.right => Offset(r.right - 18, r.center.dy),
      MarkAt.center => r.center,
      MarkAt.below => Offset(r.center.dx, r.bottom + 14),
      MarkAt.above => Offset(r.center.dx, r.top - 14),
    };
    placed.add(
      _Placed(
        Offset(
          (c.dx + m.dx).clamp(16, size.width - 16),
          c.dy.clamp(16, size.height - 16),
        ),
        m.n,
      ),
    );
  }
  _marks.value = placed;
  debugDisableShadows = false;
  await tester.pump();
  try {
    final boundary =
        _shotKey.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    await tester.runAsync(() async {
      final image = await boundary.toImage(pixelRatio: pixelRatio);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      image.dispose();
      final out = File('$outDir/$file');
      out.parent.createSync(recursive: true);
      out.writeAsBytesSync(bytes!.buffer.asUint8List());
    });
  } finally {
    _marks.value = const [];
    debugDisableShadows = true;
    await tester.pump();
  }
  debugPrint('kilavuz: $file');
}

/// Scrolls the screen so that [finder] sits near the top ([alignment] of
/// the viewport).
Future<void> scrollTo(
  WidgetTester tester,
  Finder finder, {
  double alignment = 0.02,
}) async {
  if (finder.evaluate().isEmpty) {
    await tester.scrollUntilVisible(
      finder,
      200,
      scrollable: find.byType(Scrollable).first,
    );
  }
  await Scrollable.ensureVisible(
    tester.element(finder.first),
    alignment: alignment,
  );
  await tester.pumpAndSettle();
}

/// Gives every paragraph without a font family Roboto, like Android does.
void _patchFonts(RenderObject o) {
  if (o is RenderParagraph) {
    final t = o.text;
    if (t is TextSpan && t.style?.fontFamily == null) {
      o.text = TextSpan(
        text: t.text,
        children: t.children,
        style: (t.style ?? const TextStyle()).copyWith(fontFamily: 'Roboto'),
        recognizer: t.recognizer,
        semanticsLabel: t.semanticsLabel,
        locale: t.locale,
        spellOut: t.spellOut,
      );
    }
  }
  o.visitChildren(_patchFonts);
}

/// The offline map draws its labels with a [TextPainter] without a font
/// family; in flutter_tester they come out as boxes. Before a shot every
/// map's painter is wrapped so that its labels are drawn again with Roboto.
void _relabelMaps(WidgetTester tester) {
  for (final e in find.byType(VectorMap).evaluate()) {
    final map = e.widget as VectorMap;
    void visit(RenderObject o) {
      if (o is RenderCustomPaint &&
          o.painter != null &&
          o.painter is! _RelabelPainter &&
          o.painter.runtimeType.toString() == '_MapPainter') {
        o.painter = _RelabelPainter(o.painter!, map);
      }
      o.visitChildren(visit);
    }

    final ro = e.renderObject;
    if (ro != null) visit(ro);
  }
}

class _RelabelPainter extends CustomPainter {
  _RelabelPainter(this.inner, this.map);

  final CustomPainter inner;
  final VectorMap map;

  @override
  void paint(Canvas canvas, Size size) {
    // Same order as the map painter: labelled dots, scale bar, north.
    final labels = <String>[
      for (final d in map.dots)
        if (d.label != null) d.label!,
      '${_scaleMetres(size)} m',
      'K ↑',
    ];
    inner.paint(_RelabelCanvas(canvas, labels), size);
  }

  /// The scale bar's length in metres, as the map painter picks it.
  int _scaleMetres(Size size) {
    final all = <GeoPoint>[
      ...?map.boundary,
      ...?map.draft,
      for (final l in map.lines) ...l.points,
      for (final d in map.dots) d.at,
      for (final t in map.tracks) ...t,
      ?map.here,
    ];
    final proj = LocalProjection(all.first);
    final pts = [for (final p in all) proj.toLocal(p)];
    double span(Iterable<double> v) =>
        math.max(v.reduce(math.max) - v.reduce(math.min), 20.0);
    final spanE = span(pts.map((p) => p.e));
    final spanN = span(pts.map((p) => p.n));
    final scale = math.min(
      (size.width - 32) / spanE,
      (size.height - 32) / spanN,
    );
    const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    final target = size.width / 4 / scale;
    return steps.lastWhere((s) => s <= target, orElse: () => 1);
  }

  @override
  bool shouldRepaint(CustomPainter oldDelegate) => true;
}

/// Passes drawing through and replaces each paragraph with [labels] in
/// order, drawn in Roboto.
class _RelabelCanvas implements Canvas {
  _RelabelCanvas(this.c, this.labels);

  final Canvas c;
  final List<String> labels;
  int _next = 0;

  @override
  void drawParagraph(ui.Paragraph paragraph, Offset offset) {
    if (_next >= labels.length) return c.drawParagraph(paragraph, offset);
    final tp = TextPainter(
      text: TextSpan(
        text: labels[_next++],
        style: const TextStyle(
          fontFamily: 'Roboto',
          fontFamilyFallback: ['DejaVu Sans'],
          fontSize: 12,
          color: Brand.text,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(c, offset);
    tp.dispose();
  }

  @override
  void drawPath(Path path, Paint paint) => c.drawPath(path, paint);

  @override
  void drawLine(Offset p1, Offset p2, Paint paint) => c.drawLine(p1, p2, paint);

  @override
  void drawCircle(Offset c0, double radius, Paint paint) =>
      c.drawCircle(c0, radius, paint);

  @override
  void drawRect(Rect rect, Paint paint) => c.drawRect(rect, paint);

  @override
  void drawRRect(RRect rrect, Paint paint) => c.drawRRect(rrect, paint);

  @override
  void save() => c.save();

  @override
  void restore() => c.restore();

  @override
  void translate(double dx, double dy) => c.translate(dx, dy);

  @override
  void clipRect(
    Rect rect, {
    ui.ClipOp clipOp = ui.ClipOp.intersect,
    bool doAntiAlias = true,
  }) => c.clipRect(rect, clipOp: clipOp, doAntiAlias: doAntiAlias);

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('map canvas: ${invocation.memberName}');
}
