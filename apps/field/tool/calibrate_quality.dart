// Prints quality metrics of synthetic photos at several resolutions; used
// to tune lib/core/quality/quality_config.dart.
// Run: dart run tool/calibrate_quality.dart
// ignore_for_file: avoid_print

import 'package:image/image.dart' as img;
import 'package:orchados_field/core/media/synthetic_photo.dart';
import 'package:orchados_field/core/quality/photo_quality.dart';
import 'package:orchados_field/core/quality/quality_config.dart';

void main() {
  const config = PhotoQualityConfig.defaults;
  for (final (w, h) in [(480, 360), (1440, 1080), (1920, 1080)]) {
    for (final blur in [0, 1, 2, 3, 4]) {
      for (final gain in [0.18, 0.5, 1.0]) {
        final values = <String>[];
        for (var seed = 0; seed < 4; seed++) {
          final scene = syntheticScene(
            width: w,
            height: h,
            seed: seed,
            blur: blur,
            gain: gain,
          );
          final r = assessPhotoQuality(
            img.encodeJpg(scene, quality: 90),
            config,
          );
          values.add(
            '${r.scores!.sharpness.toStringAsFixed(0)}/'
            '${r.scores!.meanBrightness.toStringAsFixed(0)}/${r.verdict.code}',
          );
        }
        print('${w}x$h blur=$blur gain=$gain  ${values.join("  ")}');
      }
    }
    for (final k in SyntheticPhotoKind.values) {
      final r = assessPhotoQuality(
        syntheticPhotoJpeg(k, width: w, height: h, seed: 7),
        config,
      );
      print(
        '${w}x$h ${k.name}: ${r.scores} -> ${r.verdict.code} ${r.findings}',
      );
    }
  }
}
