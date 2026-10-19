import 'dart:typed_data';

import 'package:flutter/material.dart';

import 'synthetic_photo.dart';

/// A photo straight from the in-app camera.
class CameraShot {
  const CameraShot({required this.bytes, this.mediaType = 'image/jpeg'});

  final Uint8List bytes;
  final String mediaType;
}

/// Result of [FieldCamera.open].
enum CameraOpenResult {
  ready,

  /// The user said no; asking again may show the system dialog.
  permissionDenied,

  /// Denied for good ("don't ask again") or restricted: only the system
  /// settings can grant it.
  permissionBlocked,

  /// The phone has no back camera.
  noCamera,

  /// The camera could not be started (in use by another app, hardware error).
  failed,
}

/// In-app camera. Photos are only taken through this interface; the app has
/// no gallery picker on purpose (docs/MVP.md, Modül 3, close-up protocol).
///
/// Lifecycle: [open] (asks for permission, starts the back camera with the
/// flash off), then [buildPreview] / [setFocusPoint] / [takePicture], then
/// [close]. The capture screen closes the camera when the app goes to the
/// background and opens it again on return.
abstract interface class FieldCamera {
  Future<CameraOpenResult> open();

  /// Live preview; only valid after [open] returned [CameraOpenResult.ready].
  Widget buildPreview(BuildContext context);

  /// Aspect ratio (width / height) of the preview in portrait.
  double get previewAspectRatio;

  /// Focus and exposure on [point] (0–1 in both axes, top-left origin, in
  /// preview coordinates). No-op where the camera does not support it.
  Future<void> setFocusPoint(Offset point);

  Future<CameraShot> takePicture();

  Future<void> close();

  /// Opens the app's page in the system settings (to grant the permission).
  Future<void> openSettings();
}

/// Camera for tests, emulators and demos: synthetic JPEG photos.
///
/// Each picture is the next kind from [script] (then [SyntheticPhotoKind.sharp])
/// with a different seed, so every photo has a different hash.
class FakeFieldCamera implements FieldCamera {
  FakeFieldCamera({
    List<SyntheticPhotoKind> script = const [],
    this.openResult = CameraOpenResult.ready,
  }) : script = [...script];

  /// Kinds of the next pictures, consumed in order.
  final List<SyntheticPhotoKind> script;

  /// What [open] returns; tests change it to simulate a granted permission.
  CameraOpenResult openResult;

  int _count = 0;
  int openCount = 0;
  int settingsOpened = 0;
  bool isOpen = false;
  final List<Offset> focusPoints = [];

  /// Number of pictures taken so far.
  int get count => _count;

  @override
  Future<CameraOpenResult> open() async {
    openCount++;
    isOpen = openResult == CameraOpenResult.ready;
    return openResult;
  }

  @override
  Widget buildPreview(BuildContext context) => const ColoredBox(
    key: Key('fake-camera-preview'),
    color: Color(0xFF2E4A2E),
    child: Center(
      child: Text(
        'Sahte kamera',
        style: TextStyle(color: Colors.white70, fontSize: 18),
      ),
    ),
  );

  @override
  double get previewAspectRatio => 3 / 4;

  @override
  Future<void> setFocusPoint(Offset point) async => focusPoints.add(point);

  @override
  Future<CameraShot> takePicture() async {
    if (!isOpen) throw StateError('camera is not open');
    _count++;
    final kind = script.isEmpty ? SyntheticPhotoKind.sharp : script.removeAt(0);
    return CameraShot(bytes: syntheticPhotoJpeg(kind, seed: _count));
  }

  @override
  Future<void> close() async => isOpen = false;

  @override
  Future<void> openSettings() async => settingsOpened++;
}
