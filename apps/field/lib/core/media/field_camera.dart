import 'dart:typed_data';

/// A photo straight from the in-app camera.
class CameraShot {
  const CameraShot({required this.bytes, this.mediaType = 'image/jpeg'});

  final Uint8List bytes;
  final String mediaType;
}

/// In-app camera. Photos are only taken through this interface; the app has
/// no gallery picker on purpose (docs/MVP.md, Modül 3, close-up protocol).
abstract interface class FieldCamera {
  Future<CameraShot> takePicture();
}

/// Produces small, unique fake JPEG files.
class FakeFieldCamera implements FieldCamera {
  int _count = 0;

  /// Number of pictures taken so far.
  int get count => _count;

  @override
  Future<CameraShot> takePicture() async {
    _count++;
    final body = 'orchadOS fake photo #$_count'.codeUnits;
    // SOI marker, a comment segment carrying the counter, EOI marker.
    final bytes = Uint8List.fromList([
      0xFF, 0xD8, //
      0xFF, 0xFE, (body.length + 2) >> 8, (body.length + 2) & 0xFF,
      ...body,
      0xFF, 0xD9,
    ]);
    return CameraShot(bytes: bytes);
  }
}
