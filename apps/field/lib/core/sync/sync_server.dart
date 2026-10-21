import 'dart:typed_data';

/// Why a record could not be sent.
enum SyncErrorKind {
  /// No network, timeout, server busy or expired login: try again later.
  transient,

  /// The server refused the record (permission, validation, unknown visit):
  /// sending it again will not help.
  permanent,
}

class SyncError implements Exception {
  const SyncError.transient(this.reason, [this.detail])
    : kind = SyncErrorKind.transient;
  const SyncError.permanent(this.reason, [this.detail])
    : kind = SyncErrorKind.permanent;

  final SyncErrorKind kind;

  /// Short code, e.g. `network`, `forbidden`, `visit_not_found`.
  final String reason;

  /// Server message or exception text, for the log and the outbox row.
  final String? detail;

  bool get isTransient => kind == SyncErrorKind.transient;

  @override
  String toString() => detail == null ? reason : '$reason: $detail';
}

/// What the SyncWorker needs from the server. Every call either succeeds or
/// throws [SyncError]. Writes are idempotent: sending the same row or file
/// twice leaves one row or file on the server.
///
/// Implemented over Supabase by SupabaseSyncServer; tests use a fake.
abstract interface class SyncServer {
  /// Org of a parcel the user can see; null when it is not visible.
  Future<String?> parcelOrg(String parcelId);

  /// `metric_definition` ids by code.
  Future<Map<String, String>> metricIds();

  /// Updates the visit `session.id = id` with [values] while its status is
  /// one of [whileStatus]. True when a row was updated.
  Future<bool> updateVisit(
    String id,
    Map<String, Object?> values, {
    required List<String> whileStatus,
  });

  /// Status of the visit; null when it does not exist or is not visible.
  Future<String?> visitStatus(String id);

  /// Inserts [row] into [table]; a row that conflicts on [onConflict] (the
  /// same record sent before) is ignored.
  Future<void> insertIgnoringDuplicates(
    String table,
    Map<String, Object?> row, {
    required String onConflict,
  });

  /// Uploads a file to the media bucket. An object that already exists at
  /// [path] counts as uploaded: the path contains the content hash.
  Future<void> uploadMedia(
    String path,
    Uint8List bytes, {
    required String contentType,
  });

  /// Whether the media bucket holds [path].
  Future<bool> mediaExists(String path);
}
