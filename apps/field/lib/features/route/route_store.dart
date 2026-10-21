import 'package:uuid/uuid.dart';

import '../tasks/field_task.dart';
import 'grid_route.dart';

// Stored routes (docs/arayuzler.md, "Grid rotası"): a parcel keeps the
// first route used on it as a version (`public.parcel_route`); later visits
// on any phone reuse that version. A new version is only made when the
// inventory replaces a route laid out from the boundary alone.

/// Namespace of the route ids (uuid v5 of `<parcel>/<content hash>`).
const String routeIdNamespace = '7c1e9a42-5b3d-4e8f-a6c0-2d9b4f1e8a37';

/// Id of a route: the same route of the same parcel has the same id on
/// every phone, so two phones storing it leave one row.
String routeId(String parcelId, String contentHash) =>
    const Uuid().v5(routeIdNamespace, '$parcelId/$contentHash');

/// A route version of a parcel.
class StoredRoute {
  const StoredRoute({
    required this.id,
    required this.parcelId,
    required this.version,
    required this.route,
  });

  final String id;
  final String parcelId;

  /// Version on the server; on a route not sent yet, the phone's guess
  /// (latest known + 1). The server may give it the next free number.
  final int version;
  final GridRoute route;

  Map<String, Object?> toJson() => {
    'id': id,
    'parcel_id': parcelId,
    'version': version,
    'route': route.toJson(),
  };

  factory StoredRoute.fromJson(Map<String, Object?> j) => StoredRoute(
    id: j['id']! as String,
    parcelId: j['parcel_id']! as String,
    version: j['version']! as int,
    route: GridRoute.fromJson((j['route']! as Map).cast<String, Object?>()),
  );
}

/// The parcel has located slots in at least one row with two of them: an
/// inventory route can be laid out between the rows.
bool hasInventory(List<SlotPoint> slots) {
  final perRow = <int, int>{};
  for (final s in slots) {
    if (s.position == null || s.isInterstitial) continue;
    final n = perRow[s.rowNo] = (perRow[s.rowNo] ?? 0) + 1;
    if (n >= 2) return true;
  }
  return false;
}

/// The newer of the server's route and one stored on this phone.
StoredRoute? latestRoute(StoredRoute? server, StoredRoute? local) {
  if (server == null) return local;
  if (local == null) return server;
  if (local.id == server.id) return server;
  return local.version > server.version ? local : server;
}

/// Whether [stored] is the route for a visit of [task]: always, unless it
/// was laid out before the inventory and the parcel now has one.
bool reuseRoute(StoredRoute stored, FieldTask task) =>
    stored.route.basis == RouteBasis.inventory || !hasInventory(task.slots);
