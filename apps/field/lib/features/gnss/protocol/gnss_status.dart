import 'dart:typed_data';

import '../../../core/geo/geo.dart';
import 'command_result.dart';

/// Receiver configuration state (`rx_config`).
enum RxConfig {
  pending(0, 'Bekliyor'),
  ok(1, 'Tamam'),
  noResponse(2, 'Alıcı yanıt vermiyor'),
  nak(3, 'Alıcı ayarı reddetti'),
  invalidSettings(4, 'Geçersiz ayar'),
  unknown(-1, 'Bilinmiyor');

  const RxConfig(this.code, this.label);
  final int code;
  final String label;

  static RxConfig fromCode(int code) =>
      values.firstWhere((v) => v.code == code, orElse: () => RxConfig.unknown);
}

/// PPS state (`pps_state`).
enum PpsState {
  neverSeen(0, 'Hiç görülmedi'),
  locked(1, 'Kilitli'),
  lost(2, 'Kayıp'),
  unknown(-1, 'Bilinmiyor');

  const PpsState(this.code, this.label);
  final int code;
  final String label;

  static PpsState fromCode(int code) =>
      values.firstWhere((v) => v.code == code, orElse: () => PpsState.unknown);
}

/// RTK carrier solution (`carr_soln`).
enum CarrierSolution {
  none(0, 'RTK yok'),
  float(1, 'RTK float'),
  fixed(2, 'RTK fixed'),
  unknown(-1, 'Bilinmiyor');

  const CarrierSolution(this.code, this.label);
  final int code;
  final String label;

  static CarrierSolution fromCode(int code) => values.firstWhere(
    (v) => v.code == code,
    orElse: () => CarrierSolution.unknown,
  );
}

/// Decoded status characteristic of the GNSS logger (protocol version 1).
///
/// Layout: firmware/gnss-logger/README.md, "Durum (39 bayt)". All
/// multi-byte fields are little-endian. Firmware 0.1.0 sends 31 bytes, 0.2.0
/// and later 39 bytes (`gps_time_ns` at offset 31). Longer messages are
/// accepted because the same version may append fields at the end.
///
/// Firmware 0.3.0 and later send 51 bytes: the receiver's position (NAV-PVT
/// `lat`, `lon`, `height` at offsets 39, 43, 47; see [position]), valid when
/// `flags` bit6 is set.
class GnssStatus {
  const GnssStatus({
    required this.version,
    required this.recording,
    required this.flags,
    required this.rxConfig,
    required this.ppsState,
    required this.fixType,
    required this.carrierSolution,
    required this.numSv,
    required this.hAccMm,
    required this.bytesWritten,
    required this.sdFreeMib,
    required this.batteryMv,
    required this.firmwareVersion,
    required this.droppedBytes,
    required this.lastCmdSeq,
    required this.lastCmdResult,
    this.gpsTimeNs,
    this.latE7,
    this.lonE7,
    this.heightMm,
  });

  static const int protocolVersion = 1;
  static const int minLength = 31;

  /// Length since firmware 0.2.0, with the trailing `gps_time_ns` field (see
  /// [gpsTimeNs]).
  static const int lengthWithGpsTime = 39;

  /// Length with the trailing position block (see [position]).
  static const int lengthWithPosition = 51;

  static const int flagSdPresent = 0x01;
  static const int flagSdLowSpace = 0x02;
  static const int flagSdError = 0x04;
  static const int flagTimeMapped = 0x08;
  static const int flagDataDropped = 0x10;
  static const int flagGnssFixOk = 0x20;
  static const int flagPositionValid = 0x40;

  static const int hAccUnknown = 0xFFFFFFFF;

  final int version;
  final bool recording;
  final int flags;
  final RxConfig rxConfig;
  final PpsState ppsState;

  /// NAV-PVT `fixType`: 0 none, 2 2D, 3 3D, 4 GNSS+DR, 5 time only.
  final int fixType;
  final CarrierSolution carrierSolution;
  final int numSv;

  /// Horizontal accuracy in mm, null when no NAV-PVT has arrived yet.
  final int? hAccMm;
  final int bytesWritten;
  final int sdFreeMib;
  final int batteryMv;

  /// `major.minor.patch`.
  final String firmwareVersion;
  final int droppedBytes;
  final int lastCmdSeq;
  final CommandResult lastCmdResult;

  /// GPS time (ns since 1980-01-06) at which the logger built this message.
  ///
  /// Sent by firmware 0.2.0 and later at offset 31 (u64, 0 = no PPS mapping;
  /// set together with [flagTimeMapped]). Null for a 31-byte message (firmware
  /// 0.1.0) or a value of 0; the app then falls back to the phone clock.
  final int? gpsTimeNs;

  /// NAV-PVT latitude and longitude (1e-7 degrees) and height above the
  /// ellipsoid (mm) at offsets 39, 43 and 47 of a 51-byte message; null when
  /// the message is shorter.
  final int? latE7;
  final int? lonE7;
  final int? heightMm;

  /// Receiver position, when the message carries one, the firmware marks it
  /// valid (bit6) and the receiver has a 2D/3D fix (`gnssFixOK`); null
  /// otherwise.
  GeoPoint? get position {
    final lat = latE7;
    final lon = lonE7;
    if (lat == null || lon == null || !gnssFixOk || !positionValid) return null;
    if (fixType < 2 || fixType > 4) return null;
    return GeoPoint(lat / 1e7, lon / 1e7);
  }

  /// Horizontal accuracy in metres, null when unknown.
  double? get hAccM => hAccMm == null ? null : hAccMm! / 1000;

  bool get sdPresent => flags & flagSdPresent != 0;
  bool get sdLowSpace => flags & flagSdLowSpace != 0;
  bool get sdError => flags & flagSdError != 0;
  bool get timeMapped => flags & flagTimeMapped != 0;
  bool get dataDropped => flags & flagDataDropped != 0;
  bool get gnssFixOk => flags & flagGnssFixOk != 0;
  bool get positionValid => flags & flagPositionValid != 0;

  /// SD card can take a new recording.
  bool get sdReady => sdPresent && !sdLowSpace && !sdError;

  String get fixLabel => switch (fixType) {
    0 => 'Konum yok',
    2 => '2B',
    3 => '3B',
    4 => 'GNSS + DR',
    5 => 'Sadece zaman',
    _ => 'Bilinmiyor ($fixType)',
  };

  /// Decodes a status notification. Throws [FormatException] when the message
  /// is too short or has an unsupported version.
  factory GnssStatus.decode(List<int> bytes) {
    if (bytes.length < minLength) {
      throw FormatException(
        'status must be at least $minLength bytes, got ${bytes.length}',
      );
    }
    final b = ByteData.sublistView(Uint8List.fromList(bytes));
    final version = b.getUint8(0);
    if (version != protocolVersion) {
      throw FormatException('unsupported status version $version');
    }
    final hAcc = b.getUint32(8, Endian.little);
    int? gpsTimeNs;
    if (bytes.length >= lengthWithGpsTime) {
      final v = b.getUint64(31, Endian.little);
      gpsTimeNs = v == 0 ? null : v;
    }
    int? latE7;
    int? lonE7;
    int? heightMm;
    if (bytes.length >= lengthWithPosition) {
      latE7 = b.getInt32(39, Endian.little);
      lonE7 = b.getInt32(43, Endian.little);
      heightMm = b.getInt32(47, Endian.little);
    }
    return GnssStatus(
      version: version,
      recording: b.getUint8(1) != 0,
      flags: b.getUint8(2),
      rxConfig: RxConfig.fromCode(b.getUint8(3)),
      ppsState: PpsState.fromCode(b.getUint8(4)),
      fixType: b.getUint8(5),
      carrierSolution: CarrierSolution.fromCode(b.getUint8(6)),
      numSv: b.getUint8(7),
      hAccMm: hAcc == hAccUnknown ? null : hAcc,
      bytesWritten: b.getUint32(12, Endian.little),
      sdFreeMib: b.getUint32(16, Endian.little),
      batteryMv: b.getUint16(20, Endian.little),
      firmwareVersion: '${b.getUint8(22)}.${b.getUint8(23)}.${b.getUint8(24)}',
      droppedBytes: b.getUint32(25, Endian.little),
      lastCmdSeq: b.getUint8(29),
      lastCmdResult: CommandResult.fromCode(b.getUint8(30)),
      gpsTimeNs: gpsTimeNs,
      latE7: latE7,
      lonE7: lonE7,
      heightMm: heightMm,
    );
  }

  /// Encodes the status as the firmware would. Used by the fake logger and in
  /// tests. With [includeGpsTime] the 39-byte form of firmware 0.2.0+ is
  /// produced, otherwise the 31-byte form of 0.1.0. With [includePosition]
  /// the 51-byte form with the position block (implies the GPS time field).
  Uint8List encode({
    bool includeGpsTime = false,
    bool includePosition = false,
  }) {
    final out = Uint8List(
      includePosition
          ? lengthWithPosition
          : includeGpsTime
          ? lengthWithGpsTime
          : minLength,
    );
    final b = ByteData.sublistView(out);
    final fw = firmwareVersion.split('.').map(int.parse).toList();
    b
      ..setUint8(0, version)
      ..setUint8(1, recording ? 1 : 0)
      ..setUint8(2, flags)
      ..setUint8(3, rxConfig.code < 0 ? 0 : rxConfig.code)
      ..setUint8(4, ppsState.code < 0 ? 0 : ppsState.code)
      ..setUint8(5, fixType)
      ..setUint8(6, carrierSolution.code < 0 ? 0 : carrierSolution.code)
      ..setUint8(7, numSv)
      ..setUint32(8, hAccMm ?? hAccUnknown, Endian.little)
      ..setUint32(12, bytesWritten, Endian.little)
      ..setUint32(16, sdFreeMib, Endian.little)
      ..setUint16(20, batteryMv, Endian.little)
      ..setUint8(22, fw[0])
      ..setUint8(23, fw[1])
      ..setUint8(24, fw[2])
      ..setUint32(25, droppedBytes, Endian.little)
      ..setUint8(29, lastCmdSeq)
      ..setUint8(30, lastCmdResult.code ?? CommandResult.none.code!);
    if (includeGpsTime || includePosition) {
      b.setUint64(31, includeGpsTime ? gpsTimeNs ?? 0 : 0, Endian.little);
    }
    if (includePosition) {
      b
        ..setInt32(39, latE7 ?? 0, Endian.little)
        ..setInt32(43, lonE7 ?? 0, Endian.little)
        ..setInt32(47, heightMm ?? 0, Endian.little);
    }
    return out;
  }

  GnssStatus copyWith({
    bool? recording,
    int? flags,
    RxConfig? rxConfig,
    PpsState? ppsState,
    int? fixType,
    CarrierSolution? carrierSolution,
    int? numSv,
    int? hAccMm,
    int? bytesWritten,
    int? sdFreeMib,
    int? batteryMv,
    int? droppedBytes,
    int? lastCmdSeq,
    CommandResult? lastCmdResult,
    int? gpsTimeNs,
    int? latE7,
    int? lonE7,
    int? heightMm,
  }) => GnssStatus(
    version: version,
    recording: recording ?? this.recording,
    flags: flags ?? this.flags,
    rxConfig: rxConfig ?? this.rxConfig,
    ppsState: ppsState ?? this.ppsState,
    fixType: fixType ?? this.fixType,
    carrierSolution: carrierSolution ?? this.carrierSolution,
    numSv: numSv ?? this.numSv,
    hAccMm: hAccMm ?? this.hAccMm,
    bytesWritten: bytesWritten ?? this.bytesWritten,
    sdFreeMib: sdFreeMib ?? this.sdFreeMib,
    batteryMv: batteryMv ?? this.batteryMv,
    firmwareVersion: firmwareVersion,
    droppedBytes: droppedBytes ?? this.droppedBytes,
    lastCmdSeq: lastCmdSeq ?? this.lastCmdSeq,
    lastCmdResult: lastCmdResult ?? this.lastCmdResult,
    gpsTimeNs: gpsTimeNs ?? this.gpsTimeNs,
    latE7: latE7 ?? this.latE7,
    lonE7: lonE7 ?? this.lonE7,
    heightMm: heightMm ?? this.heightMm,
  );
}
