/// Thresholds of the on-device photo quality check (docs/MVP.md, Modül 3,
/// "Kalite kapısı"). All tunable values live here.
///
/// Change [photoQualityCheckVersion] whenever a value changes: the version is
/// stored on every capture so that results stay comparable.
library;

/// Stored as `qc_version` on every capture.
const String photoQualityCheckVersion = 'photo-qc-v1';

class PhotoQualityConfig {
  const PhotoQualityConfig({
    required this.analysisLongEdge,
    required this.sharpnessReject,
    required this.sharpnessWarn,
    required this.darkPixelLevel,
    required this.brightPixelLevel,
    required this.meanDarkReject,
    required this.meanDarkWarn,
    required this.meanBrightReject,
    required this.meanBrightWarn,
    required this.darkClippedReject,
    required this.darkClippedWarn,
    required this.brightClippedReject,
    required this.brightClippedWarn,
  });

  /// The photo is downscaled (box average) so that its long edge is at most
  /// this many pixels before any metric is computed. Metrics depend on it.
  final int analysisLongEdge;

  /// Variance of the Laplacian of the luminance (0–255 scale). Below
  /// [sharpnessReject] the photo is rejected as blurry, below
  /// [sharpnessWarn] it gets a warning.
  final double sharpnessReject;
  final double sharpnessWarn;

  /// Luminance at or below / at or above which a pixel counts as clipped.
  final int darkPixelLevel;
  final int brightPixelLevel;

  /// Mean luminance limits (0–255).
  final double meanDarkReject;
  final double meanDarkWarn;
  final double meanBrightReject;
  final double meanBrightWarn;

  /// Share of clipped pixels (0–1).
  final double darkClippedReject;
  final double darkClippedWarn;
  final double brightClippedReject;
  final double brightClippedWarn;

  /// Defaults tuned on synthetic orchard-like scenes; see README
  /// ("Kamera ve kalite kontrolü") and test/unit/photo_quality_test.dart.
  static const PhotoQualityConfig defaults = PhotoQualityConfig(
    analysisLongEdge: 480,
    sharpnessReject: 60,
    sharpnessWarn: 250,
    darkPixelLevel: 12,
    brightPixelLevel: 243,
    meanDarkReject: 35,
    meanDarkWarn: 65,
    meanBrightReject: 225,
    meanBrightWarn: 200,
    darkClippedReject: 0.5,
    darkClippedWarn: 0.25,
    brightClippedReject: 0.4,
    brightClippedWarn: 0.15,
  );
}
