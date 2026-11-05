// Markers of the panorama viewer (components/panorama/use-panorama-viewer.ts)
// and their Photo Sphere Viewer markers-plugin configuration. Yaw and pitch
// in degrees from the panorama's centre column, yaw rightwards, pitch up.

const RAD = Math.PI / 180;

// An HTML marker at one point (tree, arrow, label).
export interface PanoramaPointMarker {
  kind?: "point";
  id: string;
  yawDeg: number;
  pitchDeg: number;
  html: string;
  // Square size in px, or width and height.
  size: number | { width: number; height: number };
  tooltip?: string;
  // Where the point sits on the marker (PSV anchor); "center center" by default.
  anchor?: string;
  // CSS class on the marker element (e.g. pointer-events: none).
  className?: string;
}

// A line through points on the sphere (an SVG polyline drawn by PSV). Lines
// between two points stay straight on screen (the view is a perspective
// projection), so a straight line in the world needs no extra points.
export interface PanoramaLineMarker {
  kind: "polyline";
  id: string;
  points: { yawDeg: number; pitchDeg: number }[];
  stroke: string;
  strokeWidth: number;
  // SVG stroke-dasharray, e.g. "6 4".
  dash?: string;
  // CSS class on the SVG element (e.g. pointer-events: none).
  className?: string;
  // Drawing order among markers (PSV's default is 1).
  zIndex?: number;
}

export type PanoramaMarker = PanoramaPointMarker | PanoramaLineMarker;

// The PSV markers-plugin configuration of a marker.
export function psvMarkerConfig(m: PanoramaMarker) {
  if (m.kind === "polyline") {
    return {
      id: m.id,
      polyline: m.points.map((p) => [p.yawDeg * RAD, p.pitchDeg * RAD] as [number, number]),
      svgStyle: {
        stroke: m.stroke,
        strokeWidth: String(m.strokeWidth),
        strokeLinecap: "round",
        strokeLinejoin: "round",
        fill: "none",
        ...(m.dash ? { strokeDasharray: m.dash } : {}),
      },
      ...(m.className ? { className: m.className } : {}),
      ...(m.zIndex !== undefined ? { zIndex: m.zIndex } : {}),
    };
  }
  return {
    id: m.id,
    position: { yaw: m.yawDeg * RAD, pitch: m.pitchDeg * RAD },
    html: m.html,
    anchor: m.anchor ?? "center center",
    size: typeof m.size === "number" ? { width: m.size, height: m.size } : m.size,
    ...(m.tooltip ? { tooltip: { content: m.tooltip, position: "top center" } } : {}),
    ...(m.className ? { className: m.className } : {}),
  };
}
