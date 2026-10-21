import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:orchados_field/core/sync/supabase_sync_server.dart';
import 'package:orchados_field/core/sync/sync_server.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

void main() {
  SyncError c(Object e) => SupabaseSyncServer.classify(e);

  test('no network is transient', () {
    expect(c(const SocketException('Failed host lookup')).isTransient, isTrue);
    expect(c(TimeoutException('slow')).isTransient, isTrue);
    expect(c(const SocketException('x')).reason, 'network');
  });

  test('server trouble and expired login are transient', () {
    for (final code in ['503', '502', '429', '401', 'PGRST000', 'PGRST301']) {
      expect(
        c(PostgrestException(message: 'x', code: code)).isTransient,
        isTrue,
        reason: code,
      );
    }
    expect(
      c(const StorageException('Service Unavailable', statusCode: '503'))
          .isTransient,
      isTrue,
    );
    expect(
      c(
        const StorageException(
          '"exp" claim timestamp check failed: jwt expired',
          statusCode: '400',
        ),
      ).isTransient,
      isTrue,
    );
  });

  test('refusals are permanent, with a reason', () {
    expect(
      c(
        const PostgrestException(
          message:
              'new row violates row-level '
              'security policy',
          code: '42501',
        ),
      ),
      isA<SyncError>()
          .having((e) => e.isTransient, 'transient', isFalse)
          .having((e) => e.reason, 'reason', 'forbidden'),
    );
    expect(
      c(const PostgrestException(message: 'fk', code: '23503')).reason,
      'reference_missing',
    );
    expect(
      c(const PostgrestException(message: 'bad uuid', code: '22P02')).reason,
      'invalid_value',
    );
    expect(
      c(const PostgrestException(message: 'check', code: '23514')).reason,
      'invalid_value',
    );
    expect(
      c(
        const StorageException(
          'new row violates row-level security policy',
          statusCode: '403',
        ),
      ).reason,
      'forbidden',
    );
    expect(c(StateError('bug')).isTransient, isFalse);
  });
}
