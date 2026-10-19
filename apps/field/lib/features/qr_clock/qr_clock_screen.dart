import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../app/providers.dart';
import '../../core/time/gps_clock.dart';
import '../../core/time/gps_time.dart';
import '../gnss/protocol/command_result.dart';
import '../session/session_controller.dart';
import 'qr_payload.dart';

/// Full-screen QR clock held in front of the 360° camera.
///
/// The code is regenerated every [qrRefreshInterval] with the current GPS
/// time. When the first code is on screen the app sends `qr_sync` with that
/// exact value to the logger.
class QrClockScreen extends ConsumerStatefulWidget {
  const QrClockScreen({super.key, required this.moment});

  final QrMoment moment;

  @override
  ConsumerState<QrClockScreen> createState() => _QrClockScreenState();
}

class _QrClockScreenState extends ConsumerState<QrClockScreen> {
  Timer? _timer;
  String? _firstPayload;
  GpsTimeReading? _firstReading;
  CommandResult? _syncResult;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(qrRefreshInterval, (_) => setState(() {}));
    WidgetsBinding.instance.addPostFrameCallback((_) => _sendSync());
  }

  Future<void> _sendSync() async {
    final payload = _firstPayload;
    final reading = _firstReading;
    if (payload == null || reading == null || !mounted) return;
    final result = await ref
        .read(sessionControllerProvider.notifier)
        .qrShown(widget.moment, payload, reading);
    if (mounted) setState(() => _syncResult = result);
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final sessionId = ref.watch(sessionControllerProvider).sessionId;
    final reading = ref.read(gpsClockProvider).now();
    final payload = formatQrPayload(reading.gpsTimeMs, sessionId: sessionId);
    if (_firstPayload == null) {
      _firstPayload = payload;
      _firstReading = reading;
    }
    final utc = gpsMsToUtc(reading.gpsTimeMs);
    final hms =
        '${_two(utc.hour)}:${_two(utc.minute)}:${_two(utc.second)}.'
        '${(utc.millisecond ~/ 100)}';
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: Text(widget.moment.label),
        backgroundColor: Colors.white,
      ),
      body: SafeArea(
        child: Column(
          children: [
            _SourceBanner(source: reading.source),
            Expanded(
              child: Center(
                child: LayoutBuilder(
                  builder: (context, c) {
                    final side = c.biggest.shortestSide * 0.92;
                    return QrImageView(
                      key: const Key('qr-code'),
                      data: payload,
                      size: side,
                      gapless: true,
                      errorCorrectionLevel: QrErrorCorrectLevel.M,
                      backgroundColor: Colors.white,
                    );
                  },
                ),
              ),
            ),
            Text(
              'UTC $hms',
              style: const TextStyle(fontSize: 22, fontFamily: 'monospace'),
            ),
            Text(
              payload,
              key: const Key('qr-text'),
              style: const TextStyle(fontSize: 14, fontFamily: 'monospace'),
            ),
            const SizedBox(height: 8),
            _SyncLine(result: _syncResult),
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                'Telefonu kameraya yakın ve düz tutun, birkaç saniye bekleyin.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 18),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: SizedBox(
                width: double.infinity,
                height: 64,
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.check, size: 28),
                  label: const Text('Tamam', style: TextStyle(fontSize: 22)),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _two(int v) => v.toString().padLeft(2, '0');
}

class _SourceBanner extends StatelessWidget {
  const _SourceBanner({required this.source});

  final TimeSource source;

  @override
  Widget build(BuildContext context) {
    final gps = source == TimeSource.gps;
    return Container(
      key: Key('qr-source-${source.code}'),
      width: double.infinity,
      color: gps ? Colors.green.shade700 : Colors.orange.shade800,
      padding: const EdgeInsets.all(12),
      child: Text(
        gps
            ? 'GPS saati (kaydediciden)'
            : 'DİKKAT: Telefon saati kullanılıyor, kaydediciden GPS zamanı yok',
        textAlign: TextAlign.center,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 18,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _SyncLine extends StatelessWidget {
  const _SyncLine({required this.result});

  final CommandResult? result;

  @override
  Widget build(BuildContext context) {
    final r = result;
    if (r == null) return const Text('Kaydediciye işaret gönderiliyor…');
    return Text(
      r.isOk
          ? 'Kaydediciye işaret gönderildi'
          : 'İşaret gönderilemedi: ${r.message}',
      key: const Key('qr-sync-result'),
      style: TextStyle(
        fontSize: 16,
        color: r.isOk ? Colors.green.shade700 : Colors.red.shade700,
      ),
    );
  }
}
