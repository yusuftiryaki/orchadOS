// Shared BLE vectors with the kit recorder (test-vectors/kit-protocol.json).
//
// services/kit-recorder runs the same cases against its encoder and decoder
// (tests/test_protocol_vectors.py), so the status the Pi sends and the
// commands the phone writes are checked on both sides.

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/features/gnss/protocol/command_result.dart';
import 'package:orchados_field/features/gnss/protocol/gnss_command.dart';
import 'package:orchados_field/features/gnss/protocol/gnss_status.dart';

Uint8List _bytes(String hex) => Uint8List.fromList([
  for (var i = 0; i < hex.length; i += 2)
    int.parse(hex.substring(i, i + 2), radix: 16),
]);

String _hex(List<int> b) =>
    b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();

void main() {
  // test-vectors/ at the repository root; tests run in apps/field.
  final vectors = jsonDecode(
    File('../../test-vectors/kit-protocol.json').readAsStringSync(),
  ) as Map<String, dynamic>;

  test('vector file version', () => expect(vectors['version'], 1));

  group('status (Pi → phone)', () {
    for (final c in (vectors['status'] as List).cast<Map<String, dynamic>>()) {
      test(c['name'] as String, () {
        final f = c['fields'] as Map<String, dynamic>;
        final raw = _bytes(c['hex'] as String);
        expect(raw.length, GnssStatus.lengthWithKit);

        final s = GnssStatus.decode(raw);
        expect(s.version, f['version']);
        expect(s.recording, f['recording']);
        expect(s.flags, f['flags']);
        expect(s.rxConfig.code, f['rx_config']);
        expect(s.ppsState.code, f['pps_state']);
        expect(s.fixType, f['fix_type']);
        expect(s.carrierSolution.code, f['carr_soln']);
        expect(s.numSv, f['num_sv']);
        expect(s.hAccMm ?? GnssStatus.hAccUnknown, f['h_acc_mm']);
        expect(s.bytesWritten, f['bytes_written']);
        expect(s.sdFreeMib, f['sd_free_mib']);
        expect(s.batteryMv, f['battery_mv']);
        expect(s.firmwareVersion, (f['fw'] as List).join('.'));
        expect(s.droppedBytes, f['dropped_bytes']);
        expect(s.lastCmdSeq, f['last_cmd_seq']);
        expect(s.lastCmdResult.code, f['last_cmd_result']);
        expect(s.gpsTimeNs ?? 0, f['gps_time_ns']);
        expect(s.latE7, f['lat_e7']);
        expect(s.lonE7, f['lon_e7']);
        expect(s.heightMm, f['height_mm']);

        expect(f['recorder_kind'], KitStatus.recorderKind);
        final k = s.kit!;
        expect(k.lidarState.index, f['lidar_state']);
        expect(k.lidarMode.index, f['lidar_mode']);
        expect(k.clock.index, f['clock_state']);
        expect(KitCheck.toMask(k.precheckFail), f['precheck_fail']);
        expect(KitAlert.toMask(k.alerts), f['alerts']);
        expect(KitCheck.toMask(k.overrides), f['overrides']);
        expect(k.lidarPointsPerS, f['lidar_points_per_s']);
        expect(k.imuHz, f['imu_hz']);
        expect(k.lidarGapCount, f['lidar_gap_count']);
        expect(k.lidarLongestGapS, f['lidar_longest_gap_s']);
        expect(k.lidarWrittenMib, f['lidar_written_mib']);
        expect(k.clockOffsetUs, f['clock_offset_us']);

        // The fake logger's encoder produces the same bytes as the Pi.
        expect(_hex(s.encode()), c['hex']);
      });
    }
  });

  group('commands (phone → Pi)', () {
    for (final c
        in (vectors['commands'] as List).cast<Map<String, dynamic>>()) {
      test(c['name'] as String, () {
        final raw = _bytes(c['hex'] as String);
        final d = GnssCommand.decode(raw);
        expect(d.result, CommandResult.fromCode(c['result'] as int));
        if (!d.result.isOk) return;

        final want = c['command'] as Map<String, dynamic>;
        final cmd = d.command!;
        expect(cmd.seq, want['seq']);
        switch (cmd) {
          case StartSession():
            expect(want['op'], 'start_session');
            expect(cmd.sessionId, want['session_id']);
            expect(cmd.parcelId, want['parcel_id']);
            // The app sends no byte when nothing was overridden.
            expect(cmd.overrideMask ?? 0, want['override_mask']);
          case StopSession():
            expect(want['op'], 'stop_session');
          case MarkEvent():
            expect(want['op'], 'mark_event');
            expect(cmd.type.name, _camel(want['kind'] as String));
            expect(cmd.payload, want['payload']);
        }
        if (c['canonical'] != false) {
          expect(_hex(_canonical(cmd).encode()), c['hex']);
        }
      });
    }
  });
}

/// The command as the app builds it: a zero override mask is not sent.
GnssCommand _canonical(GnssCommand cmd) => switch (cmd) {
  StartSession(overrideMask: 0) => StartSession(
    seq: cmd.seq,
    sessionId: cmd.sessionId,
    parcelId: cmd.parcelId,
  ),
  _ => cmd,
};

String _camel(String snake) => snake.replaceAllMapped(
  RegExp(r'_([a-z])'),
  (m) => m.group(1)!.toUpperCase(),
);
