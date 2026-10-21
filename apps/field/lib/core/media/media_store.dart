import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:path/path.dart' as p;

/// SHA-256 of [bytes] as lowercase hex.
String sha256Hex(List<int> bytes) => sha256.convert(bytes).toString();

/// Content-addressed storage for photos. A file is written once under its
/// hash and never modified.
abstract interface class MediaStore {
  /// Stores [bytes] under [sha256] and returns the local path.
  Future<String> put(Uint8List bytes, {required String sha256, String ext});

  /// Removes a file that was never registered in the database (a discarded
  /// retake).
  Future<void> discard(String path);

  /// Bytes of a stored file; null when it is gone.
  Future<Uint8List?> read(String path);

  /// Removes a registered file after the sync has verified that the server
  /// holds it (same hash, object present). Nothing else deletes registered
  /// media.
  Future<void> release(String path);
}

class FileMediaStore implements MediaStore {
  FileMediaStore(this.directory);

  final Directory directory;

  @override
  Future<String> put(
    Uint8List bytes, {
    required String sha256,
    String ext = 'jpg',
  }) async {
    await directory.create(recursive: true);
    final file = File(p.join(directory.path, '$sha256.$ext'));
    if (!await file.exists()) {
      final tmp = File('${file.path}.tmp');
      await tmp.writeAsBytes(bytes, flush: true);
      await tmp.rename(file.path);
    }
    return file.path;
  }

  @override
  Future<void> discard(String path) async {
    final f = File(path);
    if (await f.exists()) await f.delete();
  }

  @override
  Future<Uint8List?> read(String path) async {
    final f = File(path);
    return await f.exists() ? f.readAsBytes() : null;
  }

  @override
  Future<void> release(String path) => discard(path);
}

class MemoryMediaStore implements MediaStore {
  final Map<String, Uint8List> files = {};

  @override
  Future<String> put(
    Uint8List bytes, {
    required String sha256,
    String ext = 'jpg',
  }) async {
    final path = 'mem://$sha256.$ext';
    files.putIfAbsent(path, () => bytes);
    return path;
  }

  @override
  Future<void> discard(String path) async => files.remove(path);

  @override
  Future<Uint8List?> read(String path) async => files[path];

  @override
  Future<void> release(String path) async => files.remove(path);
}
