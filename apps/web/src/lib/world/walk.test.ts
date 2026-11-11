import { describe, expect, it } from "vitest";
import { directionOf } from "./geometry";
import {
  azimuthOfScene,
  clampToBounds,
  isMoving,
  look,
  MAX_PITCH,
  nearestViewpoint,
  NO_INPUT,
  pitchOfScene,
  rayToGround,
  RUN_FACTOR,
  stepToward,
  TURN_SPEED,
  WALK_SPEED,
  walkStep,
  type WalkState,
} from "./walk";

const BOUNDS = { minE: -50, minN: -50, maxE: 50, maxN: 50 };
const AT: WalkState = { e: 0, n: 0, yawDeg: 0, pitchDeg: 0 };

describe("walking", () => {
  it("walks forward along the heading", () => {
    const north = walkStep(AT, { ...NO_INPUT, forward: 1 }, 1 / 10, BOUNDS);
    expect(north.n).toBeCloseTo(WALK_SPEED / 10);
    expect(north.e).toBeCloseTo(0);
    const east = walkStep({ ...AT, yawDeg: 90 }, { ...NO_INPUT, forward: 1 }, 0.1, BOUNDS);
    expect(east.e).toBeCloseTo(WALK_SPEED / 10);
    expect(east.n).toBeCloseTo(0);
  });

  it("steps sideways to the right, runs faster and is no faster diagonally", () => {
    const right = walkStep(AT, { ...NO_INPUT, strafe: 1 }, 0.1, BOUNDS);
    expect(right.e).toBeCloseTo(WALK_SPEED / 10);
    const run = walkStep(AT, { ...NO_INPUT, forward: 1, run: true }, 0.1, BOUNDS);
    expect(run.n).toBeCloseTo((WALK_SPEED * RUN_FACTOR) / 10);
    const diagonal = walkStep(AT, { ...NO_INPUT, forward: 1, strafe: 1 }, 0.1, BOUNDS);
    expect(Math.hypot(diagonal.e, diagonal.n)).toBeCloseTo(WALK_SPEED / 10);
  });

  it("turns with the arrow keys and wraps the heading", () => {
    const left = walkStep(AT, { ...NO_INPUT, turn: -1 }, 0.1, BOUNDS);
    expect(left.yawDeg).toBeCloseTo(360 - TURN_SPEED / 10);
    expect(left.e).toBe(0);
    expect(isMoving({ ...NO_INPUT, turn: -1 })).toBe(true);
    expect(isMoving(NO_INPUT)).toBe(false);
  });

  it("stays inside the parcel and ignores long frame gaps", () => {
    const edge = walkStep({ ...AT, n: 49.9 }, { ...NO_INPUT, forward: 1 }, 0.1, BOUNDS);
    expect(edge.n).toBe(50);
    const paused = walkStep(AT, { ...NO_INPUT, forward: 1 }, 5, BOUNDS);
    expect(paused.n).toBeCloseTo(WALK_SPEED * 0.1);
    expect(clampToBounds(-99, 99, BOUNDS)).toEqual([-50, 50]);
  });

  it("walks to a double-clicked point and turns to face it", () => {
    let state = AT;
    let arrived = false;
    let frames = 0;
    while (!arrived && frames < 100) {
      ({ state, arrived } = stepToward(state, [3, 4], 0.05));
      frames++;
    }
    expect(arrived).toBe(true);
    expect(state.e).toBeCloseTo(3);
    expect(state.n).toBeCloseTo(4);
    expect(state.yawDeg).toBeCloseTo((Math.atan2(3, 4) * 180) / Math.PI);
  });

  it("looks around by dragging, with the pitch limited", () => {
    const turned = look(AT, -100, 0, 600, 60);
    expect(turned.yawDeg).toBeCloseTo(10);
    expect(look(AT, 0, 100_000, 600, 60).pitchDeg).toBe(MAX_PITCH);
    expect(look(AT, 0, -100_000, 600, 60).pitchDeg).toBe(-MAX_PITCH);
  });
});

describe("ray to the ground", () => {
  it("finds where a downward ray meets a flat ground", () => {
    const hit = rayToGround([0, 0, 1.6], [0, 1, -1.6 / 8], () => 0)!;
    expect(hit[0]).toBeCloseTo(0, 1);
    expect(hit[1]).toBeCloseTo(8, 1);
  });

  it("follows a slope and misses the sky", () => {
    // Ground rising 0.1 m per metre northwards.
    const hit = rayToGround([0, 0, 1.6], [0, 1, -0.1], (_e, n) => 0.1 * n)!;
    expect(hit[1]).toBeCloseTo(8, 1);
    expect(rayToGround([0, 0, 1.6], [0, 1, 0.2], () => 0)).toBeNull();
    expect(rayToGround([0, 0, 1.6], [0, 1, -0.001], () => 0, 50)).toBeNull();
  });
});

describe("viewpoints and directions", () => {
  it("picks the nearest panorama viewpoint", () => {
    const points = [
      { id: "a", en: [0, 0] as [number, number] },
      { id: "b", en: [10, 0] as [number, number] },
    ];
    expect(nearestViewpoint(points, 7, 1)?.id).toBe("b");
    expect(nearestViewpoint([], 0, 0)).toBeNull();
  });

  it("reads azimuth and pitch back from a scene direction", () => {
    expect(azimuthOfScene(directionOf(135, 0))).toBeCloseTo(135);
    expect(azimuthOfScene(directionOf(300, 20))).toBeCloseTo(300);
    expect(pitchOfScene(directionOf(10, -25))).toBeCloseTo(-25);
  });
});
