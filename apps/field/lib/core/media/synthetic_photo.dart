import 'dart:math';
import 'dart:typed_data';

import 'package:image/image.dart' as img;

/// Kinds of synthetic photos for the fake camera and the quality tests.
enum SyntheticPhotoKind {
  /// In focus, well exposed.
  sharp(blur: 0, gain: 1, bias: 0),

  /// Slightly out of focus: a warning, not a rejection.
  soft(blur: 1, gain: 1, bias: 0),

  /// Motion or focus blur: rejected.
  blurry(blur: 3, gain: 1, bias: 0),

  /// Under a canopy at dusk: a warning.
  dim(blur: 0, gain: 0.5, bias: 0),

  /// Night or lens covered: rejected.
  dark(blur: 0, gain: 0.18, bias: 0),

  /// Direct sun into the lens: rejected.
  overexposed(blur: 0, gain: 1.6, bias: 90);

  const SyntheticPhotoKind({
    required this.blur,
    required this.gain,
    required this.bias,
  });

  /// Gaussian blur radius in pixels of a 480 px wide image.
  final int blur;

  /// Exposure: `value · gain + bias`, clamped to 0–255.
  final double gain;
  final double bias;
}

/// Draws an orchard-like scene: a sky band, dark trunks and branches, leaf
/// blobs and a few-pixel bark/soil texture, so that sharpness and exposure
/// metrics behave like on a real close-up. [seed] makes every photo unique.
img.Image syntheticScene({
  required int width,
  required int height,
  int seed = 0,
  int blur = 0,
  double gain = 1,
  double bias = 0,
}) {
  final rnd = Random(seed);
  // Sizes are relative to a 480 px wide image so that the scene looks the
  // same at any resolution once downscaled for analysis.
  final scale = width / 480;
  // Bark/soil texture on a 3 px grid (at 480 px).
  final cell = max(1, (3 * scale).round());
  final cw = width ~/ cell + 2;
  final ch = height ~/ cell + 2;
  final texture = Float64List(cw * ch);
  for (var i = 0; i < texture.length; i++) {
    texture[i] = rnd.nextDouble() * 50 - 25;
  }
  final scene = img.Image(width: width, height: height);
  final skyLine = height * (0.15 + rnd.nextDouble() * 0.1);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      double r, g, b;
      if (y < skyLine) {
        r = 150;
        g = 185;
        b = 215;
      } else {
        final t = texture[(y ~/ cell) * cw + x ~/ cell];
        final wave = 18 * sin(x * 0.045 + seed) * cos(y * 0.03);
        r = 120 + t + wave;
        g = 105 + t + wave;
        b = 80 + t + wave;
      }
      scene.setPixelRgb(x, y, r, g, b);
    }
  }
  // Leaves.
  for (var i = 0; i < 40; i++) {
    img.fillCircle(
      scene,
      x: rnd.nextInt(width),
      y: rnd.nextInt(height),
      radius: ((4 + rnd.nextInt(17)) * scale).round(),
      color: img.ColorRgb8(
        60 + rnd.nextInt(40),
        130 + rnd.nextInt(60),
        50 + rnd.nextInt(30),
      ),
    );
  }
  // Trunks and branches.
  for (var i = 0; i < 3; i++) {
    final x = rnd.nextInt(width);
    final w = width ~/ 30 + rnd.nextInt(width ~/ 20 + 1);
    img.fillRect(
      scene,
      x1: x,
      y1: (skyLine * 0.5).round(),
      x2: x + w,
      y2: height - 1,
      color: img.ColorRgb8(70, 55, 45),
    );
  }
  for (var i = 0; i < 12; i++) {
    img.drawLine(
      scene,
      x1: rnd.nextInt(width),
      y1: rnd.nextInt(height),
      x2: rnd.nextInt(width),
      y2: rnd.nextInt(height),
      color: img.ColorRgb8(55, 45, 35),
      thickness: (2 + rnd.nextInt(4)) * scale,
    );
  }
  final radius = (blur * scale).round();
  final blurred = radius > 0 ? img.gaussianBlur(scene, radius: radius) : scene;
  if (gain != 1 || bias != 0) {
    for (final p in blurred) {
      p
        ..r = (p.r * gain + bias).clamp(0, 255)
        ..g = (p.g * gain + bias).clamp(0, 255)
        ..b = (p.b * gain + bias).clamp(0, 255);
    }
  }
  return blurred;
}

/// A synthetic photo of [kind] encoded as JPEG.
Uint8List syntheticPhotoJpeg(
  SyntheticPhotoKind kind, {
  int width = 480,
  int height = 360,
  int seed = 0,
}) => img.encodeJpg(
  syntheticScene(
    width: width,
    height: height,
    seed: seed,
    blur: kind.blur,
    gain: kind.gain,
    bias: kind.bias,
  ),
  quality: 90,
);
