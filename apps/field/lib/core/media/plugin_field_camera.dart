import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

import 'field_camera.dart';

/// [FieldCamera] on the `camera` package: back camera, flash off, no audio.
///
/// Not covered by tests (needs a device); see README for the manual checks.
class PluginFieldCamera implements FieldCamera {
  /// 1080p: enough detail for close-ups, and the quality check decodes it in
  /// well under a second.
  static const ResolutionPreset resolution = ResolutionPreset.veryHigh;

  CameraController? _controller;

  @override
  Future<CameraOpenResult> open() async {
    final status = await Permission.camera.request();
    if (status.isPermanentlyDenied || status.isRestricted) {
      return CameraOpenResult.permissionBlocked;
    }
    if (!status.isGranted && !status.isLimited) {
      return CameraOpenResult.permissionDenied;
    }
    await close();
    final List<CameraDescription> cameras;
    try {
      cameras = await availableCameras();
    } on CameraException {
      return CameraOpenResult.failed;
    }
    final back = cameras
        .where((c) => c.lensDirection == CameraLensDirection.back)
        .firstOrNull;
    if (back == null) return CameraOpenResult.noCamera;
    final controller = CameraController(
      back,
      resolution,
      enableAudio: false,
      imageFormatGroup: ImageFormatGroup.jpeg,
    );
    try {
      await controller.initialize();
      await controller.setFlashMode(FlashMode.off);
      await controller.setFocusMode(FocusMode.auto);
      await controller.setExposureMode(ExposureMode.auto);
    } on CameraException catch (e) {
      await controller.dispose();
      return switch (e.code) {
        'CameraAccessDenied' => CameraOpenResult.permissionDenied,
        'CameraAccessDeniedWithoutPrompt' ||
        'CameraAccessRestricted' => CameraOpenResult.permissionBlocked,
        _ => CameraOpenResult.failed,
      };
    }
    _controller = controller;
    return CameraOpenResult.ready;
  }

  CameraController get _ready {
    final c = _controller;
    if (c == null || !c.value.isInitialized) {
      throw StateError('camera is not open');
    }
    return c;
  }

  @override
  Widget buildPreview(BuildContext context) => CameraPreview(_ready);

  @override
  double get previewAspectRatio {
    final c = _controller;
    if (c == null || !c.value.isInitialized) return 3 / 4;
    // The plugin reports the sensor's landscape ratio; the app is portrait.
    return 1 / c.value.aspectRatio;
  }

  @override
  Future<void> setFocusPoint(Offset point) async {
    final c = _ready;
    try {
      if (c.value.focusPointSupported) await c.setFocusPoint(point);
      if (c.value.exposurePointSupported) await c.setExposurePoint(point);
    } on CameraException {
      // Tap-to-focus is a convenience; autofocus keeps working without it.
    }
  }

  @override
  Future<CameraShot> takePicture() async {
    final c = _ready;
    // Make sure the flash stays off even if the platform reset it.
    await c.setFlashMode(FlashMode.off);
    final file = await c.takePicture();
    final bytes = await file.readAsBytes();
    // The plugin writes to the cache; the app keeps its own hashed copy.
    try {
      await File(file.path).delete();
    } on FileSystemException {
      // Cache files are cleaned up by the system anyway.
    }
    return CameraShot(bytes: bytes);
  }

  @override
  Future<void> close() async {
    final c = _controller;
    _controller = null;
    await c?.dispose();
  }

  @override
  Future<void> openSettings() => openAppSettings();
}
