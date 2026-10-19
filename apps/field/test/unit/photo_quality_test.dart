import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:orchados_field/core/media/synthetic_photo.dart';
import 'package:orchados_field/core/quality/photo_quality.dart';
import 'package:orchados_field/core/quality/quality_config.dart';

/// All images are generated here; none are stored in the repository.
void main() {
  const config = PhotoQualityConfig.defaults;

  QualityResult assess(SyntheticPhotoKind kind, {int seed = 1, int w = 480}) =>
      assessPhotoQuality(
        syntheticPhotoJpeg(kind, width: w, height: w * 3 ~/ 4, seed: seed),
      );

  Uint8List flat(int value, {int w = 200, int h = 150}) => img.encodePng(
    img.Image(width: w, height: h)..clear(img.ColorRgb8(value, value, value)),
  );

  group('sharpness (variance of the Laplacian)', () {
    test('sharp photos score far above blurred ones', () {
      for (var seed = 0; seed < 4; seed++) {
        final sharp = assess(SyntheticPhotoKind.sharp, seed: seed);
        final soft = assess(SyntheticPhotoKind.soft, seed: seed);
        final blurry = assess(SyntheticPhotoKind.blurry, seed: seed);
        final s = sharp.scores!.sharpness;
        final m = soft.scores!.sharpness;
        final b = blurry.scores!.sharpness;
        expect(s, greaterThan(config.sharpnessWarn * 2), reason: 'seed $seed');
        expect(
          m,
          inExclusiveRange(config.sharpnessReject, config.sharpnessWarn),
        );
        expect(b, lessThan(config.sharpnessReject / 2));
        expect(sharp.verdict, QualityVerdict.accept);
        expect(soft.verdict, QualityVerdict.warn);
        expect(soft.findings.single.issue, QualityIssue.blurry);
        expect(blurry.verdict, QualityVerdict.reject);
        expect(blurry.findings.single.issue, QualityIssue.blurry);
      }
    });

    test('same verdicts at camera resolution (downscaled to 480 px)', () {
      final sharp = assess(SyntheticPhotoKind.sharp, w: 1440);
      final soft = assess(SyntheticPhotoKind.soft, w: 1440);
      expect(sharp.scores!.analysisWidth, 480);
      expect(sharp.scores!.analysisHeight, 360);
      expect(sharp.verdict, QualityVerdict.accept);
      expect(soft.verdict, QualityVerdict.warn);
    });

    test('a flat image has no detail at all', () {
      final r = assessPhotoQuality(flat(128));
      expect(r.scores!.sharpness, closeTo(0, 1e-6));
      expect(r.verdict, QualityVerdict.reject);
      expect(r.message, 'Fotoğraf bulanık. Telefonu sabit tutup tekrar çekin.');
    });
  });

  group('exposure', () {
    test('dark, dim, normal and overexposed', () {
      final normal = assess(SyntheticPhotoKind.sharp);
      final dim = assess(SyntheticPhotoKind.dim);
      final dark = assess(SyntheticPhotoKind.dark);
      final over = assess(SyntheticPhotoKind.overexposed);

      expect(
        normal.scores!.meanBrightness,
        inExclusiveRange(config.meanDarkWarn, config.meanBrightWarn),
      );
      expect(normal.scores!.darkClippedRatio, lessThan(0.01));
      expect(normal.scores!.brightClippedRatio, lessThan(0.01));

      expect(dim.verdict, QualityVerdict.warn);
      expect(dim.findings.first.issue, QualityIssue.tooDark);

      expect(dark.scores!.meanBrightness, lessThan(config.meanDarkReject));
      expect(dark.verdict, QualityVerdict.reject);
      // Exposure is named first: a dark photo also measures as blurry.
      expect(dark.findings.first.issue, QualityIssue.tooDark);
      expect(dark.message, contains('karanlık'));

      expect(
        over.scores!.brightClippedRatio,
        greaterThan(config.brightClippedReject),
      );
      expect(over.verdict, QualityVerdict.reject);
      expect(over.findings.first.issue, QualityIssue.tooBright);
      expect(over.message, contains('parlak'));
    });

    test('clipped pixel ratios', () {
      final black = assessPhotoQuality(flat(0));
      expect(black.scores!.darkClippedRatio, 1);
      expect(black.scores!.brightClippedRatio, 0);
      final white = assessPhotoQuality(flat(255));
      expect(white.scores!.brightClippedRatio, 1);
      expect(white.findings.first.issue, QualityIssue.tooBright);
    });
  });

  group('judge', () {
    QualityScores scores({
      double sharpness = 800,
      double mean = 110,
      double dark = 0,
      double bright = 0,
    }) => QualityScores(
      sharpness: sharpness,
      meanBrightness: mean,
      darkClippedRatio: dark,
      brightClippedRatio: bright,
      analysisWidth: 480,
      analysisHeight: 360,
    );

    test('thresholds from the configuration', () {
      expect(judge(scores(), config).verdict, QualityVerdict.accept);
      expect(judge(scores(), config).message, isNull);
      expect(
        judge(scores(sharpness: config.sharpnessWarn - 1), config).verdict,
        QualityVerdict.warn,
      );
      expect(
        judge(scores(sharpness: config.sharpnessReject - 1), config).verdict,
        QualityVerdict.reject,
      );
      expect(
        judge(scores(dark: config.darkClippedWarn + 0.01), config).verdict,
        QualityVerdict.warn,
      );
      expect(
        judge(
          scores(bright: config.brightClippedReject + 0.01),
          config,
        ).verdict,
        QualityVerdict.reject,
      );
    });

    test('rejections come before warnings', () {
      final r = judge(
        scores(sharpness: 10, mean: config.meanBrightWarn + 1),
        config,
      );
      expect(r.verdict, QualityVerdict.reject);
      expect(r.findings.map((f) => f.toString()), [
        'blurry:reject',
        'tooBright:warn',
      ]);
      expect(r.version, photoQualityCheckVersion);
      expect(r.canSave, isFalse);
    });

    test('every finding has a plain message', () {
      for (final issue in QualityIssue.values) {
        for (final v in [QualityVerdict.warn, QualityVerdict.reject]) {
          expect(QualityFinding(issue, v).message, isNotEmpty);
        }
      }
    });
  });

  test('unreadable bytes are rejected', () {
    final r = assessPhotoQuality(Uint8List.fromList([0xFF, 0xD8, 1, 2, 3]));
    expect(r.verdict, QualityVerdict.reject);
    expect(r.scores, isNull);
    expect(r.findings.single.issue, QualityIssue.unreadable);
  });

  test('downscaling averages blocks and keeps the aspect ratio', () {
    final src = img.Image(width: 1920, height: 1080)
      ..clear(img.ColorRgb8(100, 100, 100));
    final luma = downscaleLuma(src, longEdge: 480);
    expect(luma.width, 480);
    expect(luma.height, 270);
    expect(luma.pixels.every((v) => (v - 100).abs() < 1e-9), isTrue);
    final small = downscaleLuma(
      img.Image(width: 300, height: 200),
      longEdge: 480,
    );
    expect((small.width, small.height), (300, 200));
  });

  test('the isolate checker gives the same result', () async {
    final bytes = syntheticPhotoJpeg(SyntheticPhotoKind.soft, seed: 3);
    final inIsolate = await const PhotoQualityChecker().check(bytes);
    final direct = await const PhotoQualityChecker(useIsolate: false)
        .check(bytes);
    expect(inIsolate.verdict, direct.verdict);
    expect(inIsolate.scores!.sharpness, direct.scores!.sharpness);
    expect(inIsolate.scores!.meanBrightness, direct.scores!.meanBrightness);
  });
}
