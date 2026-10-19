import 'package:flutter/material.dart';

/// Full-width button with an icon, sized for gloved hands and sunlight.
class BigButton extends StatelessWidget {
  const BigButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onPressed,
    this.color,
    this.busy = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onPressed;
  final Color? color;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final bg = color ?? scheme.primary;
    return SizedBox(
      width: double.infinity,
      height: 72,
      child: FilledButton.icon(
        style: FilledButton.styleFrom(
          backgroundColor: bg,
          textStyle: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
        onPressed: busy ? null : onPressed,
        icon: busy
            ? const SizedBox.square(
                dimension: 28,
                child: CircularProgressIndicator(strokeWidth: 3),
              )
            : Icon(icon, size: 32),
        label: Text(label),
      ),
    );
  }
}

/// Place for a reference picture ("böyle çek" / question example). Shows a
/// placeholder until the methodology delivers the images.
class ReferenceImage extends StatelessWidget {
  const ReferenceImage({super.key, this.assetPath, this.size = 96});

  final String? assetPath;
  final double size;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final path = assetPath;
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: SizedBox.square(
        dimension: size,
        child: path != null
            ? Image.asset(path, fit: BoxFit.cover)
            : ColoredBox(
                key: const Key('reference-placeholder'),
                color: scheme.surfaceContainerHighest,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.image_outlined, size: size / 3),
                    const Text('Örnek görsel', style: TextStyle(fontSize: 12)),
                  ],
                ),
              ),
      ),
    );
  }
}

/// Coloured status line: ok / warning / bad.
enum Health { ok, warn, bad }

class StatusLine extends StatelessWidget {
  const StatusLine({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
    required this.health,
  });

  final IconData icon;
  final String label;
  final String value;
  final Health health;

  static Color colorFor(Health h) => switch (h) {
    Health.ok => Colors.green.shade700,
    Health.warn => Colors.orange.shade800,
    Health.bad => Colors.red.shade700,
  };

  @override
  Widget build(BuildContext context) {
    final c = colorFor(health);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, color: c, size: 28),
          const SizedBox(width: 12),
          Expanded(child: Text(label, style: const TextStyle(fontSize: 18))),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: c,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

void showError(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(message, style: const TextStyle(fontSize: 18)),
        backgroundColor: Colors.red.shade700,
      ),
    );
}
