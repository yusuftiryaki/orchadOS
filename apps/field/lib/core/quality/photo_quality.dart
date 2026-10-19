import 'dart:isolate';
import 'dart:typed_data';

import 'package:image/image.dart' as img;

import 'quality_config.dart';

/// Outcome of the check. Only [accept] and [warn] photos may be saved.
enum QualityVerdict {
  accept('accept'),
  warn('warn'),
  reject('reject');

  const QualityVerdict(this.code);

  /// Value stored in the database.
  final String code;
}

/// Why a photo got a warning or was rejected.
enum QualityIssue { unreadable, tooDark, tooBright, blurry }

class QualityFinding {
  const QualityFinding(this.issue, this.verdict);

  final QualityIssue issue;

  /// [QualityVerdict.warn] or [QualityVerdict.reject].
  final QualityVerdict verdict;

  /// Plain message for the field crew.
  String get message => switch ((issue, verdict)) {
    (QualityIssue.unreadable, _) => 'Fotoğraf okunamadı. Tekrar çekin.',
    (QualityIssue.tooDark, QualityVerdict.reject) =>
      'Fotoğraf çok karanlık. Işığı arkanıza alıp tekrar çekin.',
    (QualityIssue.tooDark, _) =>
      'Fotoğraf biraz karanlık. Ayrıntılar görünüyorsa kullanın.',
    (QualityIssue.tooBright, QualityVerdict.reject) =>
      'Fotoğraf çok parlak. Güneşi arkanıza alıp tekrar çekin.',
    (QualityIssue.tooBright, _) =>
      'Fotoğraf biraz parlak. Ayrıntılar görünüyorsa kullanın.',
    (QualityIssue.blurry, QualityVerdict.reject) =>
      'Fotoğraf bulanık. Telefonu sabit tutup tekrar çekin.',
    (QualityIssue.blurry, _) =>
      'Fotoğraf biraz bulanık olabilir. Netse kullanın, değilse tekrar çekin.',
  };

  @override
  String toString() => '${issue.name}:${verdict.code}';
}

/// Metrics computed on the downscaled luminance image.
class QualityScores {
  const QualityScores({
    required this.sharpness,
    required this.meanBrightness,
    required this.darkClippedRatio,
    required this.brightClippedRatio,
    required this.analysisWidth,
    required this.analysisHeight,
  });

  /// Variance of the 4-neighbour Laplacian (luminance 0–255).
  final double sharpness;

  /// Mean luminance, 0–255.
  final double meanBrightness;

  /// Share of pixels at or below / at or above the clipping levels.
  final double darkClippedRatio;
  final double brightClippedRatio;

  final int analysisWidth;
  final int analysisHeight;

  @override
  String toString() =>
      'sharpness=${sharpness.toStringAsFixed(1)} '
      'mean=${meanBrightness.toStringAsFixed(1)} '
      'dark=${darkClippedRatio.toStringAsFixed(3)} '
      'bright=${brightClippedRatio.toStringAsFixed(3)}';
}

class QualityResult {
  const QualityResult({
    required this.verdict,
    required this.findings,
    required this.scores,
    this.version = photoQualityCheckVersion,
  });

  final QualityVerdict verdict;

  /// Most important first: rejections before warnings, exposure before
  /// sharpness (a dark photo also measures as blurry).
  final List<QualityFinding> findings;

  /// Null when the photo could not be decoded.
  final QualityScores? scores;

  /// Check version ([photoQualityCheckVersion]).
  final String version;

  bool get canSave => verdict != QualityVerdict.reject;

  /// The message to show, or null when the photo is fine.
  String? get message => findings.isEmpty ? null : findings.first.message;
}

/// Grayscale image as luminance values, row-major.
class LumaImage {
  LumaImage(this.width, this.height, this.pixels)
    : assert(pixels.length == width * height);

  final int width;
  final int height;
  final Float64List pixels;
}

/// Decodes [bytes] (JPEG or any format the `image` package reads) and
/// returns its luminance downscaled by box averaging so that the long edge
/// is at most [longEdge]. Null if the bytes cannot be decoded.
LumaImage? decodeLuma(Uint8List bytes, {required int longEdge}) {
  final img.Image? decoded;
  try {
    decoded = img.decodeImage(bytes);
  } on Object {
    return null;
  }
  if (decoded == null || decoded.width < 3 || decoded.height < 3) return null;
  return downscaleLuma(decoded, longEdge: longEdge);
}

LumaImage downscaleLuma(img.Image src, {required int longEdge}) {
  final w = src.width;
  final h = src.height;
  final long = w > h ? w : h;
  final factor = long <= longEdge ? 1 : (long + longEdge - 1) ~/ longEdge;
  final ow = w ~/ factor;
  final oh = h ~/ factor;
  final sums = Float64List(ow * oh);
  // 8-bit RGB, whatever the decoded format was (JPEG already is).
  final rgb = src
      .convert(format: img.Format.uint8, numChannels: 3)
      .getBytes(order: img.ChannelOrder.rgb);
  final usedW = ow * factor;
  final usedH = oh * factor;
  for (var y = 0; y < usedH; y++) {
    final outRow = (y ~/ factor) * ow;
    var i = y * w * 3;
    for (var x = 0; x < usedW; x++, i += 3) {
      // Rec. 601 luma.
      sums[outRow + x ~/ factor] +=
          0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2];
    }
  }
  final n = (factor * factor).toDouble();
  for (var i = 0; i < sums.length; i++) {
    sums[i] /= n;
  }
  return LumaImage(ow, oh, sums);
}

/// Computes the metrics of [luma].
QualityScores measureLuma(LumaImage luma, PhotoQualityConfig config) {
  final w = luma.width;
  final h = luma.height;
  final px = luma.pixels;
  var sum = 0.0;
  var dark = 0;
  var bright = 0;
  for (final v in px) {
    sum += v;
    if (v <= config.darkPixelLevel) dark++;
    if (v >= config.brightPixelLevel) bright++;
  }
  // Laplacian over the interior: 4·c − up − down − left − right.
  var lSum = 0.0;
  var lSq = 0.0;
  var count = 0;
  for (var y = 1; y < h - 1; y++) {
    final row = y * w;
    for (var x = 1; x < w - 1; x++) {
      final i = row + x;
      final l = 4 * px[i] - px[i - 1] - px[i + 1] - px[i - w] - px[i + w];
      lSum += l;
      lSq += l * l;
      count++;
    }
  }
  final lMean = count == 0 ? 0.0 : lSum / count;
  final variance = count == 0 ? 0.0 : lSq / count - lMean * lMean;
  final total = px.length;
  return QualityScores(
    sharpness: variance,
    meanBrightness: sum / total,
    darkClippedRatio: dark / total,
    brightClippedRatio: bright / total,
    analysisWidth: w,
    analysisHeight: h,
  );
}

/// Applies the thresholds of [config] to [scores].
QualityResult judge(QualityScores scores, PhotoQualityConfig config) {
  final rejects = <QualityFinding>[];
  final warns = <QualityFinding>[];
  void rate(QualityIssue issue, {required bool reject, required bool warn}) {
    if (reject) {
      rejects.add(QualityFinding(issue, QualityVerdict.reject));
    } else if (warn) {
      warns.add(QualityFinding(issue, QualityVerdict.warn));
    }
  }

  final s = scores;
  rate(
    QualityIssue.tooDark,
    reject:
        s.meanBrightness < config.meanDarkReject ||
        s.darkClippedRatio > config.darkClippedReject,
    warn:
        s.meanBrightness < config.meanDarkWarn ||
        s.darkClippedRatio > config.darkClippedWarn,
  );
  rate(
    QualityIssue.tooBright,
    reject:
        s.meanBrightness > config.meanBrightReject ||
        s.brightClippedRatio > config.brightClippedReject,
    warn:
        s.meanBrightness > config.meanBrightWarn ||
        s.brightClippedRatio > config.brightClippedWarn,
  );
  rate(
    QualityIssue.blurry,
    reject: s.sharpness < config.sharpnessReject,
    warn: s.sharpness < config.sharpnessWarn,
  );
  final verdict = rejects.isNotEmpty
      ? QualityVerdict.reject
      : warns.isNotEmpty
      ? QualityVerdict.warn
      : QualityVerdict.accept;
  return QualityResult(
    verdict: verdict,
    findings: [...rejects, ...warns],
    scores: scores,
  );
}

/// Full check of an encoded photo. Pure and synchronous; see
/// [PhotoQualityChecker] for running it off the UI thread.
QualityResult assessPhotoQuality(
  Uint8List bytes, [
  PhotoQualityConfig config = PhotoQualityConfig.defaults,
]) {
  final luma = decodeLuma(bytes, longEdge: config.analysisLongEdge);
  if (luma == null) {
    return const QualityResult(
      verdict: QualityVerdict.reject,
      findings: [
        QualityFinding(QualityIssue.unreadable, QualityVerdict.reject),
      ],
      scores: null,
    );
  }
  return judge(measureLuma(luma, config), config);
}

/// Runs [assessPhotoQuality]. Decoding a camera JPEG takes hundreds of
/// milliseconds on a phone, so by default the work runs in a separate
/// isolate and the UI keeps animating.
class PhotoQualityChecker {
  const PhotoQualityChecker({
    this.config = PhotoQualityConfig.defaults,
    this.useIsolate = true,
  });

  final PhotoQualityConfig config;

  /// False runs the check on the calling isolate (widget tests).
  final bool useIsolate;

  Future<QualityResult> check(Uint8List bytes) {
    final config = this.config;
    if (!useIsolate) return Future.value(assessPhotoQuality(bytes, config));
    return Isolate.run(() => assessPhotoQuality(bytes, config));
  }
}
