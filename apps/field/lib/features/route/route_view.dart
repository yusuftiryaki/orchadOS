import '../../core/geo/geo.dart';
import 'grid_route.dart';
import 'route_guide.dart';
import 'route_store.dart';

/// The route on the session screen.
class RouteView {
  const RouteView({
    this.route,
    this.missing,
    this.committed = false,
    this.stored,
    this.guidance,
    this.settingDirection = false,
    this.firstTap,
    this.stopGo = false,
    this.beeps = 0,
    this.toNextBeepM,
    this.stopUntil,
  });

  /// The route in use, or the proposal waiting for the crew.
  final GridRoute? route;

  /// Why there is no route yet.
  final RouteMissing? missing;

  /// The crew follows [route]; before that it is a proposal (direction
  /// guessed from the boundary or set by the crew) to confirm.
  final bool committed;

  /// The parcel's route version this visit follows (once [committed]).
  final StoredRoute? stored;
  final RouteGuidance? guidance;

  /// The crew is tapping the two ends of a row on the map.
  final bool settingDirection;
  final GeoPoint? firstTap;

  /// "Dur-çek-yürü": beep every 4 m.
  final bool stopGo;
  final int beeps;
  final double? toNextBeepM;

  /// Show "DUR" until then (after a beep).
  final DateTime? stopUntil;

  /// The direction was not taken from the slots or the parcel record.
  bool get needsConfirmation =>
      route != null &&
      !committed &&
      (route!.azimuthSource == AzimuthSource.boundary ||
          route!.azimuthSource == AzimuthSource.crew);

  RouteView copyWith({
    GridRoute? Function()? route,
    RouteMissing? Function()? missing,
    bool? committed,
    StoredRoute? Function()? stored,
    RouteGuidance? Function()? guidance,
    bool? settingDirection,
    GeoPoint? Function()? firstTap,
    bool? stopGo,
    int? beeps,
    double? Function()? toNextBeepM,
    DateTime? Function()? stopUntil,
  }) => RouteView(
    route: route != null ? route() : this.route,
    missing: missing != null ? missing() : this.missing,
    committed: committed ?? this.committed,
    stored: stored != null ? stored() : this.stored,
    guidance: guidance != null ? guidance() : this.guidance,
    settingDirection: settingDirection ?? this.settingDirection,
    firstTap: firstTap != null ? firstTap() : this.firstTap,
    stopGo: stopGo ?? this.stopGo,
    beeps: beeps ?? this.beeps,
    toNextBeepM: toNextBeepM != null ? toNextBeepM() : this.toNextBeepM,
    stopUntil: stopUntil != null ? stopUntil() : this.stopUntil,
  );
}
