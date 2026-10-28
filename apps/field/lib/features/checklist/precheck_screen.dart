import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/ui/widgets.dart';
import '../gnss/gnss_health.dart';
import '../gnss/gnss_logger.dart';
import '../gnss/gnss_panel.dart';
import '../gnss/protocol/gnss_status.dart';
import '../notice/field_records.dart';
import '../session/session_controller.dart';
import '../session/session_screen.dart';
import '../tasks/field_task.dart';
import 'scan_setup.dart';

/// Result of the pre-scan checklist.
class PrecheckResult {
  const PrecheckResult({
    required this.connected,
    required this.status,
    required this.lensClean,
    required this.cameraRecording,
    required this.spraying,
    required this.platform,
    required this.cameraHeightM,
    this.notice,
    this.harvestAsked = false,
    this.harvest,
  });

  final bool connected;
  final GnssStatus? status;
  final bool lensClean;
  final bool cameraRecording;

  /// Null until the crew answers. There is no "not passed" answer: then the
  /// crew must not enter the orchard.
  final SprayingCheck? spraying;

  /// Null until chosen / until a valid height (0.50–3.50 m) is typed.
  final ScanPlatform? platform;
  final double? cameraHeightM;

  /// Sign and badge answers (H01); null until both are answered.
  final NoticeSign? notice;

  /// Harvest-season scan: the crew states the harvest is over and whether
  /// gleaning (çöpleme) goes on. No answer for "harvest under way": then the
  /// crew must not enter the orchard.
  final bool harvestAsked;
  final HarvestCheck? harvest;

  bool get batteryOk => status != null && batteryHealth(status!) == Health.ok;
  bool get sdOk => status != null && status!.sdReady;
  bool get gnssOk => status != null && gnssReady(status!);

  /// Every item must pass; the crew cannot skip the checklist.
  bool get allOk =>
      connected &&
      batteryOk &&
      sdOk &&
      gnssOk &&
      lensClean &&
      cameraRecording &&
      spraying != null &&
      (!harvestAsked || harvest != null) &&
      platform != null &&
      cameraHeightM != null &&
      notice != null &&
      notice!.isValid;
}

/// Mandatory checklist before a scan (docs/MVP.md, Modül 3, "Ön kontrol").
/// Battery, SD card and GNSS come from the logger over BLE; lens and camera
/// are confirmed by the crew, and so is spraying: the crew states there was
/// none, or that the label's re-entry interval has passed. On a harvest-season
/// scan the crew also states that the harvest is over and whether gleaning
/// goes on. The crew picks the scan platform and types the measured camera
/// height, prefilled from the parcel's last scan on this phone. Spraying,
/// harvest, platform and height are recorded (on `session_start` and the
/// session); the others only gate the start. The crew also answers whether
/// the QR information sign is at the entrance and the badge is visible (H01);
/// a "no" needs a reason. That goes into a `field_notice_sign` event.
class PrecheckScreen extends ConsumerStatefulWidget {
  const PrecheckScreen({super.key});

  @override
  ConsumerState<PrecheckScreen> createState() => _PrecheckScreenState();
}

class _PrecheckScreenState extends ConsumerState<PrecheckScreen> {
  bool _lensClean = false;
  bool _cameraRecording = false;
  SprayingCheck? _spraying;
  HarvestCheck? _harvest;
  ScanPlatform? _platform;
  final _height = TextEditingController();
  bool? _sign;
  bool? _badge;
  final _noticeReason = TextEditingController();

  /// The parcel's last scan on this phone, if it recorded its setup.
  ScanSetup? _previous;

  @override
  void initState() {
    super.initState();
    _loadPrevious();
  }

  @override
  void dispose() {
    _height.dispose();
    _noticeReason.dispose();
    super.dispose();
  }

  Future<void> _loadPrevious() async {
    final parcelId = ref.read(sessionControllerProvider).task?.parcelId;
    if (parcelId == null) return;
    final row = await ref.read(fieldRepositoryProvider).lastScanSetup(parcelId);
    final platform = ScanPlatform.fromCode(row?.scanPlatform);
    final height = row?.cameraHeightM;
    if (!mounted || platform == null || height == null) return;
    setState(() {
      _previous = ScanSetup(platform: platform, cameraHeightM: height);
      // Prefill only what the crew has not filled in yet.
      _platform ??= platform;
      if (_height.text.isEmpty) _height.text = formatMetres(height);
    });
  }

  @override
  Widget build(BuildContext context) {
    final task = ref.watch(sessionControllerProvider).task;
    // Harvest-season scans only: inventory and verification have no season
    // of their own.
    final harvestAsked =
        task != null &&
        task.kind == VisitKind.periodic &&
        task.season == Season.harvest;
    final conn = ref.watch(gnssConnectionProvider).value;
    final status = ref.watch(gnssStatusProvider).value?.status;
    final result = PrecheckResult(
      connected: conn == GnssConnection.connected,
      status: status,
      lensClean: _lensClean,
      cameraRecording: _cameraRecording,
      spraying: _spraying,
      platform: _platform,
      cameraHeightM: parseCameraHeight(_height.text),
      notice: _sign == null || _badge == null
          ? null
          : NoticeSign(
              sign: _sign!,
              badge: _badge!,
              reason: _noticeReason.text,
            ),
      harvestAsked: harvestAsked,
      harvest: _harvest,
    );
    return Scaffold(
      appBar: AppBar(title: Text(task?.parcelName ?? 'Ön kontrol')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Ön kontrol',
            style: TextStyle(fontSize: 26, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 12),
          const GnssConnectBar(),
          _AutoItem(
            key: const Key('check-battery'),
            icon: Icons.battery_charging_full,
            title: 'Batarya',
            ok: result.batteryOk,
            detail: status == null ? 'Bilgi yok' : batteryLabel(status),
          ),
          _AutoItem(
            key: const Key('check-sd'),
            icon: Icons.sd_card,
            title: 'SD kart',
            ok: result.sdOk,
            detail: status == null ? 'Bilgi yok' : sdLabel(status),
          ),
          _AutoItem(
            key: const Key('check-gnss'),
            icon: Icons.satellite_alt,
            title: 'GNSS',
            ok: result.gnssOk,
            detail: status == null ? 'Bilgi yok' : gnssLabel(status),
          ),
          _ManualItem(
            key: const Key('check-lens'),
            icon: Icons.camera,
            title: 'Kamera lensleri temiz',
            value: _lensClean,
            onChanged: (v) => setState(() => _lensClean = v),
          ),
          _ManualItem(
            key: const Key('check-camera'),
            icon: Icons.videocam,
            title: 'Kamerada video kaydı başladı',
            value: _cameraRecording,
            onChanged: (v) => setState(() => _cameraRecording = v),
          ),
          _SprayingItem(
            value: _spraying,
            onChanged: (v) => setState(() => _spraying = v),
          ),
          if (harvestAsked)
            _HarvestItem(
              value: _harvest,
              onChanged: (v) => setState(() => _harvest = v),
            ),
          _ScanSetupItem(
            platform: _platform,
            onPlatform: (v) => setState(() => _platform = v),
            height: _height,
            onHeight: () => setState(() {}),
            previous: _previous,
            current: result.platform == null || result.cameraHeightM == null
                ? null
                : ScanSetup(
                    platform: result.platform!,
                    cameraHeightM: result.cameraHeightM!,
                  ),
          ),
          _NoticeItem(
            sign: _sign,
            badge: _badge,
            onSign: (v) => setState(() => _sign = v),
            onBadge: (v) => setState(() => _badge = v),
            reason: _noticeReason,
            onReason: () => setState(() {}),
          ),
          const SizedBox(height: 8),
          const Text(
            'Şafakta, gün batımında, yağmurda ve yoğun tozda tarama yapılmaz. '
            'Kırağı ya da don kalkmadan girilmez; çamurda motosiklet '
            'kullanılmaz. Yazın tarama sabah (gün doğumundan 1 saat sonra – '
            '11.00) ya da akşamüstü (16.00 – gün batımından 1 saat önce) '
            'yapılır. Çizme giy. Rüzgâr çok sertse (saatte ~30 km üstü) yakın '
            'plan çekilmez.',
            style: TextStyle(fontSize: 16),
          ),
          const SizedBox(height: 24),
          BigButton(
            key: const Key('precheck-continue'),
            icon: Icons.arrow_forward,
            label: 'Devam',
            onPressed: result.allOk
                ? () {
                    ref
                        .read(sessionControllerProvider.notifier)
                        .confirmPrecheck(
                          spraying: result.spraying!,
                          platform: result.platform!,
                          cameraHeightM: result.cameraHeightM!,
                          notice: result.notice!,
                          harvest: result.harvest,
                        );
                    Navigator.of(context).pushReplacement(
                      MaterialPageRoute<void>(
                        builder: (_) => const SessionScreen(),
                      ),
                    );
                  }
                : null,
          ),
        ],
      ),
    );
  }
}

class _AutoItem extends StatelessWidget {
  const _AutoItem({
    super.key,
    required this.icon,
    required this.title,
    required this.ok,
    required this.detail,
  });

  final IconData icon;
  final String title;
  final bool ok;
  final String detail;

  @override
  Widget build(BuildContext context) {
    final color = StatusLine.colorFor(ok ? Health.ok : Health.bad);
    return Card(
      child: ListTile(
        minTileHeight: 72,
        leading: Icon(icon, size: 36),
        title: Text(title, style: const TextStyle(fontSize: 20)),
        subtitle: Text(detail, style: const TextStyle(fontSize: 16)),
        trailing: Icon(
          ok ? Icons.check_circle : Icons.cancel,
          color: color,
          size: 36,
        ),
      ),
    );
  }
}

class _ManualItem extends StatelessWidget {
  const _ManualItem({
    super.key,
    required this.icon,
    required this.title,
    required this.value,
    required this.onChanged,
  });

  final IconData icon;
  final String title;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) => Card(
    child: CheckboxListTile(
      minTileHeight: 72,
      secondary: Icon(icon, size: 36),
      title: Text(title, style: const TextStyle(fontSize: 20)),
      value: value,
      onChanged: (v) => onChanged(v ?? false),
    ),
  );
}

/// "Son günlerde ilaçlama yapıldıysa etiketteki tekrar giriş süresi geçti",
/// with the way to say there was no spraying. Either answer passes
/// (methodology v0.2, docs/metodoloji.md section 2: unknown interval at
/// least 48 hours; wet leaves or a smell of spray mean no entry).
class _SprayingItem extends StatelessWidget {
  const _SprayingItem({required this.value, required this.onChanged});

  final SprayingCheck? value;
  final ValueChanged<SprayingCheck?> onChanged;

  @override
  Widget build(BuildContext context) => Card(
    key: const Key('check-spraying'),
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ListTile(
            leading: Icon(Icons.sanitizer, size: 36),
            title: Text(
              'Son günlerde ilaçlama yapıldıysa etiketteki tekrar giriş '
              'süresi geçti',
              style: TextStyle(fontSize: 20),
            ),
            subtitle: Text(
              'Bilmiyorsan bahçe sahibine sor. Süre bilinmiyorsa en az 48 '
              'saat geçmiş olmalı. Süre geçmediyse, yapraklar ıslaksa ya da '
              'ilaç kokusu varsa bahçeye girme.',
              style: TextStyle(fontSize: 16),
            ),
          ),
          for (final option in SprayingCheck.values)
            CheckboxListTile(
              key: Key('check-spraying-${option.code}'),
              minTileHeight: 60,
              title: Text(option.label, style: const TextStyle(fontSize: 18)),
              value: value == option,
              onChanged: (v) => onChanged(v == true ? option : null),
            ),
        ],
      ),
    ),
  );
}

/// Harvest-season scan: the harvest is over (the crew does not enter while
/// it goes on) and whether gleaning (çöpleme) goes on. Any answer passes.
class _HarvestItem extends StatelessWidget {
  const _HarvestItem({required this.value, required this.onChanged});

  final HarvestCheck? value;
  final ValueChanged<HarvestCheck?> onChanged;

  @override
  Widget build(BuildContext context) => Card(
    key: const Key('check-harvest'),
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ListTile(
            leading: Icon(Icons.agriculture, size: 36),
            title: Text(
              'Hasat bitti mi, çöpleme sürüyor mu?',
              style: TextStyle(fontSize: 20),
            ),
            subtitle: Text(
              'Bahçe sahibine sor. Hasat sürüyorsa bahçeye girme; ziyaret '
              'ertelenir.',
              style: TextStyle(fontSize: 16),
            ),
          ),
          for (final option in HarvestCheck.values)
            CheckboxListTile(
              key: Key('check-harvest-${option.code}'),
              minTileHeight: 60,
              title: Text(option.label, style: const TextStyle(fontSize: 18)),
              value: value == option,
              onChanged: (v) => onChanged(v == true ? option : null),
            ),
        ],
      ),
    ),
  );
}

/// Scan platform and measured camera height. Both required; a setup that
/// differs from the parcel's last scan is warned about, not blocked.
class _ScanSetupItem extends StatelessWidget {
  const _ScanSetupItem({
    required this.platform,
    required this.onPlatform,
    required this.height,
    required this.onHeight,
    required this.previous,
    required this.current,
  });

  final ScanPlatform? platform;
  final ValueChanged<ScanPlatform?> onPlatform;
  final TextEditingController height;
  final VoidCallback onHeight;
  final ScanSetup? previous;

  /// Null until both are valid.
  final ScanSetup? current;

  @override
  Widget build(BuildContext context) {
    final typed = height.text.trim();
    final invalid = typed.isNotEmpty && parseCameraHeight(typed) == null;
    final differences = previous == null || current == null
        ? const <String>[]
        : current!.differencesFrom(previous!);
    return Card(
      key: const Key('check-scan-setup'),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const ListTile(
              leading: Icon(Icons.height, size: 36),
              title: Text(
                'Tarama şekli ve kamera yüksekliği',
                style: TextStyle(fontSize: 20),
              ),
            ),
            if (previous != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: Text(
                  'Bu parselde son tarama: ${previous!.label} — aynı '
                  'yükseklik karşılaştırmayı kolaylaştırır',
                  key: const Key('scan-setup-previous'),
                  style: const TextStyle(fontSize: 16),
                ),
              ),
            for (final option in ScanPlatform.values)
              CheckboxListTile(
                key: Key('check-platform-${option.code}'),
                minTileHeight: 60,
                title: Text(option.label, style: const TextStyle(fontSize: 18)),
                value: platform == option,
                onChanged: (v) => onPlatform(v == true ? option : null),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              child: TextField(
                key: const Key('check-camera-height'),
                controller: height,
                onChanged: (_) => onHeight(),
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                style: const TextStyle(fontSize: 20),
                decoration: InputDecoration(
                  labelText: 'Kamera yüksekliği',
                  suffixText: 'm',
                  helperText:
                      'Merceğin yerden yüksekliğini metreyle ölçüp yazın',
                  helperMaxLines: 2,
                  errorText: invalid
                      ? '${formatMetres(minCameraHeightM)} ile '
                            '${formatMetres(maxCameraHeightM)} m arasında '
                            'bir sayı yazın'
                      : null,
                  border: const OutlineInputBorder(),
                ),
              ),
            ),
            if (differences.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: Row(
                  key: const Key('scan-setup-warning'),
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.warning_amber,
                      color: StatusLine.colorFor(Health.warn),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '${differences.join('. ')}. Karşılaştırma zorlaşır; '
                        'ölçümü kontrol edin.',
                        style: const TextStyle(fontSize: 16),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Information sign and badge (H01 (b) 1): two explicit yes/no answers; a
/// "no" needs a short reason.
class _NoticeItem extends StatelessWidget {
  const _NoticeItem({
    required this.sign,
    required this.badge,
    required this.onSign,
    required this.onBadge,
    required this.reason,
    required this.onReason,
  });

  final bool? sign;
  final bool? badge;
  final ValueChanged<bool?> onSign;
  final ValueChanged<bool?> onBadge;
  final TextEditingController reason;
  final VoidCallback onReason;

  @override
  Widget build(BuildContext context) {
    final needsReason = sign == false || badge == false;
    final typed = reason.text.trim();
    final error = typed.isEmpty
        ? null
        : textError(typed, maxLength: maxReasonLength);
    return Card(
      key: const Key('check-notice'),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const ListTile(
              leading: Icon(Icons.badge_outlined, size: 36),
              title: Text('Bilgilendirme', style: TextStyle(fontSize: 20)),
              subtitle: Text(
                'Bahçede rastladığınız kişilere kısa sözlü bilgi verin.',
                style: TextStyle(fontSize: 16),
              ),
            ),
            _YesNo(
              code: 'sign',
              question: 'Bilgilendirme levhası (QR\'lı) bahçe girişine kondu',
              value: sign,
              onChanged: onSign,
            ),
            _YesNo(
              code: 'badge',
              question: 'Tanıtım kartım görünür',
              value: badge,
              onChanged: onBadge,
            ),
            if (needsReason)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                child: TextField(
                  key: const Key('check-notice-reason'),
                  controller: reason,
                  onChanged: (_) => onReason(),
                  maxLength: maxReasonLength,
                  style: const TextStyle(fontSize: 18),
                  decoration: InputDecoration(
                    labelText: 'Neden? (kısa)',
                    helperText: noteHint,
                    helperMaxLines: 3,
                    errorText: error,
                    border: const OutlineInputBorder(),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// One question with "Evet" and "Hayır"; tapping the chosen one again
/// takes the answer back.
class _YesNo extends StatelessWidget {
  const _YesNo({
    required this.code,
    required this.question,
    required this.value,
    required this.onChanged,
  });

  final String code;
  final String question;
  final bool? value;
  final ValueChanged<bool?> onChanged;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(question, style: const TextStyle(fontSize: 18)),
        const SizedBox(height: 4),
        Wrap(
          spacing: 8,
          children: [
            for (final (answer, label) in [(true, 'Evet'), (false, 'Hayır')])
              ChoiceChip(
                key: Key('check-notice-$code-${answer ? 'yes' : 'no'}'),
                label: Text(label, style: const TextStyle(fontSize: 18)),
                selected: value == answer,
                onSelected: (on) => onChanged(on ? answer : null),
              ),
          ],
        ),
      ],
    ),
  );
}
