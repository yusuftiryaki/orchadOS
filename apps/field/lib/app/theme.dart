import 'package:flutter/material.dart';

/// Brand colours, shared with the web app (apps/web/src/app/globals.css).
abstract final class Brand {
  static const green = Color(0xFF2F6B2A);
  static const greenDark = Color(0xFF234F20);
  static const leaf = Color(0xFFB9DC8F);
  static const background = Color(0xFFF5F6F2);
  static const surface = Colors.white;
  static const surfaceMuted = Color(0xFFF1F3ED);
  static const border = Color(0xFFE1E5DC);
  static const text = Color(0xFF17201A);
  static const muted = Color(0xFF5F6A61);
  static const ok = Color(0xFF2E7D32);
  static const warn = Color(0xFFB45F06);
  static const bad = Color(0xFFC0362C);
}

/// Light theme for outdoor use: high contrast, large touch targets, flat
/// cards with a thin border instead of shadows (shadows wash out in sunlight).
ThemeData buildTheme() {
  final scheme =
      ColorScheme.fromSeed(
        seedColor: Brand.green,
        primary: Brand.green,
        onPrimary: Colors.white,
        surface: Brand.surface,
        onSurface: Brand.text,
        error: Brand.bad,
      ).copyWith(
        surfaceContainerLowest: Colors.white,
        surfaceContainerLow: Brand.background,
        surfaceContainer: Brand.surfaceMuted,
        outlineVariant: Brand.border,
        onSurfaceVariant: Brand.muted,
      );
  final base = ThemeData(
    colorScheme: scheme,
    useMaterial3: true,
    scaffoldBackgroundColor: Brand.background,
    visualDensity: VisualDensity.standard,
  );
  final text = base.textTheme.apply(
    bodyColor: Brand.text,
    displayColor: Brand.text,
  );
  final shape12 = RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(12),
  );
  const buttonText = TextStyle(fontSize: 18, fontWeight: FontWeight.w600);
  return base.copyWith(
    textTheme: text.copyWith(
      headlineMedium: text.headlineMedium?.copyWith(
        fontWeight: FontWeight.w700,
      ),
      titleLarge: text.titleLarge?.copyWith(fontWeight: FontWeight.w700),
      titleMedium: text.titleMedium?.copyWith(fontWeight: FontWeight.w600),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: Brand.background,
      foregroundColor: Brand.text,
      surfaceTintColor: Colors.transparent,
      scrolledUnderElevation: 1,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        fontSize: 22,
        fontWeight: FontWeight.w700,
        color: Brand.text,
        letterSpacing: -0.2,
      ),
    ),
    cardTheme: CardThemeData(
      color: Brand.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: Brand.border),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(64, 56),
        shape: shape12,
        textStyle: buttonText,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(64, 56),
        shape: shape12,
        textStyle: buttonText,
        foregroundColor: Brand.text,
        side: const BorderSide(color: Color(0xFFC9CFC2)),
        backgroundColor: Brand.surface,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        minimumSize: const Size(48, 48),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Brand.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFC9CFC2)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFC9CFC2)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Brand.green, width: 2),
      ),
    ),
    chipTheme: base.chipTheme.copyWith(
      backgroundColor: Brand.surface,
      side: const BorderSide(color: Brand.border),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      labelStyle: const TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w500,
        color: Brand.text,
      ),
    ),
    listTileTheme: const ListTileThemeData(
      contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      minVerticalPadding: 12,
    ),
    dividerTheme: const DividerThemeData(color: Brand.border, space: 1),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: Brand.green,
    ),
  );
}
