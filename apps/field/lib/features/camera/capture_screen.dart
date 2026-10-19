import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/media/field_camera.dart';
import '../../core/quality/photo_quality.dart';
import '../../core/time/gps_clock.dart';
import '../../core/ui/widgets.dart';

/// A photo the crew accepted on the capture screen. Not stored yet.
class CapturedPhoto {
  const CapturedPhoto({
    required this.shot,
    required this.quality,
    required this.time,
    required this.capturedAt,
  });

  final CameraShot shot;
  final QualityResult quality;

  /// GPS time at the shutter press (from [GpsClock]).
  final GpsTimeReading time;

  /// Phone time at the shutter press.
  final DateTime capturedAt;
}

/// Full-screen in-app camera for one "shoot like this" slot.
///
/// Preview with the reference picture and hint on top, tap to focus, then a
/// review step: the on-device quality check runs and the crew chooses
/// "Kullan" or "Yeniden çek". A rejected photo can only be retaken; it is
/// never returned and never stored. Pops with a [CapturedPhoto] or null.
class CaptureScreen extends ConsumerStatefulWidget {
  const CaptureScreen({
    super.key,
    required this.title,
    required this.hint,
    this.referenceImage,
  });

  final String title;
  final String hint;
  final String? referenceImage;

  @override
  ConsumerState<CaptureScreen> createState() => _CaptureScreenState();
}

enum _Phase { opening, preview, shooting, checking, review, unavailable }

class _CaptureScreenState extends ConsumerState<CaptureScreen>
    with WidgetsBindingObserver {
  late final FieldCamera _camera = ref.read(cameraProvider);
  _Phase _phase = _Phase.opening;
  CameraOpenResult? _openResult;
  Offset? _focus;
  CapturedPhoto? _pending;
  bool _opening = false;
  bool _closed = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _open();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _closed = true;
    _camera.close();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Release the camera in the background (other apps, battery) and take it
    // back on return. The permission dialog itself also makes the app
    // inactive, hence the [_opening] guard.
    switch (state) {
      case AppLifecycleState.inactive || AppLifecycleState.paused:
        if (_phase == _Phase.preview && !_opening) {
          _camera.close();
          setState(() => _phase = _Phase.opening);
        }
      case AppLifecycleState.resumed:
        if (_opening) return;
        // Back from the system settings: the permission may be granted now.
        // A plain denial is not retried automatically (that would show the
        // dialog again right away); the crew presses "Tekrar dene".
        if (_phase == _Phase.opening ||
            (_phase == _Phase.unavailable &&
                _openResult == CameraOpenResult.permissionBlocked)) {
          _open();
        }
      default:
        break;
    }
  }

  Future<void> _open() async {
    if (_opening) return;
    _opening = true;
    setState(() => _phase = _Phase.opening);
    CameraOpenResult result;
    try {
      result = await _camera.open();
    } on Object {
      result = CameraOpenResult.failed;
    } finally {
      _opening = false;
    }
    if (!mounted || _closed) return;
    setState(() {
      _openResult = result;
      _phase = result == CameraOpenResult.ready
          ? _Phase.preview
          : _Phase.unavailable;
    });
  }

  Future<void> _shoot() async {
    setState(() => _phase = _Phase.shooting);
    try {
      final shot = await _camera.takePicture();
      final time = ref.read(gpsClockProvider).now();
      final capturedAt = ref.read(clockProvider).now();
      if (!mounted) return;
      setState(() => _phase = _Phase.checking);
      final quality = await ref
          .read(photoQualityCheckerProvider)
          .check(shot.bytes);
      if (!mounted) return;
      setState(() {
        _pending = CapturedPhoto(
          shot: shot,
          quality: quality,
          time: time,
          capturedAt: capturedAt,
        );
        _phase = _Phase.review;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _phase = _Phase.preview);
      showError(context, 'Fotoğraf çekilemedi: $e');
    }
  }

  void _retake() => setState(() {
    _pending = null;
    _focus = null;
    _phase = _Phase.preview;
  });

  void _use() {
    final p = _pending;
    if (p == null || !p.quality.canSave) return;
    Navigator.of(context).pop(p);
  }

  void _tapFocus(TapUpDetails d, Size size) {
    final p = Offset(
      (d.localPosition.dx / size.width).clamp(0.0, 1.0),
      (d.localPosition.dy / size.height).clamp(0.0, 1.0),
    );
    setState(() => _focus = d.localPosition);
    _camera.setFocusPoint(p);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(title: Text(widget.title)),
      body: SafeArea(
        child: Column(
          children: [
            _Guide(
              title: widget.title,
              hint: widget.hint,
              referenceImage: widget.referenceImage,
            ),
            Expanded(child: _body()),
          ],
        ),
      ),
    );
  }

  Widget _body() => switch (_phase) {
    _Phase.opening => const _Busy('Kamera açılıyor'),
    _Phase.unavailable => _Unavailable(
      result: _openResult!,
      onRetry: _open,
      onSettings: _camera.openSettings,
    ),
    _Phase.preview || _Phase.shooting => _preview(),
    _Phase.checking => const _Busy('Fotoğraf kontrol ediliyor'),
    _Phase.review => _Review(photo: _pending!, onUse: _use, onRetake: _retake),
  };

  Widget _preview() {
    final busy = _phase == _Phase.shooting;
    return Column(
      children: [
        Expanded(
          child: Center(
            child: AspectRatio(
              aspectRatio: _camera.previewAspectRatio,
              child: LayoutBuilder(
                builder: (context, c) => GestureDetector(
                  key: const Key('camera-preview'),
                  behavior: HitTestBehavior.opaque,
                  onTapUp: busy ? null : (d) => _tapFocus(d, c.biggest),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      _camera.buildPreview(context),
                      if (_focus != null)
                        Positioned(
                          left: _focus!.dx - 36,
                          top: _focus!.dy - 36,
                          child: Container(
                            key: const Key('focus-indicator'),
                            width: 72,
                            height: 72,
                            decoration: BoxDecoration(
                              border: Border.all(
                                color: Colors.yellowAccent,
                                width: 2,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        const Padding(
          padding: EdgeInsets.only(top: 8),
          child: Text(
            'Odaklamak için ekrana dokunun',
            style: TextStyle(color: Colors.white70, fontSize: 16),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: SizedBox.square(
            dimension: 88,
            child: FilledButton(
              key: const Key('camera-shutter'),
              style: FilledButton.styleFrom(
                shape: const CircleBorder(),
                backgroundColor: Colors.white,
                foregroundColor: Colors.black,
                padding: EdgeInsets.zero,
              ),
              onPressed: busy ? null : _shoot,
              child: busy
                  ? const CircularProgressIndicator()
                  : const Icon(Icons.photo_camera, size: 44),
            ),
          ),
        ),
      ],
    );
  }
}

/// Reference picture and the short instruction for this shot.
class _Guide extends StatelessWidget {
  const _Guide({required this.title, required this.hint, this.referenceImage});

  final String title;
  final String hint;
  final String? referenceImage;

  @override
  Widget build(BuildContext context) => Container(
    color: Colors.black,
    padding: const EdgeInsets.all(12),
    child: Row(
      children: [
        ReferenceImage(assetPath: referenceImage, size: 80),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            'Böyle çek: $hint',
            key: const Key('capture-hint'),
            style: const TextStyle(color: Colors.white, fontSize: 18),
          ),
        ),
      ],
    ),
  );
}

class _Busy extends StatelessWidget {
  const _Busy(this.label);

  final String label;

  @override
  Widget build(BuildContext context) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const CircularProgressIndicator(),
        const SizedBox(height: 16),
        Text(label, style: const TextStyle(color: Colors.white, fontSize: 18)),
      ],
    ),
  );
}

class _Unavailable extends StatelessWidget {
  const _Unavailable({
    required this.result,
    required this.onRetry,
    required this.onSettings,
  });

  final CameraOpenResult result;
  final VoidCallback onRetry;
  final VoidCallback onSettings;

  @override
  Widget build(BuildContext context) {
    final (message, settings) = switch (result) {
      CameraOpenResult.permissionDenied => (
        'Yakın plan fotoğrafları için kamera izni gerekli. '
            '"Tekrar dene"ye basıp izin verin.',
        false,
      ),
      CameraOpenResult.permissionBlocked => (
        'Kamera izni kapalı. Ayarlar → İzinler → Kamera → "İzin ver" seçin, '
            'sonra bu ekrana dönün.',
        true,
      ),
      CameraOpenResult.noCamera => (
        'Bu telefonda arka kamera bulunamadı.',
        false,
      ),
      _ => (
        'Kamera açılamadı. Kamerayı kullanan başka uygulamayı kapatıp '
            'tekrar deneyin.',
        false,
      ),
    };
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.no_photography, color: Colors.white, size: 64),
          const SizedBox(height: 16),
          Text(
            message,
            key: const Key('camera-unavailable'),
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white, fontSize: 20),
          ),
          const SizedBox(height: 24),
          if (settings)
            BigButton(
              key: const Key('camera-settings'),
              icon: Icons.settings,
              label: 'Ayarları aç',
              onPressed: onSettings,
            ),
          if (settings) const SizedBox(height: 12),
          BigButton(
            key: const Key('camera-retry'),
            icon: Icons.refresh,
            label: 'Tekrar dene',
            onPressed: onRetry,
          ),
        ],
      ),
    );
  }
}

/// The photo just taken, the check's verdict and the two choices.
class _Review extends StatelessWidget {
  const _Review({
    required this.photo,
    required this.onUse,
    required this.onRetake,
  });

  final CapturedPhoto photo;
  final VoidCallback onUse;
  final VoidCallback onRetake;

  @override
  Widget build(BuildContext context) {
    final q = photo.quality;
    final (health, icon, headline) = switch (q.verdict) {
      QualityVerdict.accept => (Health.ok, Icons.check_circle, 'Fotoğraf iyi'),
      QualityVerdict.warn => (Health.warn, Icons.warning_amber, 'Dikkat'),
      QualityVerdict.reject => (
        Health.bad,
        Icons.cancel,
        'Fotoğraf kullanılamaz',
      ),
    };
    final color = StatusLine.colorFor(health);
    return Column(
      children: [
        Expanded(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Image.memory(
              photo.shot.bytes,
              key: const Key('review-image'),
              fit: BoxFit.contain,
              gaplessPlayback: true,
            ),
          ),
        ),
        Container(
          key: Key('review-verdict-${q.verdict.code}'),
          width: double.infinity,
          color: color,
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(icon, color: Colors.white, size: 36),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      headline,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 22,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    for (final f in q.findings)
                      Text(
                        f.message,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: BigButton(
                  key: const Key('review-retake'),
                  icon: Icons.replay,
                  label: 'Yeniden çek',
                  color: q.canSave ? Colors.blueGrey : null,
                  onPressed: onRetake,
                ),
              ),
              if (q.canSave) ...[
                const SizedBox(width: 12),
                Expanded(
                  child: BigButton(
                    key: const Key('review-use'),
                    icon: Icons.check,
                    label: 'Kullan',
                    onPressed: onUse,
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
