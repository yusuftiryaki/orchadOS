import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../app/theme.dart';

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
          textStyle: const TextStyle(fontSize: 21, fontWeight: FontWeight.w700),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          elevation: 0,
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

/// Place for a reference picture ("böyle çek" / question example). An SVG
/// drawing shows its top as a thumbnail and opens in full on tap; other
/// assets show as they are; without one, a placeholder.
class ReferenceImage extends StatelessWidget {
  const ReferenceImage({super.key, this.assetPath, this.size = 96});

  final String? assetPath;
  final double size;

  static bool isDrawing(String? path) => path != null && path.endsWith('.svg');

  /// Shows the whole drawing over the current screen.
  static Future<void> open(BuildContext context, String path) => showDialog(
    context: context,
    builder: (context) => Dialog(
      key: const Key('reference-full'),
      insetPadding: const EdgeInsets.all(8),
      backgroundColor: Colors.white,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Flexible(
            child: InteractiveViewer(
              maxScale: 4,
              child: SvgPicture.asset(path, fit: BoxFit.contain),
            ),
          ),
          TextButton.icon(
            key: const Key('reference-close'),
            style: TextButton.styleFrom(
              minimumSize: const Size.fromHeight(56),
              textStyle: const TextStyle(fontSize: 20),
            ),
            onPressed: () => Navigator.of(context).pop(),
            icon: const Icon(Icons.close),
            label: const Text('Kapat'),
          ),
        ],
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final path = assetPath;
    final Widget child;
    if (path == null) {
      child = ColoredBox(
        key: const Key('reference-placeholder'),
        color: scheme.surfaceContainerHighest,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.image_outlined, size: size / 3),
            const Text('Örnek görsel', style: TextStyle(fontSize: 12)),
          ],
        ),
      );
    } else if (isDrawing(path)) {
      child = Material(
        color: Colors.white,
        child: InkWell(
          key: Key('reference-drawing:$path'),
          onTap: () => open(context, path),
          child: Stack(
            fit: StackFit.expand,
            children: [
              SvgPicture.asset(
                path,
                fit: BoxFit.cover,
                alignment: Alignment.topCenter,
              ),
              const Align(
                alignment: Alignment.bottomRight,
                child: Padding(
                  padding: EdgeInsets.all(4),
                  child: CircleAvatar(
                    radius: 14,
                    backgroundColor: Colors.black54,
                    child: Icon(Icons.zoom_in, size: 20, color: Colors.white),
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    } else {
      child = Image.asset(path, fit: BoxFit.cover);
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: SizedBox.square(dimension: size, child: child),
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
    Health.ok => Brand.ok,
    Health.warn => Brand.warn,
    Health.bad => Brand.bad,
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
        backgroundColor: Brand.bad,
      ),
    );
}

/// The orchadOS mark: a pistachio leaf in a rounded square.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 56});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: Brand.green,
        borderRadius: BorderRadius.circular(size * 0.28),
      ),
      child: Icon(Icons.eco, color: Brand.leaf, size: size * 0.6),
    );
  }
}

/// Icon in a tinted rounded square, for list rows and cards.
class IconBadge extends StatelessWidget {
  const IconBadge({super.key, required this.icon, this.color, this.size = 56});

  final IconData icon;
  final Color? color;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = color ?? Theme.of(context).colorScheme.primary;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Icon(icon, color: c, size: size * 0.55),
    );
  }
}

/// Small rounded label: "Tamamlandı", "Bugün", "Size atanmış".
class Pill extends StatelessWidget {
  const Pill({super.key, required this.label, this.color});

  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? Brand.muted;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c),
      ),
    );
  }
}
