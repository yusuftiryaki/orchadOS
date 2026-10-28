import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/ui/widgets.dart';
import '../session/session_controller.dart';
import 'field_records.dart';

/// Field instruction on the scan screen and "Bir kişi itiraz etti" (H01).
class FieldInstructionCard extends ConsumerWidget {
  const FieldInstructionCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final objections = ref.watch(
      sessionControllerProvider.select((s) => s.objections),
    );
    return Card(
      key: const Key('field-instruction'),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(Icons.record_voice_over, size: 32),
              title: Text(fieldInstruction, style: TextStyle(fontSize: 16)),
            ),
            OutlinedButton.icon(
              key: const Key('notice-objection'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(52),
                foregroundColor: Colors.orange.shade900,
              ),
              icon: const Icon(Icons.pan_tool_outlined),
              label: Text(
                objections == 0
                    ? 'Bir kişi itiraz etti'
                    : 'Bir kişi itiraz etti ($objections)',
                style: const TextStyle(fontSize: 18),
              ),
              onPressed: () => recordObjection(context, ref),
            ),
          ],
        ),
      ),
    );
  }
}

/// Asks for a note and records `field_notice_objection`.
Future<void> recordObjection(BuildContext context, WidgetRef ref) async {
  final note = await showDialog<String>(
    context: context,
    builder: (_) => const _ObjectionDialog(),
  );
  if (note == null) return;
  final ok = await ref
      .read(sessionControllerProvider.notifier)
      .recordObjection(note);
  if (!context.mounted) return;
  if (!ok) {
    showError(context, 'İtiraz kaydedilemedi');
    return;
  }
  ScaffoldMessenger.of(context).showSnackBar(
    const SnackBar(
      content: Text(
        'İtiraz kaydedildi. Bu bölümü şimdi taramayın; daha sonra taranacak.',
      ),
    ),
  );
}

class _ObjectionDialog extends StatefulWidget {
  const _ObjectionDialog();

  @override
  State<_ObjectionDialog> createState() => _ObjectionDialogState();
}

class _ObjectionDialogState extends State<_ObjectionDialog> {
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final typed = _note.text.trim();
    final error = typed.isEmpty
        ? null
        : textError(typed, maxLength: maxNoteLength);
    return AlertDialog(
      title: const Text('Bir kişi itiraz etti'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'O bölüm daha sonra taranır. Nerede ve ne olduğunu kısaca yazın.',
          ),
          const SizedBox(height: 12),
          TextField(
            key: const Key('objection-note'),
            controller: _note,
            autofocus: true,
            maxLines: 3,
            maxLength: maxNoteLength,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              labelText: 'Not',
              helperText: noteHint,
              helperMaxLines: 3,
              errorText: error,
              border: const OutlineInputBorder(),
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Vazgeç'),
        ),
        FilledButton(
          key: const Key('objection-save'),
          onPressed: typed.isEmpty || error != null
              ? null
              : () => Navigator.of(context).pop(typed),
          child: const Text('Kaydet'),
        ),
      ],
    );
  }
}

/// "Bahçede rastlanan kişilere sözlü bilgi verildi" on the visit summary
/// (H01). Required before the visit is finished; the newest answer counts.
class VerbalNoticeCard extends ConsumerStatefulWidget {
  const VerbalNoticeCard({super.key});

  @override
  ConsumerState<VerbalNoticeCard> createState() => _VerbalNoticeCardState();
}

class _VerbalNoticeCardState extends ConsumerState<VerbalNoticeCard> {
  VerbalNotice? _answer;
  final _note = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final ok = await ref
        .read(sessionControllerProvider.notifier)
        .recordVerbalNotice(_answer!, note: _note.text);
    if (!mounted) return;
    setState(() => _saving = false);
    if (!ok) showError(context, 'Kaydedilemedi');
  }

  @override
  Widget build(BuildContext context) {
    final saved = ref.watch(
      sessionControllerProvider.select((s) => s.verbalNotice),
    );
    final answer = _answer;
    final error = textError(
      _note.text,
      maxLength: maxNoteLength,
      required: answer == VerbalNotice.notGiven,
    );
    final typedError = _note.text.trim().isEmpty ? null : error;
    return Card(
      key: const Key('verbal-notice'),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ListTile(
              leading: Icon(
                saved == null ? Icons.record_voice_over : Icons.check_circle,
                color: saved == null ? Colors.orange : Colors.green,
                size: 36,
              ),
              title: const Text(
                'Bahçede rastlanan kişilere sözlü bilgi verildi mi?',
                style: TextStyle(fontSize: 18),
              ),
              subtitle: saved == null
                  ? const Text('Ziyareti bitirmeden önce cevaplayın')
                  : Text(
                      'Kaydedildi: ${saved.label}',
                      key: const Key('verbal-notice-saved'),
                    ),
            ),
            for (final option in VerbalNotice.values)
              CheckboxListTile(
                key: Key('verbal-notice-${option.code}'),
                minTileHeight: 56,
                title: Text(option.label, style: const TextStyle(fontSize: 17)),
                value: answer == option,
                onChanged: (v) => setState(() => _answer = v! ? option : null),
              ),
            if (answer != null) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: TextField(
                  key: const Key('verbal-notice-note'),
                  controller: _note,
                  maxLines: 2,
                  maxLength: maxNoteLength,
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(
                    labelText: answer == VerbalNotice.notGiven
                        ? 'Neden verilemedi?'
                        : 'Not (isteğe bağlı)',
                    helperText: noteHint,
                    helperMaxLines: 3,
                    errorText: typedError,
                    border: const OutlineInputBorder(),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                child: FilledButton(
                  key: const Key('verbal-notice-save'),
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(52),
                  ),
                  onPressed: error != null || _saving ? null : _save,
                  child: const Text('Kaydet', style: TextStyle(fontSize: 18)),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Who shows the boundary (inventory): name and role, never the phone
/// (H07, T16), with the oral notice to read at first contact (H32).
class BoundaryPointerCard extends ConsumerStatefulWidget {
  const BoundaryPointerCard({super.key});

  @override
  ConsumerState<BoundaryPointerCard> createState() =>
      _BoundaryPointerCardState();
}

class _BoundaryPointerCardState extends ConsumerState<BoundaryPointerCard> {
  late final _name = TextEditingController(
    text: ref.read(sessionControllerProvider).pointerName,
  );
  late PointerRole? _role = ref.read(sessionControllerProvider).pointerRole;
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final ok = await ref
        .read(sessionControllerProvider.notifier)
        .recordBoundaryPointer(_name.text, _role!);
    if (!mounted) return;
    setState(() => _saving = false);
    if (!ok) showError(context, 'Kaydedilemedi');
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(sessionControllerProvider);
    final error = pointerNameError(_name.text);
    final typedError = _name.text.trim().isEmpty ? null : error;
    final unchanged =
        state.pointerName == _name.text.trim() && state.pointerRole == _role;
    return Card(
      key: const Key('boundary-pointer'),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(
                  state.pointerName == null
                      ? Icons.person_pin_circle_outlined
                      : Icons.check_circle,
                  color: state.pointerName == null ? null : Colors.green,
                  size: 32,
                ),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'Sınırı gösteren kişi',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
            if (state.pointerName != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  'Kaydedildi: ${state.pointerName} · '
                  '${state.pointerRole?.label ?? ''}',
                  key: const Key('boundary-pointer-saved'),
                  style: TextStyle(color: Colors.green.shade800),
                ),
              ),
            const SizedBox(height: 8),
            Container(
              key: const Key('boundary-pointer-script'),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFFF1F5FB),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text(
                'İlk görüşmede söyleyin: “$pointerNoticeScript”',
                style: TextStyle(fontSize: 15),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('boundary-pointer-name'),
              controller: _name,
              maxLength: maxPointerNameLength,
              onChanged: (_) => setState(() {}),
              textCapitalization: TextCapitalization.words,
              style: const TextStyle(fontSize: 18),
              decoration: InputDecoration(
                labelText: 'Adı soyadı',
                helperText: 'Telefon numarasını yazmayın.',
                errorText: typedError,
                border: const OutlineInputBorder(),
              ),
            ),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                for (final r in PointerRole.values)
                  ChoiceChip(
                    key: Key('boundary-pointer-role-${r.code}'),
                    label: Text(r.label, style: const TextStyle(fontSize: 17)),
                    selected: _role == r,
                    onSelected: (on) => setState(() => _role = on ? r : null),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            FilledButton(
              key: const Key('boundary-pointer-save'),
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(52),
              ),
              onPressed: error != null || _role == null || unchanged || _saving
                  ? null
                  : _save,
              child: const Text('Kaydet', style: TextStyle(fontSize: 18)),
            ),
          ],
        ),
      ),
    );
  }
}
