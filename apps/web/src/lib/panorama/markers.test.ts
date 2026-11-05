import { describe, expect, it } from "vitest";
import { psvMarkerConfig } from "./markers";

const RAD = Math.PI / 180;

describe("panorama markers", () => {
  it("places a point marker in radians, centred by default", () => {
    expect(
      psvMarkerConfig({ id: "tree:1", yawDeg: 90, pitchDeg: -10, html: "<b>1</b>", size: 28 }),
    ).toEqual({
      id: "tree:1",
      position: { yaw: 90 * RAD, pitch: -10 * RAD },
      html: "<b>1</b>",
      anchor: "center center",
      size: { width: 28, height: 28 },
    });
    expect(
      psvMarkerConfig({
        id: "label",
        yawDeg: 0,
        pitchDeg: 0,
        html: "x",
        size: { width: 120, height: 24 },
        anchor: "bottom center",
        tooltip: "t",
      }),
    ).toMatchObject({
      anchor: "bottom center",
      size: { width: 120, height: 24 },
      tooltip: { content: "t", position: "top center" },
    });
  });

  it("draws a polyline through yaw/pitch points", () => {
    expect(
      psvMarkerConfig({
        kind: "polyline",
        id: "guide:base",
        points: [
          { yawDeg: -10, pitchDeg: 5 },
          { yawDeg: 10, pitchDeg: 5 },
        ],
        stroke: "#fff",
        strokeWidth: 2,
        dash: "6 4",
        className: "guide",
        zIndex: 0,
      }),
    ).toEqual({
      id: "guide:base",
      polyline: [
        [-10 * RAD, 5 * RAD],
        [10 * RAD, 5 * RAD],
      ],
      svgStyle: {
        stroke: "#fff",
        strokeWidth: "2",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        fill: "none",
        strokeDasharray: "6 4",
      },
      className: "guide",
      zIndex: 0,
    });
  });
});
