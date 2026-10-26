import { describe, expect, it } from "vitest";
import { azimuthDeg, distanceM, sameSpot, viewWedge, type TourPanorama } from "./tour";

const pano = (id: string, lon: number, lat: number, headingDeg: number): TourPanorama => ({
  id,
  position: [lon, lat],
  headingDeg,
  fullAssetId: id,
  previewAssetId: null,
});

describe("time travel and view direction", () => {
  const here = pano("a", 37.38, 37.07, 90);

  it("opens the same spot in another visit, looking the same way", () => {
    const other = [pano("far", 37.381, 37.071, 0), pano("near", 37.38002, 37.07, 180)];
    const same = sameSpot(other, here, 10)!;
    expect(same.panorama.id).toBe("near");
    // Looking at azimuth 100: in a panorama headed 180 that is yaw -80.
    expect(same.yawDeg).toBeCloseTo(-80);
    expect(same.distanceM).toBeLessThan(2);
    expect(sameSpot([pano("far", 37.381, 37.071, 0)], here, 0)).toBeNull();
    expect(sameSpot([], here, 0)).toBeNull();
  });

  it("draws the field of view as a wedge towards the azimuth", () => {
    const wedge = viewWedge(here.position, 45, { lengthM: 10 });
    expect(wedge[0]).toEqual(here.position);
    expect(wedge[wedge.length - 1]).toEqual(here.position);
    const tip = wedge[Math.floor(wedge.length / 2)];
    expect(distanceM(here.position, tip)).toBeCloseTo(10, 0);
    expect(azimuthDeg(here.position, tip)).toBeCloseTo(45, 0);
  });
});
