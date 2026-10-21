import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/db/field_repository.dart';
import '../../core/media/media_store.dart';
import 'capture_screen.dart';

/// Opens the in-app camera and stores the photo the crew chose to use under
/// its hash. Returns null when cancelled (or only rejected photos were
/// taken). The database rows are written by the caller, together with the
/// record the photo belongs to; [replacing] is a previous, never saved photo
/// whose file is dropped when the new one differs.
Future<PendingShot?> takePhoto(
  BuildContext context,
  WidgetRef ref, {
  required String shotCode,
  required String title,
  required String hint,
  PendingShot? replacing,
}) async {
  final photo = await Navigator.of(context).push<CapturedPhoto>(
    MaterialPageRoute(
      builder: (_) => CaptureScreen(title: title, hint: hint),
    ),
  );
  if (photo == null || !photo.quality.canSave) return null;
  final bytes = photo.shot.bytes;
  final hash = sha256Hex(bytes);
  final store = ref.read(mediaStoreProvider);
  final path = await store.put(bytes, sha256: hash);
  if (replacing != null && replacing.sha256 != hash) {
    await store.discard(replacing.localPath);
  }
  return PendingShot(
    shotCode: shotCode,
    sha256: hash,
    localPath: path,
    mediaType: photo.shot.mediaType,
    byteSize: bytes.length,
    capturedAt: photo.capturedAt,
    gpsTimeMs: photo.time.gpsTimeMs,
    timeSource: photo.time.source,
    quality: photo.quality,
  );
}
