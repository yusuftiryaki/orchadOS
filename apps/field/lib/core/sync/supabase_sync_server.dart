import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import 'sync_server.dart';

/// [SyncServer] over Supabase, with the signed-in user's token (no service
/// key): row level security decides what the field app may write.
class SupabaseSyncServer implements SyncServer {
  SupabaseSyncServer(
    this._client, {
    this.timeout = const Duration(seconds: 30),
    this.uploadTimeout = const Duration(minutes: 2),
  });

  static const String bucket = 'media';

  final SupabaseClient _client;
  final Duration timeout;
  final Duration uploadTimeout;

  @override
  Future<String?> parcelOrg(String parcelId) => _guard(() async {
    final row = await _client
        .from('parcel')
        .select('org_id')
        .eq('id', parcelId)
        .maybeSingle();
    return row?['org_id'] as String?;
  });

  @override
  Future<Map<String, String>> metricIds() => _guard(() async {
    final rows = await _client.from('metric_definition').select('id, code');
    return {for (final r in rows) r['code'] as String: r['id'] as String};
  });

  @override
  Future<bool> updateVisit(
    String id,
    Map<String, Object?> values, {
    required List<String> whileStatus,
  }) => _guard(() async {
    final rows = await _client
        .from('session')
        .update(values)
        .eq('id', id)
        .inFilter('status', whileStatus)
        .select('id');
    return rows.isNotEmpty;
  });

  @override
  Future<String?> visitStatus(String id) => _guard(() async {
    final row = await _client
        .from('session')
        .select('status')
        .eq('id', id)
        .maybeSingle();
    return row?['status'] as String?;
  });

  @override
  Future<void> insertIgnoringDuplicates(
    String table,
    Map<String, Object?> row, {
    required String onConflict,
  }) => _guard(
    () => _client
        .from(table)
        .upsert(
          row,
          onConflict: onConflict,
          ignoreDuplicates: true,
          defaultToNull: false,
        ),
  );

  @override
  Future<void> uploadMedia(
    String path,
    Uint8List bytes, {
    required String contentType,
  }) => _guard(() async {
    try {
      await _client.storage
          .from(bucket)
          .uploadBinary(
            path,
            bytes,
            fileOptions: FileOptions(contentType: contentType, upsert: false),
          );
    } on StorageException catch (e) {
      // Same path = same content hash: an earlier try got through.
      if (e.statusCode == '409' || _mentions(e.message, 'already exists')) {
        return;
      }
      rethrow;
    }
  }, timeout: uploadTimeout);

  @override
  Future<void> recordVerificationResult(Map<String, Object?> params) => _guard(
    () => _client.rpc<void>('record_verification_result', params: params),
  );

  @override
  Future<int> saveParcelRoute(Map<String, Object?> params) => _guard(() async {
    final r = await _client.rpc<Object?>('save_parcel_route', params: params);
    final version = r is Map ? r['version'] : null;
    if (version is! int) {
      throw SyncError.permanent('unexpected', 'save_parcel_route: $r');
    }
    return version;
  });

  @override
  Future<bool> mediaExists(String path) =>
      _guard(() => _client.storage.from(bucket).exists(path));

  Future<T> _guard<T>(Future<T> Function() call, {Duration? timeout}) async {
    try {
      return await call().timeout(timeout ?? this.timeout);
    } on SyncError {
      rethrow;
    } catch (e) {
      throw classify(e);
    }
  }

  static bool _mentions(String text, String part) =>
      text.toLowerCase().contains(part);

  /// Sorts an exception from the network or Supabase into transient (try
  /// again later) and permanent (the server refused the record).
  static SyncError classify(Object e) {
    if (e is SocketException ||
        e is TimeoutException ||
        e is HandshakeException ||
        e is HttpException ||
        e is http.ClientException ||
        e is AuthRetryableFetchException) {
      return SyncError.transient('network', '$e');
    }
    if (e is PostgrestException) {
      final code = e.code ?? '';
      // Without a JSON body the code is the HTTP status (3 digits);
      // otherwise a Postgres SQLSTATE such as 42501.
      final status = RegExp(r'^\d{3}$').hasMatch(code) ? int.parse(code) : null;
      final transient =
          (status != null && _transientHttp(status)) ||
          // PostgREST cannot reach the database / JWT expired.
          code.startsWith('PGRST00') ||
          code == 'PGRST301' ||
          code == 'PGRST303' ||
          // Connection, serialization, lock and resource errors.
          code.startsWith('08') ||
          code.startsWith('53') ||
          code.startsWith('57') ||
          code == '40001' ||
          code == '40P01' ||
          _mentions(e.message, 'jwt expired');
      final reason = switch (code) {
        // Database functions name their refusal in the message
        // (record_verification_result: item_closed, not_found, ...).
        _ when functionReasons.contains(e.message) => e.message,
        '42501' => 'forbidden',
        '23503' => 'reference_missing',
        '23505' => 'duplicate',
        '22P02' => 'invalid_value',
        final c when c.startsWith('23') => 'invalid_value',
        _ => 'server_refused',
      };
      final detail = '${e.code}: ${e.message}';
      return transient
          ? SyncError.transient('server_unavailable', detail)
          : SyncError.permanent(reason, detail);
    }
    if (e is StorageException) {
      final status = int.tryParse(e.statusCode ?? '');
      final detail = '${e.statusCode}: ${e.message}';
      if ((status != null && _transientHttp(status)) ||
          _mentions(e.message, 'jwt')) {
        return SyncError.transient('server_unavailable', detail);
      }
      return SyncError.permanent(
        status == 403 || _mentions(e.message, 'row-level security')
            ? 'forbidden'
            : 'storage_refused',
        detail,
      );
    }
    return SyncError.permanent('unexpected', '$e');
  }

  /// Refusal reasons raised by the database functions the app calls.
  static const functionReasons = {
    'not_found',
    'forbidden',
    'item_closed',
    'item_not_open',
    'invalid_input',
    'session_invalid',
  };

  static bool _transientHttp(int status) =>
      status >= 500 || status == 408 || status == 429 || status == 401;
}
