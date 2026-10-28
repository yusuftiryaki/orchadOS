import 'dart:convert';

// Field records required by the legal decisions (docs/hukuk/kararlar.md H01,
// H07, H15, H32; follow-ups T07 and T16): the information sign and badge,
// the oral notice to people met in the orchard, objections, visits that
// could not be done and the person who showed the boundary.
//
// They are phone-side `session_event` rows (never sent to the GNSS logger,
// `logger_result = none`). The details are a JSON object in `payload`
// (`data` stays null); docs/arayuzler.md, "Saha olayları (session_event)",
// is the contract. Names and notes are personal data: no phone numbers.

/// Event types written by this module.
abstract final class FieldRecordEvent {
  static const noticeSign = 'field_notice_sign';
  static const noticeVerbal = 'field_notice_verbal';
  static const noticeObjection = 'field_notice_objection';
  static const visitBlocked = 'visit_blocked';
  static const boundaryPointer = 'boundary_pointer';
}

/// Local status of a session row that only carries a blocked visit (no
/// recording). It is never sent as a visit update; a later start on the
/// same visit turns it into a recording.
const blockedSessionStatus = 'blocked';

/// `captures.kind` of a photo documenting a blocked visit.
const blockedVisitPhotoKind = 'blocked_visit_photo';

/// Longest free-text note, in characters.
const maxNoteLength = 500;

/// Longest reason for a "no" on the sign or badge question.
const maxReasonLength = 200;

/// Name of the person who shows the boundary: 1–120 characters.
const maxPointerNameLength = 120;

/// Hint under every note field (ground rule: no phone numbers, no names of
/// third persons in notes).
const noteHint =
    'Telefon numarası ve başka kişilerin adını yazmayın. Kişiyi rolüyle '
    'anın (ör. bekçi, komşu).';

/// A date (28.10.2026, 28/10/26, 2026-10-28) or a clock time (09:30, 08.30),
/// optionally a time range (08.30-10.15). Not next to another digit group, so
/// the tail of a dotted phone number is not taken for a time.
final _dateOrTime = RegExp(
  r'(?<![\d][.,/_\-]?)'
  r'(?:'
  r'\d{4}-\d{1,2}-\d{1,2}'
  r'|\d{1,2}[./-]\d{1,2}[./-](?:\d{4}|\d{2})'
  r'|(?:[01]?\d|2[0-3])[:.][0-5]\d(?:\s*[-–]\s*(?:[01]?\d|2[0-3])[:.][0-5]\d)?'
  r')'
  r'(?![.,/_\-]?\d)',
);

/// Digits joined only by spaces or punctuation: one number as written.
final _digitRun = RegExp(r'\+?\d(?:[\s.,/_\-()+:]*\d)*');

/// Digits in a number that look like a phone number: Turkish mobile and
/// landline numbers have ten digits without the leading 0.
const _phoneDigits = 10;

/// The text seems to contain a phone number: after dates and clock times are
/// taken out, some run of digits separated only by spaces or punctuation
/// (space . , / _ - ( ) + :) has ten or more digits.
bool containsPhoneNumber(String text) => _digitRun
    .allMatches(text.replaceAll(_dateOrTime, ' x '))
    .any((m) => m[0]!.replaceAll(RegExp(r'\D'), '').length >= _phoneDigits);

/// Error for a free-text field in Turkish, or null when it is fine. Empty
/// text is fine unless [required].
String? textError(
  String text, {
  required int maxLength,
  bool required = false,
}) {
  final t = text.trim();
  if (t.isEmpty) return required ? 'Bu alan gerekli' : null;
  if (t.length > maxLength) return 'En çok $maxLength karakter';
  if (containsPhoneNumber(t)) return 'Telefon numarası yazmayın';
  return null;
}

String? _clean(String? text) {
  final t = text?.trim();
  return t == null || t.isEmpty ? null : t;
}

// --- Sign and badge (H01 (b) 1) ----------------------------------------------

/// Pre-check answers: the QR information sign is at the orchard entrance and
/// the crew's badge is visible. A "no" needs a short reason.
class NoticeSign {
  const NoticeSign({required this.sign, required this.badge, this.reason});

  final bool sign;
  final bool badge;

  /// Why the sign or the badge is missing; null when both are yes.
  final String? reason;

  bool get needsReason => !sign || !badge;

  /// Both questions answered and the reason, when needed, is valid.
  bool get isValid =>
      !needsReason ||
      textError(reason ?? '', maxLength: maxReasonLength, required: true) ==
          null;

  Map<String, Object?> toJson() => {
    'sign': sign,
    'badge': badge,
    if (needsReason && _clean(reason) != null) 'reason': _clean(reason),
  };

  String toPayload() => jsonEncode(toJson());
}

// --- Oral notice and objections (H01 (b) 1, saha talimatı) ---------------------

/// "Bahçede rastlanan kişilere sözlü bilgi verildi".
enum VerbalNotice {
  given('given', 'Evet, rastladığım kişilere sözlü bilgi verdim'),
  nobody('nobody', 'Bahçede kimse yoktu'),
  notGiven('not_given', 'Verilemedi');

  const VerbalNotice(this.code, this.label);
  final String code;
  final String label;

  static VerbalNotice? fromCode(String? code) =>
      values.where((v) => v.code == code).firstOrNull;
}

/// `field_notice_verbal` payload. A note is required for "not given".
String verbalNoticePayload(VerbalNotice answer, {String? note}) => jsonEncode({
  'answer': answer.code,
  if (_clean(note) != null) 'note': _clean(note),
});

/// `field_notice_objection` payload.
String objectionPayload(String note) => jsonEncode({'note': note.trim()});

/// Field instruction shown on the scan screen (H01 (b) 1).
const fieldInstruction =
    'Kişi kadraja yakınsa geçmesini bekleyin. Kişi itiraz ederse o bölüm '
    'daha sonra taranır.';

// --- Blocked visit (H15, 8A/2–3) ---------------------------------------------

/// Reason recorded on `visit_blocked` (T07).
enum BlockedReason {
  customer('customer'),
  company('company'),
  weather('weather'),
  forceMajeure('force_majeure');

  const BlockedReason(this.code);
  final String code;
}

/// Groups shown to the crew. Road, flood and official bans are not owner
/// causes (8A/2); they are recorded as weather or force majeure.
enum BlockedGroup {
  customer('Bahçe sahibinden kaynaklı'),
  weather('Hava koşulları'),
  accessOther('Yol, sel ya da resmi yasak (sahipten kaynaklı değil)'),
  company('Bizden kaynaklı'),
  forceMajeure('Başka bir mücbir sebep');

  const BlockedGroup(this.label);
  final String label;
}

/// What happened; [reason] is what the event records.
enum BlockedDetail {
  gateClosed('gate_closed', 'Kapı kapalı', BlockedGroup.customer),
  noKey('no_key', 'Anahtar yok', BlockedGroup.customer),
  noGuard('no_guard', 'Bekçi yok', BlockedGroup.customer),
  noBoundaryPointer(
    'no_boundary_pointer',
    'Sınırı gösterecek kişi yok',
    BlockedGroup.customer,
  ),
  rain('rain', 'Yağmur', BlockedGroup.weather),
  dustWind('dust_wind', 'Yoğun toz ya da rüzgâr', BlockedGroup.weather),
  weatherOther('weather_other', 'Başka bir hava koşulu', BlockedGroup.weather),
  roadClosed('road_closed', 'Yol kapandı', BlockedGroup.accessOther),
  flood('flood', 'Sel', BlockedGroup.accessOther),
  officialBan('official_ban', 'Resmi yasak', BlockedGroup.accessOther),
  equipment('equipment', 'Ekipman arızası', BlockedGroup.company),
  staff('staff', 'Personel gelemedi', BlockedGroup.company),
  forceMajeureOther(
    'force_majeure_other',
    'Başka bir mücbir sebep',
    BlockedGroup.forceMajeure,
  );

  const BlockedDetail(this.code, this.label, this.group);
  final String code;
  final String label;
  final BlockedGroup group;

  /// Reason on the event. Flood is weather; a closed road and an official
  /// ban are force majeure.
  BlockedReason get reason => switch (this) {
    gateClosed ||
    noKey ||
    noGuard ||
    noBoundaryPointer => BlockedReason.customer,
    rain || dustWind || weatherOther || flood => BlockedReason.weather,
    roadClosed ||
    officialBan ||
    forceMajeureOther => BlockedReason.forceMajeure,
    equipment || staff => BlockedReason.company,
  };

  /// An owner cause is documented with a timestamped photo and a note
  /// (H15).
  bool get needsEvidence => reason == BlockedReason.customer;

  /// "Other" needs a note saying what it was.
  bool get needsNote =>
      needsEvidence || this == weatherOther || this == forceMajeureOther;

  static BlockedDetail? fromCode(String? code) =>
      values.where((v) => v.code == code).firstOrNull;
}

/// `visit_blocked` payload.
String blockedVisitPayload(
  BlockedDetail detail, {
  String? note,
  required int photoCount,
}) => jsonEncode({
  'reason': detail.reason.code,
  'detail': detail.code,
  if (_clean(note) != null) 'note': _clean(note),
  'photo_count': photoCount,
});

// --- Boundary pointer (H07, T16, H32) -----------------------------------------

/// Role of the person who shows the boundary.
enum PointerRole {
  owner('owner', 'Bahçe sahibi'),
  ownerRelative('owner_relative', 'Sahibin yakını'),
  worker('worker', 'İşçi / bekçi'),
  neighbor('neighbor', 'Komşu'),
  other('other', 'Diğer');

  const PointerRole(this.code, this.label);
  final String code;
  final String label;

  static PointerRole? fromCode(String? code) =>
      values.where((v) => v.code == code).firstOrNull;
}

/// The company's domain in the legal texts; the placeholder stays until the
/// company fills it in (docs/hukuk/kararlar.md, "Yayın şartları").
const legalDomain = String.fromEnvironment(
  'ORCHADOS_DOMAIN',
  defaultValue: '[alanadi]',
);

/// Oral notice to the person who shows the boundary at first contact (H32).
const pointerNoticeScript =
    'Numaranızı bahçe sahibi bize verdi. orchadOS bahçe denetimi için sizi '
    'ziyaret günü aramak ve sınırı göstermeniz için kullanıyoruz. Ayrıntılı '
    'bilgi: $legalDomain/kvkk.';

/// Error for the pointer's name in Turkish, or null.
String? pointerNameError(String name) =>
    textError(name, maxLength: maxPointerNameLength, required: true);

/// `boundary_pointer` payload. Never a phone number.
String boundaryPointerPayload(String name, PointerRole role) =>
    jsonEncode({'name': name.trim(), 'role': role.code});
