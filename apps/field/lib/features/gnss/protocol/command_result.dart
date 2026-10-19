/// Result of a logger command.
///
/// Codes 0–9 and 255 come from the firmware (`last_cmd_result`); [timeout],
/// [disconnected] and [unknown] are produced by the app.
enum CommandResult {
  ok(0, 'Tamam'),
  malformed(1, 'Komut bozuk'),
  unknownOpcode(2, 'Bilinmeyen komut'),
  invalidArgument(3, 'Geçersiz değer'),
  alreadyRecording(4, 'Kayıt zaten sürüyor'),
  notRecording(5, 'Kayıt yok'),
  sdMissing(6, 'SD kart takılı değil'),
  sdFull(7, 'SD kart dolu'),
  sdError(8, 'SD kart hatası'),
  sessionExists(9, 'Bu oturum kartta zaten var'),
  none(255, 'Henüz komut yok'),
  timeout(null, 'Kaydedici yanıt vermedi'),
  disconnected(null, 'Kaydedici bağlı değil'),
  unknown(null, 'Bilinmeyen sonuç');

  const CommandResult(this.code, this.message);

  /// Firmware code, or null for app-side results.
  final int? code;

  /// Short Turkish text for the UI.
  final String message;

  bool get isOk => this == CommandResult.ok;

  static CommandResult fromCode(int code) {
    for (final r in values) {
      if (r.code == code) return r;
    }
    return CommandResult.unknown;
  }
}
