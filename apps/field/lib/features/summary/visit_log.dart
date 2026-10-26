import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../session/session_controller.dart';

/// Visit record (docs/MVP.md, Module 3, "Ziyaret kaydı"): weather, equipment
/// serial numbers and problems in the field. Stored as a `visit_log` session
/// event; the weather also goes to `public.session.weather`.
class VisitLog {
  const VisitLog({
    this.sky,
    this.tempC,
    this.wind,
    this.loggerName,
    this.loggerFirmware,
    this.cameraSerial,
    this.issues,
  });

  /// `clear`, `partly_cloudy`, `overcast`, `rain`, `dust`.
  final String? sky;
  final int? tempC;

  /// `calm`, `light`, `strong`.
  final String? wind;
  final String? loggerName;
  final String? loggerFirmware;
  final String? cameraSerial;

  /// Problems in the field, free text by the crew (no names, no phones).
  final String? issues;

  static const skies = {
    'clear': 'Açık',
    'partly_cloudy': 'Parçalı bulutlu',
    'overcast': 'Kapalı',
    'rain': 'Yağmurlu',
    'dust': 'Tozlu',
  };
  static const winds = {
    'calm': 'Rüzgâr yok',
    'light': 'Hafif',
    'strong': 'Sert',
  };

  /// `public.session.weather`.
  Map<String, Object?> weather() => {
    if (sky != null) 'sky': sky,
    if (tempC != null) 'temp_c': tempC,
    if (wind != null) 'wind': wind,
  };

  /// `data` of the `visit_log` event.
  Map<String, Object?> toJson() => {
    'weather': weather(),
    'equipment': {
      if (loggerName != null) 'logger_name': loggerName,
      if (loggerFirmware != null) 'logger_firmware': loggerFirmware,
      if (cameraSerial != null && cameraSerial!.isNotEmpty)
        'camera_serial': cameraSerial,
    },
    if (issues != null && issues!.trim().isNotEmpty) 'issues': issues!.trim(),
  };

  static VisitLog? fromJson(Map<String, Object?>? j) {
    if (j == null) return null;
    final w = (j['weather'] as Map?)?.cast<String, Object?>() ?? const {};
    final e = (j['equipment'] as Map?)?.cast<String, Object?>() ?? const {};
    return VisitLog(
      sky: w['sky'] as String?,
      tempC: (w['temp_c'] as num?)?.toInt(),
      wind: w['wind'] as String?,
      loggerName: e['logger_name'] as String?,
      loggerFirmware: e['logger_firmware'] as String?,
      cameraSerial: e['camera_serial'] as String?,
      issues: j['issues'] as String?,
    );
  }
}

/// Form for the visit record, opened from the visit summary.
class VisitLogScreen extends ConsumerStatefulWidget {
  const VisitLogScreen({super.key, this.initial});

  final VisitLog? initial;

  @override
  ConsumerState<VisitLogScreen> createState() => _VisitLogScreenState();
}

class _VisitLogScreenState extends ConsumerState<VisitLogScreen> {
  String? _sky;
  String? _wind;
  final _temp = TextEditingController();
  final _camera = TextEditingController();
  final _issues = TextEditingController();
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final i = widget.initial;
    _sky = i?.sky;
    _wind = i?.wind;
    _temp.text = i?.tempC?.toString() ?? '';
    _camera.text = i?.cameraSerial ?? '';
    _issues.text = i?.issues ?? '';
  }

  @override
  void dispose() {
    _temp.dispose();
    _camera.dispose();
    _issues.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    await ref
        .read(sessionControllerProvider.notifier)
        .saveVisitLog(
          VisitLog(
            sky: _sky,
            tempC: int.tryParse(_temp.text.trim()),
            wind: _wind,
            cameraSerial: _camera.text.trim(),
            issues: _issues.text,
          ),
        );
    if (mounted) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    Widget choices(
      String title,
      Map<String, String> options,
      String? value,
      void Function(String) set,
    ) => Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 18)),
          Wrap(
            spacing: 8,
            children: [
              for (final MapEntry(:key, value: label) in options.entries)
                ChoiceChip(
                  key: Key('visit-log-$key'),
                  label: Text(label),
                  selected: value == key,
                  onSelected: (_) => setState(() => set(key)),
                ),
            ],
          ),
        ],
      ),
    );

    return Scaffold(
      appBar: AppBar(title: const Text('Ziyaret kaydı')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          choices('Gökyüzü', VisitLog.skies, _sky, (v) => _sky = v),
          choices('Rüzgâr', VisitLog.winds, _wind, (v) => _wind = v),
          TextField(
            key: const Key('visit-log-temp'),
            controller: _temp,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Sıcaklık (°C)'),
          ),
          const SizedBox(height: 12),
          TextField(
            key: const Key('visit-log-camera'),
            controller: _camera,
            decoration: const InputDecoration(
              labelText: 'Kamera seri numarası',
              helperText: 'Kaydedicinin adı ve sürümü kendiliğinden yazılır',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            key: const Key('visit-log-issues'),
            controller: _issues,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'Sahada yaşanan sorunlar',
              helperText: 'İsim ve telefon yazmayın',
            ),
          ),
          const SizedBox(height: 24),
          FilledButton(
            key: const Key('visit-log-save'),
            onPressed: _saving ? null : _save,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(56),
            ),
            child: const Text('Kaydet', style: TextStyle(fontSize: 18)),
          ),
        ],
      ),
    );
  }
}
