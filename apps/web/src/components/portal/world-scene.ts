import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CrownGuide } from "@/lib/portal/crown-guide";
import { NO_TREE, SEGMENT_PRUNED, type WorldCloud, type WorldSkeleton } from "@/lib/world/format";
import {
  changeSpan,
  depthPanorama,
  divergingColor,
  easeInOut,
  enterState,
  ENTER_MS,
  exitState,
  EXIT_MS,
  farthest,
  groundAt,
  groundGrid,
  lerpPose,
  overviewPose,
  panoramaPose,
  type LocalFrame,
  pickNearest,
  originOffset,
  rampColor,
  sceneOf,
  type GroundGrid,
  type Pose,
  type TransitionState,
  type Vec3,
} from "@/lib/world/geometry";
import {
  chooseLabels,
  labelScope,
  pickTree,
  type LabelScope,
  type TreeOnScreen,
} from "@/lib/world/labels";
import {
  azimuthOfScene,
  look,
  nearestViewpoint,
  NO_INPUT,
  rayToGround,
  stepToward,
  WALK_EYE_M,
  walkStep,
  isMoving,
  type Bounds,
  type WalkInput,
  type WalkState,
} from "@/lib/world/walk";

// The 3D world of a visit (docs/3d-dunya.md): the coloured LiDAR cloud, the
// photo of the panorama the visitor stood in, and the measured crowns drawn
// on every tree. Imperative three.js; components/portal/world-view.tsx owns
// it and its React overlay.
//
// The transition: the camera starts exactly at the panorama's camera, with
// its yaw, pitch and vertical field of view, and the photo is drawn on a
// sphere around it, so the first frame is the panorama. A wave runs out from
// the camera: the points it has passed are drawn, and the photo disappears
// wherever the cloud seen in that direction (a depth panorama of the cloud
// itself) is nearer than the wave. Once the photo is gone the camera rises
// to an overview; leaving runs the same backwards.
//
// Visits (Faz 2): each visit's cloud is a layer placed by its origin in the
// first cloud's frame. Switching visits dissolves one into the other: the
// points are stored shuffled, so drawing the first k of them is an even
// sample, and the old layer's k shrinks while the new one's grows. A layer
// can arrive coarse (the first quarter of its points) and be completed later.
//
// Moving around (docs/3d-dunya.md §10): the overview orbits (OrbitControls);
// the walk mode puts the camera at eye height on the ground, looks around by
// dragging and walks with the keys, the direction pad or a double click. The
// tour's panorama viewpoints stand on the ground as rings; picking one flies
// the camera down into it and the tour goes on in that panorama.

export type ColorMode = "photo" | "height" | "diameter" | "growth" | "sizeClass";

// Staff (Faz 3): how the tree's LiDAR size class suggestion compares with its
// recorded class (docs/3d-dunya.md §9.4); null: no suggestion.
export type SizeFlag = "match" | "differs";

export interface SceneTree {
  id: string;
  code: string;
  // East, north metres in the scene's frame (the first cloud's).
  en: [number, number];
  guide: CrownGuide | null;
  heightM: number | null;
  diameterM: number | null;
  // Change of the height since the previous visit that measured the tree.
  growthM: number | null;
  sizeFlag?: SizeFlag | null;
}

// A panorama viewpoint of the tour (east, north metres in the scene's frame).
export interface SceneViewpoint {
  id: string;
  en: [number, number];
}

export type Navigation = "orbit" | "walk";

export interface SceneVisit {
  key: string;
  cloud: WorldCloud;
  trees: SceneTree[];
}

export interface WorldSceneOptions {
  container: HTMLElement;
  labels: HTMLElement;
  // The visit the panorama belongs to; its cloud's origin is the scene's frame.
  visit: SceneVisit;
  frame: LocalFrame;
  photoUrl: string | null;
  // The panorama's position in the cloud's frame, and how the visitor looked.
  eyeEN: [number, number];
  headingDeg: number;
  yawDeg: number;
  pitchDeg: number;
  fovDeg: number;
  cameraHeightM: number;
  reducedMotion: boolean;
  // Staff (Faz 3): no panorama to start from; the world opens straight in the
  // overview and closes at once.
  startOverview?: boolean;
  labelText: (tree: SceneTree) => string;
  onSelect: (treeId: string | null) => void;
  // A viewpoint ring was clicked (the tour flies down into it).
  onViewpoint?: (viewpointId: string) => void;
  // The scene switched to the walk by itself (a double click in the overview).
  onNavigation?: (nav: Navigation) => void;
  onEntered: () => void;
}

interface Layer {
  key: string;
  cloud: WorldCloud;
  points: THREE.Points;
  material: THREE.ShaderMaterial;
  treeIndex: Map<string, number>;
  trees: SceneTree[];
  // How many of its points are drawn (all once shown; animated while switching).
  drawn: number;
  // Winter scans: the branch skeleton, pruned wood and cuts (Faz 2b).
  skeleton: THREE.Group | null;
}

const SWITCH_MS = 1400;
// Between the overview and the walk; flying down into a panorama.
const NAV_MS = 900;
const DESCEND_MS = 1100;
// Field of view while walking.
const WALK_FOV = 70;
// Viewpoint rings on the ground (radii, metres) and how near a click must be.
const RING_INNER_M = 0.32;
const RING_OUTER_M = 0.5;
const VIEWPOINT_PICK_PX = 28;
// Crown radius of a tree without a measured one (its pick silhouette).
const DEFAULT_CROWN_RADIUS_M = 1.5;
// Double click in the overview: one walks there.
const WALK_IN_MARGIN_M = 1;

// Depth panorama resolution (a coarse grid is enough for the dissolve).
const DEPTH_W = 512;
const DEPTH_H = 256;
// Width of the bright front of the wave, metres.
const WAVE_M = 3;
// Point size in voxels: covers the gaps between neighbouring points.
const POINT_VOXELS = 1.8;
// Height the label stands at when the tree has no measured height.
const DEFAULT_TOP_M = 4;
const NO_DEPTH = 1e6;
const BACKGROUND = 0x0d1b24;
const GUIDE = 0xffffff;
// Size class mode (sRGB bytes): the suggestion differs / matches.
const FLAG_COLORS: Record<SizeFlag, readonly number[]> = {
  differs: [245, 140, 40],
  match: [90, 185, 120],
};
const GUIDE_SELECTED = 0xffcf4d;

const POINT_VERTEX = /* glsl */ `
  attribute vec3 aColor;
  attribute float aTree;
  uniform vec3 uOrigin;
  uniform float uReveal;
  uniform float uSize;
  uniform float uScale;
  uniform float uSelected;
  varying vec3 vColor;
  varying float vWave;
  varying float vKeep;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float d = distance(position, uOrigin);
    vKeep = step(d, uReveal);
    vWave = 1.0 - smoothstep(0.0, ${WAVE_M.toFixed(1)}, uReveal - d);
    vColor = aColor;
    if (uSelected >= 0.0 && abs(aTree - uSelected) < 0.5) {
      vColor = mix(vColor, vec3(1.0, 0.81, 0.30), 0.5);
    }
    gl_PointSize = clamp(uSize * uScale / max(-mv.z, 0.05), 1.0, 28.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const POINT_FRAGMENT = /* glsl */ `
  uniform float uWaveOn;
  uniform float uDim;
  varying vec3 vColor;
  varying float vWave;
  varying float vKeep;
  void main() {
    if (vKeep < 0.5) discard;
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;
    vec3 color = mix(vColor * uDim, vec3(0.55, 0.95, 1.0), vWave * uWaveOn * 0.85);
    gl_FragColor = vec4(color, 1.0);
  }
`;

const PHOTO_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Direction (scene axes: x east, y up, z south) -> panorama image: the
// centre column looks along the heading, azimuth grows to the right, the top
// row is the zenith. Both textures are uploaded without flipping.
const PHOTO_FRAGMENT = /* glsl */ `
  #define PI 3.141592653589793
  uniform sampler2D uPhoto;
  uniform sampler2D uDepth;
  uniform float uHeading;
  uniform float uReveal;
  uniform float uOpacity;
  uniform float uHasPhoto;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float az = atan(d.x, -d.z);
    float el = asin(clamp(d.y, -1.0, 1.0));
    vec2 uv = vec2(fract((az - uHeading) / (2.0 * PI) + 0.5), 0.5 - el / PI);
    float depth = texture2D(uDepth, uv).r;
    float ahead = smoothstep(uReveal - 1.0, uReveal, depth);
    vec3 photo = uHasPhoto > 0.5 ? texture2D(uPhoto, uv).rgb : vec3(0.05, 0.1, 0.14);
    gl_FragColor = vec4(photo, uOpacity * ahead);
  }
`;

export class WorldScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly photoMaterial: THREE.ShaderMaterial;
  private readonly photo: THREE.Mesh;
  private readonly guides = new THREE.Group();
  private readonly guideMaterial: THREE.LineBasicMaterial;
  private readonly dashedMaterial: THREE.LineDashedMaterial;
  private readonly selectedGroup = new THREE.Group();
  private readonly ground: GroundGrid;
  private readonly start: Pose;
  private readonly overview: Pose;
  private readonly maxReveal: number;
  private readonly eye: Vec3;
  private readonly frameHeightM: number;
  private readonly layers = new Map<string, Layer>();
  private readonly labelEls = new Map<string, HTMLButtonElement>();
  private readonly tops = new Map<string, THREE.Vector3>();
  private readonly resize: ResizeObserver;
  private readonly textures: THREE.Texture[] = [];
  private layer: Layer;
  private trees: SceneTree[];
  private mode: ColorMode = "photo";
  private skeletonOn = true;
  private switching: { from: Layer; to: Layer; start: number } | null = null;
  private nav: Navigation = "orbit";
  private walk: WalkState = { e: 0, n: 0, yawDeg: 0, pitchDeg: 0 };
  private walkInput: WalkInput = NO_INPUT;
  private walkTarget: [number, number] | null = null;
  private walkAfter: (() => void) | null = null;
  private readonly bounds: Bounds;
  // A camera flight inside the world (overview <-> walk, down into a panorama).
  private flight: { from: Pose; to: Pose; start: number; ms: number; done: () => void } | null =
    null;
  private lastTick = 0;
  private viewpoints: SceneViewpoint[] = [];
  private viewpointMesh: THREE.InstancedMesh | null = null;
  private readonly ringGeometry: THREE.RingGeometry;
  private readonly ringMaterial: THREE.MeshBasicMaterial;
  private frame = 0;
  private phase: "entering" | "world" | "exiting" | "descending" | "done" = "entering";
  private phaseStart = 0;
  private onExited: (() => void) | null = null;
  private dirty = true;
  private overlayOpacity = 0;
  private selected: string | null = null;
  private scale = 1;
  private disposed = false;

  constructor(private readonly options: WorldSceneOptions) {
    const { container } = options;
    const cloud = options.visit.cloud;
    this.frameHeightM = cloud.header.origin_height_m;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(BACKGROUND);
    this.renderer.domElement.dataset.testid = "world-canvas";
    container.appendChild(this.renderer.domElement);

    this.ground = groundGrid(cloud.enu, cloud.tree, cloud.count);
    this.bounds = {
      minE: this.ground.minE,
      minN: this.ground.minN,
      maxE: this.ground.minE + this.ground.cols * this.ground.cell,
      maxN: this.ground.minN + this.ground.rows * this.ground.cell,
    };
    this.ringGeometry = new THREE.RingGeometry(RING_INNER_M, RING_OUTER_M, 32);
    this.ringGeometry.rotateX(-Math.PI / 2);
    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const [eE, eN] = options.eyeEN;
    const groundZ = groundAt(this.ground, eE, eN);
    const eyeEnu: Vec3 = [eE, eN, groundZ + options.cameraHeightM];
    this.eye = sceneOf(...eyeEnu);
    const azimuth = options.headingDeg + options.yawDeg;
    this.start = panoramaPose(this.eye, azimuth, options.pitchDeg, options.fovDeg);
    const extent = Math.hypot(this.ground.cols, this.ground.rows) * this.ground.cell;
    this.overview = overviewPose(this.eye, groundZ, azimuth, extent);
    this.maxReveal = Math.max(10, farthest(cloud.enu, cloud.count, eyeEnu)) + WAVE_M;

    this.camera = new THREE.PerspectiveCamera(options.fovDeg, 1, 0.05, 2000);
    this.applyPose(this.start);
    // For the winter skeleton's tubes (the points are unlit).
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(30, 60, 20);
    this.scene.add(sun);

    this.layer = this.makeLayer(options.visit);
    this.layers.set(this.layer.key, this.layer);
    this.trees = options.visit.trees;

    // The photo sphere around the panorama's camera.
    const depth = depthPanorama(
      cloud.enu,
      cloud.count,
      eyeEnu,
      options.headingDeg,
      DEPTH_W,
      DEPTH_H,
    );
    for (let i = 0; i < depth.length; i++) if (!Number.isFinite(depth[i])) depth[i] = NO_DEPTH;
    const depthTexture = new THREE.DataTexture(
      depth,
      DEPTH_W,
      DEPTH_H,
      THREE.RedFormat,
      THREE.FloatType,
    );
    depthTexture.needsUpdate = true;
    this.textures.push(depthTexture);
    this.photoMaterial = new THREE.ShaderMaterial({
      vertexShader: PHOTO_VERTEX,
      fragmentShader: PHOTO_FRAGMENT,
      side: THREE.BackSide,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uPhoto: { value: null },
        uDepth: { value: depthTexture },
        uHeading: { value: (options.headingDeg * Math.PI) / 180 },
        uReveal: { value: 0 },
        uOpacity: { value: 1 },
        uHasPhoto: { value: 0 },
      },
    });
    this.photo = new THREE.Mesh(new THREE.SphereGeometry(500, 96, 48), this.photoMaterial);
    this.photo.position.set(...this.eye);
    // Drawn over the points: the photo covers them until the wave passes.
    this.photo.renderOrder = 1;
    this.photo.frustumCulled = false;
    this.scene.add(this.photo);
    if (options.photoUrl) this.loadPhoto(options.photoUrl);

    // Measurement drawings.
    this.guideMaterial = new THREE.LineBasicMaterial({
      color: GUIDE,
      transparent: true,
      opacity: 0,
    });
    this.dashedMaterial = new THREE.LineDashedMaterial({
      color: GUIDE,
      transparent: true,
      opacity: 0,
      dashSize: 0.25,
      gapSize: 0.2,
    });
    this.scene.add(this.guides);
    this.scene.add(this.selectedGroup);
    this.buildGuides();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enabled = false;
    this.controls.enableDamping = !options.reducedMotion;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 400;
    this.controls.target.set(...this.overview.target);
    this.controls.addEventListener("change", () => {
      this.dirty = true;
    });

    this.renderer.domElement.addEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.addEventListener("pointermove", this.onPointerMove);
    this.renderer.domElement.addEventListener("pointerup", this.onPointerUp);
    this.renderer.domElement.addEventListener("click", this.onCanvasClick);
    this.renderer.domElement.addEventListener("dblclick", this.onDoubleClick);
    this.resize = new ResizeObserver(() => this.onResize());
    this.resize.observe(container);
    this.onResize();

    this.phaseStart = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  // ---------------------------------------------------------------------------
  // Public
  // ---------------------------------------------------------------------------

  get visitKey() {
    return this.layer.key;
  }

  hasVisit(key: string) {
    return this.layers.has(key);
  }

  // A visit's cloud: a new layer (hidden until shown), or the complete cloud of
  // a layer that arrived coarse.
  setVisit(visit: SceneVisit) {
    const old = this.layers.get(visit.key);
    if (!old) {
      const layer = this.makeLayer(visit);
      layer.drawn = 0;
      layer.points.geometry.setDrawRange(0, 0);
      layer.points.visible = false;
      this.layers.set(visit.key, layer);
      return;
    }
    const shown = old.drawn === old.cloud.count;
    this.fillLayer(old, visit.cloud);
    old.trees = visit.trees;
    if (shown) old.drawn = old.cloud.count;
    old.points.geometry.setDrawRange(0, old.drawn);
    this.paint(old);
    if (old === this.layer) {
      this.trees = visit.trees;
      this.buildGuides();
    }
    this.dirty = true;
  }

  // Dissolves into another visit's cloud; its measurements replace the drawings.
  showVisit(key: string) {
    const to = this.layers.get(key);
    if (!to || to === this.layer) return;
    const from = this.switching ? this.switching.to : this.layer;
    if (this.switching) this.finishSwitch();
    this.layer = to;
    this.trees = to.trees;
    to.points.visible = true;
    this.paint(to);
    this.buildGuides();
    this.select(this.selected && to.treeIndex.has(this.selected) ? this.selected : null);
    if (this.options.reducedMotion || this.phase !== "world") {
      this.switching = { from, to, start: -Infinity };
      this.finishSwitch();
    } else {
      this.switching = { from, to, start: performance.now() };
    }
    this.dirty = true;
  }

  // Shows or hides the winter skeleton (the points are dimmed behind it).
  setSkeleton(on: boolean) {
    this.skeletonOn = on;
    this.showSkeletons();
  }

  // Staff: the size class flags changed (a suggestion was accepted).
  setSizeFlags(flags: Record<string, SizeFlag>) {
    for (const layer of this.layers.values()) {
      layer.trees = layer.trees.map((t) => ({ ...t, sizeFlag: flags[t.id] ?? null }));
    }
    this.trees = this.layer.trees;
    if (this.mode === "sizeClass") {
      for (const layer of this.layers.values()) this.paint(layer);
    }
    this.dirty = true;
  }

  setColorMode(mode: ColorMode) {
    this.mode = mode;
    this.paint(this.layer);
    this.dirty = true;
  }

  select(treeId: string | null) {
    this.selected = treeId;
    for (const layer of this.layers.values()) {
      const index = treeId === null ? undefined : layer.treeIndex.get(treeId);
      layer.material.uniforms.uSelected.value = index ?? -1;
    }
    this.selectedGroup.clear();
    const tree = treeId ? this.trees.find((t) => t.id === treeId) : undefined;
    if (tree?.guide) {
      const material = new THREE.LineBasicMaterial({ color: GUIDE_SELECTED, depthTest: false });
      this.selectedGroup.add(this.guideLines(tree, material, material, false));
    }
    for (const [id, el] of this.labelEls) {
      el.dataset.selected = id === treeId ? "true" : "false";
    }
    this.dirty = true;
  }

  // Flies the camera over a tree and keeps orbiting around it; walking, walks
  // up to it.
  flyTo(treeId: string) {
    const top = this.tops.get(treeId);
    if (!top) return;
    if (this.nav === "walk") {
      const te = top.x;
      const tn = -top.z;
      const d = Math.hypot(te - this.walk.e, tn - this.walk.n);
      if (d < 0.1) return;
      // Stop a few metres short, facing the tree.
      const stop = Math.max(0, d - 4) / d;
      this.walkTo([
        this.walk.e + (te - this.walk.e) * stop,
        this.walk.n + (tn - this.walk.n) * stop,
      ]);
      return;
    }
    const target = top.clone();
    target.y -= 1.5;
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.setLength(Math.min(Math.max(offset.length(), 10), 18));
    this.controls.target.copy(target);
    this.camera.position.copy(target.clone().add(offset));
    this.controls.update();
    this.dirty = true;
  }

  exit(done: () => void) {
    if (this.phase === "exiting" || this.phase === "descending" || this.phase === "done") return;
    this.onExited = done;
    this.controls.enabled = false;
    this.flight = null;
    this.walkInput = NO_INPUT;
    this.walkTarget = null;
    if (this.switching) this.finishSwitch();
    // Fly back from wherever the visitor orbited to.
    this.current = this.poseNow();
    this.phase = "exiting";
    this.phaseStart = performance.now();
    if (this.instant) this.phaseStart -= EXIT_MS;
  }

  // ---------------------------------------------------------------------------
  // Moving around
  // ---------------------------------------------------------------------------

  get navigation(): Navigation {
    return this.nav;
  }

  // Overview <-> walk. Walking starts where the overview looks (the orbit's
  // target on the ground), facing the same way; the overview comes back
  // above and behind where one walked.
  setNavigation(nav: Navigation, done?: () => void) {
    if (this.phase !== "world" || nav === this.nav || this.flight) return;
    const from = this.poseNow();
    if (nav === "walk") {
      const t = this.controls.target;
      const dir = this.camera.getWorldDirection(new THREE.Vector3());
      this.walk = {
        e: t.x,
        n: -t.z,
        yawDeg: azimuthOfScene([dir.x, dir.y, dir.z]),
        pitchDeg: 0,
      };
      [this.walk.e, this.walk.n] = [
        Math.min(this.bounds.maxE, Math.max(this.bounds.minE, this.walk.e)),
        Math.min(this.bounds.maxN, Math.max(this.bounds.minN, this.walk.n)),
      ];
      this.controls.enabled = false;
      this.nav = "walk";
      this.fly(from, this.walkPose(), NAV_MS, () => done?.());
    } else {
      const eye = this.walkEye();
      const groundY = groundAt(this.ground, this.walk.e, this.walk.n);
      const extent = Math.hypot(this.ground.cols, this.ground.rows) * this.ground.cell;
      const to = overviewPose(eye, groundY, this.walk.yawDeg, extent);
      this.walkInput = NO_INPUT;
      this.walkTarget = null;
      this.nav = "orbit";
      this.fly(from, to, NAV_MS, () => {
        this.controls.target.set(...to.target);
        this.controls.enabled = true;
        this.controls.update();
        done?.();
      });
    }
  }

  // Keys and the direction pad while walking.
  setWalkInput(input: WalkInput) {
    this.walkInput = input;
    if (isMoving(input)) this.walkTarget = null;
    this.dirty = true;
  }

  // The tour's panorama viewpoints of the visit on screen, drawn as rings.
  setViewpoints(viewpoints: SceneViewpoint[]) {
    this.viewpoints = viewpoints;
    if (this.viewpointMesh) {
      this.scene.remove(this.viewpointMesh);
      this.viewpointMesh.dispose();
      this.viewpointMesh = null;
    }
    if (viewpoints.length > 0) {
      const mesh = new THREE.InstancedMesh(this.ringGeometry, this.ringMaterial, viewpoints.length);
      const m = new THREE.Matrix4();
      viewpoints.forEach((v, i) => {
        const [x, , z] = sceneOf(v.en[0], v.en[1], 0);
        m.makeTranslation(x, groundAt(this.ground, v.en[0], v.en[1]) + 0.06, z);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      this.viewpointMesh = mesh;
      this.scene.add(mesh);
    }
    this.dirty = true;
  }

  // The viewpoint nearest to where one looks (the overview) or stands (walk).
  nearestViewpointId(): string | null {
    const [e, n] =
      this.nav === "walk"
        ? [this.walk.e, this.walk.n]
        : [this.controls.target.x, -this.controls.target.z];
    return nearestViewpoint(this.viewpoints, e, n)?.id ?? null;
  }

  // Flies down into a viewpoint at the panorama camera's height, looking the
  // way the camera looks now; `done` gets that azimuth (the tour opens the
  // panorama there).
  descend(viewpointId: string, done: (azimuthDeg: number) => void) {
    if (this.phase !== "world") return;
    const v = this.viewpoints.find((x) => x.id === viewpointId);
    if (!v) return;
    const from = this.poseNow();
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    const azimuth = azimuthOfScene([dir.x, dir.y, dir.z]);
    const ground = groundAt(this.ground, v.en[0], v.en[1]);
    const eye = sceneOf(v.en[0], v.en[1], ground + this.options.cameraHeightM);
    const to = panoramaPose(eye, azimuth, 0, this.options.fovDeg);
    this.controls.enabled = false;
    this.walkInput = NO_INPUT;
    this.walkTarget = null;
    if (this.switching) this.finishSwitch();
    this.phase = "descending";
    this.flight = {
      from,
      to,
      start: performance.now() - (this.options.reducedMotion ? DESCEND_MS : 0),
      ms: DESCEND_MS,
      done: () => {
        this.phase = "done";
        done(azimuth);
      },
    };
    this.dirty = true;
  }

  private fly(from: Pose, to: Pose, ms: number, done: () => void) {
    this.flight = {
      from,
      to,
      start: performance.now() - (this.options.reducedMotion ? ms : 0),
      ms,
      done,
    };
    this.dirty = true;
  }

  private walkEye(): Vec3 {
    const g = groundAt(this.ground, this.walk.e, this.walk.n);
    return sceneOf(this.walk.e, this.walk.n, g + WALK_EYE_M);
  }

  private walkPose(): Pose {
    return panoramaPose(this.walkEye(), this.walk.yawDeg, this.walk.pitchDeg, WALK_FOV);
  }

  private walkTo(target: [number, number], after?: () => void) {
    this.walkTarget = [
      Math.min(this.bounds.maxE, Math.max(this.bounds.minE, target[0])),
      Math.min(this.bounds.maxN, Math.max(this.bounds.minN, target[1])),
    ];
    this.walkAfter = after ?? null;
    this.dirty = true;
  }

  // One frame of walking (keys, pad or a walk to a point).
  private stepWalk(dtS: number): boolean {
    if (this.walkTarget) {
      const { state, arrived } = stepToward(this.walk, this.walkTarget, dtS);
      this.walk = state;
      if (arrived) {
        this.walkTarget = null;
        const after = this.walkAfter;
        this.walkAfter = null;
        after?.();
      }
      return true;
    }
    if (!isMoving(this.walkInput)) return false;
    this.walk = walkStep(this.walk, this.walkInput, dtS, this.bounds);
    return true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.removeEventListener("pointermove", this.onPointerMove);
    this.renderer.domElement.removeEventListener("pointerup", this.onPointerUp);
    this.renderer.domElement.removeEventListener("click", this.onCanvasClick);
    this.renderer.domElement.removeEventListener("dblclick", this.onDoubleClick);
    this.controls.dispose();
    this.ringGeometry.dispose();
    this.ringMaterial.dispose();
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    });
    for (const texture of this.textures) texture.dispose();
    for (const el of this.labelEls.values()) el.remove();
    this.labelEls.clear();
    this.renderer.dispose();
    // As destroyViewer (lib/panorama/runtime.ts): free the context now, not
    // when the garbage collector gets to it.
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  // ---------------------------------------------------------------------------
  // Layers
  // ---------------------------------------------------------------------------

  private makeLayer(visit: SceneVisit): Layer {
    const { cloud } = visit;
    const material = new THREE.ShaderMaterial({
      vertexShader: POINT_VERTEX,
      fragmentShader: POINT_FRAGMENT,
      uniforms: {
        uOrigin: { value: new THREE.Vector3(...this.eye) },
        uReveal: { value: this.phase === "entering" ? 0 : 1e9 },
        uSize: { value: pointSize(cloud) },
        uScale: { value: this.scale },
        uSelected: { value: -1 },
        uWaveOn: { value: this.phase === "entering" ? 1 : 0 },
        uDim: { value: 1 },
      },
    });
    const points = new THREE.Points(new THREE.BufferGeometry(), material);
    points.frustumCulled = false;
    // Another visit's cloud sits at its own origin, seen from the first one's.
    const [dx, dy, dz] = sceneOf(
      ...originOffset(this.options.frame, this.frameHeightM, {
        lat: cloud.header.origin_lat,
        lon: cloud.header.origin_lon,
        heightM: cloud.header.origin_height_m,
      }),
    );
    points.position.set(dx, dy, dz);
    this.scene.add(points);
    const layer: Layer = {
      key: visit.key,
      cloud,
      points,
      material,
      treeIndex: new Map(),
      trees: visit.trees,
      drawn: cloud.count,
      skeleton: null,
    };
    this.fillLayer(layer, cloud);
    this.paint(layer);
    return layer;
  }

  // (Re)fills a layer's geometry from a cloud (the coarse one, then the whole).
  private fillLayer(layer: Layer, cloud: WorldCloud) {
    const positions = new Float32Array(cloud.count * 3);
    for (let i = 0; i < cloud.count; i++) {
      positions[i * 3] = cloud.enu[i * 3];
      positions[i * 3 + 1] = cloud.enu[i * 3 + 2];
      positions[i * 3 + 2] = -cloud.enu[i * 3 + 1];
    }
    const treeAttr = new Float32Array(cloud.count);
    for (let i = 0; i < cloud.count; i++)
      treeAttr[i] = cloud.tree[i] === NO_TREE ? -1 : cloud.tree[i];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(cloud.color.slice(), 3, true));
    geometry.setAttribute("aTree", new THREE.BufferAttribute(treeAttr, 1));
    layer.points.geometry.dispose();
    layer.points.geometry = geometry;
    layer.cloud = cloud;
    if (cloud.skeleton && !layer.skeleton) {
      layer.skeleton = buildSkeleton(cloud.skeleton);
      layer.skeleton.position.copy(layer.points.position);
      this.scene.add(layer.skeleton);
      this.showSkeletons();
    }
    layer.treeIndex = new Map([...cloud.treeIds].map(([index, id]) => [id, index]));
    if (this.selected) {
      layer.material.uniforms.uSelected.value = layer.treeIndex.get(this.selected) ?? -1;
    }
  }

  // The layer's colours in the current mode.
  private paint(layer: Layer) {
    const attr = layer.points.geometry.getAttribute("aColor") as THREE.BufferAttribute;
    const out = attr.array as Uint8Array;
    const photo = layer.cloud.color;
    if (this.mode === "photo") {
      out.set(photo);
      attr.needsUpdate = true;
      return;
    }
    const byId = new Map(layer.trees.map((t) => [t.id, t]));
    const colorOf: (number[] | null)[] = [];
    const value = (t: SceneTree | undefined): number | null =>
      (this.mode === "height"
        ? t?.heightM
        : this.mode === "diameter"
          ? t?.diameterM
          : t?.growthM) ?? null;
    if (this.mode === "sizeClass") {
      this.paintFlags(layer);
      return;
    }
    const values = layer.trees.map(value).filter((v): v is number => v !== null);
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 1;
    for (const [index, id] of layer.cloud.treeIds) {
      const v = value(byId.get(id));
      if (v === null) continue;
      const rgb =
        this.mode === "growth"
          ? divergingColor(v / changeSpan(values))
          : rampColor(max > min ? (v - min) / (max - min) : 0.5);
      colorOf[index] = rgb.map((c) => Math.round(c * 255));
    }
    const { tree } = layer.cloud;
    for (let i = 0; i < tree.length; i++) {
      const c = tree[i] === NO_TREE ? null : colorOf[tree[i]];
      if (c) {
        out[i * 3] = c[0];
        out[i * 3 + 1] = c[1];
        out[i * 3 + 2] = c[2];
      } else {
        // Ground and unmeasured trees: the photo colour, dimmed and greyed.
        const g = (photo[i * 3] + photo[i * 3 + 1] + photo[i * 3 + 2]) / 3;
        out[i * 3] = out[i * 3 + 1] = out[i * 3 + 2] = Math.round(g * 0.55);
      }
    }
    attr.needsUpdate = true;
  }

  // Size class mode: differing suggestions orange, matching ones green, the
  // rest (and the ground) greyed photo colours.
  private paintFlags(layer: Layer) {
    const attr = layer.points.geometry.getAttribute("aColor") as THREE.BufferAttribute;
    const out = attr.array as Uint8Array;
    const photo = layer.cloud.color;
    const flags = new Map(layer.trees.map((t) => [t.id, t.sizeFlag ?? null]));
    const colorOf: (readonly number[] | null)[] = [];
    for (const [index, id] of layer.cloud.treeIds) {
      const flag = flags.get(id);
      colorOf[index] = flag ? FLAG_COLORS[flag] : null;
    }
    const { tree } = layer.cloud;
    for (let i = 0; i < tree.length; i++) {
      const c = tree[i] === NO_TREE ? null : colorOf[tree[i]];
      if (c) {
        out[i * 3] = c[0];
        out[i * 3 + 1] = c[1];
        out[i * 3 + 2] = c[2];
      } else {
        const g = (photo[i * 3] + photo[i * 3 + 1] + photo[i * 3 + 2]) / 3;
        out[i * 3] = out[i * 3 + 1] = out[i * 3 + 2] = Math.round(g * 0.55);
      }
    }
    attr.needsUpdate = true;
  }

  private stepSwitch(now: number) {
    const s = this.switching!;
    const p = easeInOut(Math.min(1, (now - s.start) / SWITCH_MS));
    s.from.drawn = Math.round(s.from.cloud.count * (1 - p));
    s.to.drawn = Math.round(s.to.cloud.count * p);
    s.from.points.geometry.setDrawRange(0, s.from.drawn);
    s.to.points.geometry.setDrawRange(0, s.to.drawn);
    if (p >= 1) this.finishSwitch();
  }

  private finishSwitch() {
    const s = this.switching;
    if (!s) return;
    this.switching = null;
    if (s.from !== s.to) {
      s.from.drawn = 0;
      s.from.points.geometry.setDrawRange(0, 0);
      s.from.points.visible = false;
    }
    s.to.drawn = s.to.cloud.count;
    s.to.points.geometry.setDrawRange(0, s.to.drawn);
    this.showSkeletons();
  }

  // The skeleton of the visit on screen, once the world is open.
  private showSkeletons() {
    for (const layer of this.layers.values()) {
      const shown =
        this.skeletonOn && layer === this.layer && !!layer.skeleton && this.overlayOpacity > 0;
      if (layer.skeleton) layer.skeleton.visible = shown;
      // Behind the skeleton the points step back: dimmer and smaller.
      layer.material.uniforms.uDim.value = shown ? 0.45 : 1;
      layer.material.uniforms.uSize.value = pointSize(layer.cloud) * (shown ? 0.35 : 1);
    }
    this.dirty = true;
  }

  // ---------------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------------

  // Pose the exit starts from.
  private current: Pose | null = null;

  // No transition: reduced motion, or a world opened without a panorama.
  private get instant() {
    return this.options.reducedMotion || !!this.options.startOverview;
  }

  private readonly tick = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.tick);
    const now = performance.now();
    if (this.phase === "entering") {
      const ms = this.instant ? ENTER_MS : now - this.phaseStart;
      this.applyState(enterState(ms), this.start, this.overview, true);
      if (ms >= ENTER_MS) {
        this.phase = "world";
        for (const layer of this.layers.values()) {
          layer.material.uniforms.uWaveOn.value = 0;
          layer.material.uniforms.uReveal.value = 1e9;
        }
        this.controls.enabled = true;
        this.options.onEntered();
      }
    } else if (this.phase === "exiting") {
      const ms = now - this.phaseStart;
      this.applyState(exitState(ms), this.start, this.current ?? this.overview, false);
      if (ms >= EXIT_MS) {
        this.phase = "done";
        this.render();
        this.onExited?.();
        return;
      }
    } else if (this.phase === "world" || this.phase === "descending") {
      const dt = this.lastTick ? (now - this.lastTick) / 1000 : 0;
      if (this.switching) {
        this.stepSwitch(now);
        this.dirty = true;
      }
      if (this.flight) {
        const f = this.flight;
        const p = Math.min(1, (now - f.start) / f.ms);
        this.applyPose(lerpPose(f.from, f.to, easeInOut(p)));
        if (this.phase === "descending") this.setOverlay(1 - p);
        if (p >= 1) {
          // Flying down into a panorama ends the world.
          const landed = this.phase === "descending";
          this.flight = null;
          f.done();
          if (landed) {
            this.render();
            return;
          }
        }
        this.dirty = true;
      } else if (this.nav === "walk") {
        if (this.stepWalk(dt)) this.dirty = true;
        if (this.dirty) this.applyPose(this.walkPose());
      } else if (this.controls.update()) {
        this.dirty = true;
      }
      this.lastTick = now;
      if (!this.dirty) return;
    } else {
      return;
    }
    this.lastTick = now;
    this.render();
  };

  private render() {
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
    this.placeLabels();
  }

  // Entering, the photo gives way where the wave has passed; leaving, it
  // fades back in over the whole view.
  private applyState(state: TransitionState, from: Pose, to: Pose, dissolve: boolean) {
    const reveal = state.reveal * this.maxReveal;
    for (const layer of this.layers.values()) layer.material.uniforms.uReveal.value = reveal;
    this.photoMaterial.uniforms.uReveal.value = dissolve ? reveal : 0;
    this.photoMaterial.uniforms.uOpacity.value = state.photo;
    this.photo.visible = state.photo > 0;
    this.applyPose(lerpPose(from, to, state.rise));
    this.setOverlay(state.overlay);
  }

  private applyPose(pose: Pose) {
    this.camera.position.set(...pose.position);
    this.camera.lookAt(...pose.target);
    if (this.camera.fov !== pose.fovDeg) {
      this.camera.fov = pose.fovDeg;
      this.camera.updateProjectionMatrix();
      this.updateScale();
    }
  }

  private poseNow(): Pose {
    const p = this.camera.position;
    if (this.nav === "walk" || this.flight) {
      const d = this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(10).add(p);
      return { position: [p.x, p.y, p.z], target: [d.x, d.y, d.z], fovDeg: this.camera.fov };
    }
    const t = this.controls.target;
    return { position: [p.x, p.y, p.z], target: [t.x, t.y, t.z], fovDeg: this.camera.fov };
  }

  private setOverlay(opacity: number) {
    this.overlayOpacity = opacity;
    this.guideMaterial.opacity = 0.85 * opacity;
    this.dashedMaterial.opacity = 0.7 * opacity;
    this.guides.visible = opacity > 0;
    this.ringMaterial.opacity = 0.8 * opacity;
    this.selectedGroup.visible = opacity > 0;
    this.options.labels.style.opacity = String(opacity);
    this.options.labels.style.visibility = opacity > 0 ? "visible" : "hidden";
    const wasShown = this.layer.skeleton?.visible ?? false;
    if (wasShown !== (this.skeletonOn && !!this.layer.skeleton && opacity > 0)) {
      this.showSkeletons();
    }
  }

  private onResize() {
    const { clientWidth: w, clientHeight: h } = this.options.container;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.updateScale();
    this.dirty = true;
  }

  // Pixels per metre at unit distance, in drawing-buffer pixels.
  private updateScale() {
    if (!this.renderer) return;
    const height = this.renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    this.scale = height / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    for (const layer of this.layers.values()) layer.material.uniforms.uScale.value = this.scale;
  }

  private loadPhoto(url: string) {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      url,
      (texture) => {
        if (this.disposed) {
          texture.dispose();
          return;
        }
        // The shader works in image rows (row 0 = zenith) and writes the
        // photo's sRGB values as they are, like the points' colours.
        texture.flipY = false;
        texture.colorSpace = THREE.NoColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
        this.textures.push(texture);
        this.photoMaterial.uniforms.uPhoto.value = texture;
        this.photoMaterial.uniforms.uHasPhoto.value = 1;
        this.dirty = true;
      },
      undefined,
      // Without the photo the points still appear; the sphere stays dark.
      () => undefined,
    );
  }

  // ---------------------------------------------------------------------------
  // Measurements and labels
  // ---------------------------------------------------------------------------

  private groundOf(tree: SceneTree) {
    return groundAt(this.ground, tree.en[0], tree.en[1]);
  }

  // Height line with end ticks, crown-width ring at the bracket height and a
  // dashed ring at the crown base (as the crown guide on the photos).
  private guideLines(
    tree: SceneTree,
    solid: THREE.Material,
    dashed: THREE.Material,
    withDashes: boolean,
  ): THREE.Group {
    const group = new THREE.Group();
    const guide = tree.guide!;
    const g = this.groundOf(tree);
    const [x, , z] = sceneOf(tree.en[0], tree.en[1], 0);
    const r = guide.widthM / 2;
    const tick = 0.25;
    const line: number[] = [x, g, z, x, g + guide.topM, z];
    line.push(x - tick, g + guide.topM, z, x + tick, g + guide.topM, z);
    line.push(...ring(x, g + guide.bracketM, z, r));
    const solidGeometry = new THREE.BufferGeometry();
    solidGeometry.setAttribute("position", new THREE.Float32BufferAttribute(line, 3));
    group.add(new THREE.LineSegments(solidGeometry, solid));
    if (guide.baseM !== null) {
      const baseGeometry = new THREE.BufferGeometry();
      baseGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(ring(x, g + guide.baseM, z, r * 0.92), 3),
      );
      const base = new THREE.LineSegments(baseGeometry, withDashes ? dashed : solid);
      if (withDashes) base.computeLineDistances();
      group.add(base);
    }
    return group;
  }

  // The drawings, label places and label texts of the visit on screen.
  private buildGuides() {
    for (const child of [...this.guides.children]) {
      child.traverse((o) => (o as THREE.LineSegments).geometry?.dispose());
    }
    this.guides.clear();
    this.tops.clear();
    for (const tree of this.trees) {
      const g = this.groundOf(tree);
      const [x, , z] = sceneOf(tree.en[0], tree.en[1], 0);
      this.tops.set(
        tree.id,
        new THREE.Vector3(x, g + (tree.guide?.topM ?? DEFAULT_TOP_M) + 0.4, z),
      );
      if (tree.guide)
        this.guides.add(this.guideLines(tree, this.guideMaterial, this.dashedMaterial, true));
    }
    const ids = new Set(this.trees.map((t) => t.id));
    for (const [id, el] of this.labelEls) {
      if (!ids.has(id)) {
        el.remove();
        this.labelEls.delete(id);
      }
    }
    for (const tree of this.trees) {
      let el = this.labelEls.get(tree.id);
      if (!el) {
        el = document.createElement("button");
        el.type = "button";
        el.dataset.tree = tree.code;
        el.dataset.selected = "false";
        el.style.display = "none";
        el.addEventListener("click", () => this.options.onSelect(tree.id));
        this.options.labels.appendChild(el);
        this.labelEls.set(tree.id, el);
      }
      el.textContent = this.options.labelText(tree);
    }
  }

  // Where one stands (walking) or looks (the orbit's target), east/north.
  private focusEN(): [number, number] {
    if (this.nav === "walk") return [this.walk.e, this.walk.n];
    return [this.controls.target.x, -this.controls.target.z];
  }

  // Near (walking, or orbiting close to a tree) or far (from above): which
  // labels show and which trees a click can pick (lib/world/labels.ts).
  private scope(): LabelScope {
    return labelScope(this.nav, this.camera.position.distanceTo(this.controls.target));
  }

  // Every tree on screen: its label anchor (the top), its silhouette from
  // the ground to the top and as wide as its crown, its camera distance and
  // its distance from where one stands or looks.
  private treesOnScreen(w: number, h: number): TreeOnScreen[] {
    const byId = new Map(this.trees.map((t) => [t.id, t]));
    const camera = this.camera.position;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const [fe, fn] = this.focusEN();
    const v = new THREE.Vector3();
    const px = (p: THREE.Vector3) => {
      v.copy(p).project(this.camera);
      return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, nx: v.x, ny: v.y, z: v.z };
    };
    const onScreen = (p: { nx: number; ny: number; z: number }) =>
      p.z > -1 && p.z < 1 && Math.abs(p.nx) < 1.05 && Math.abs(p.ny) < 1.05;
    const out: TreeOnScreen[] = [];
    for (const [id, top] of this.tops) {
      const tree = byId.get(id);
      if (!tree) continue;
      const g = this.groundOf(tree);
      const crown = tree.guide ? tree.guide.widthM / 2 : DEFAULT_CROWN_RADIUS_M;
      const mid = new THREE.Vector3(top.x, (top.y + g) / 2, top.z);
      const a = px(top);
      const b = px(new THREE.Vector3(top.x, g, top.z));
      const m = px(mid);
      const side = px(mid.clone().addScaledVector(right, crown));
      const half = Math.max(10, Math.abs(side.x - m.x));
      const box = {
        left: m.x - half,
        right: m.x + half,
        top: Math.min(a.y, b.y),
        bottom: Math.max(a.y, b.y),
      };
      const inFront = m.z > -1 && m.z < 1;
      out.push({
        id,
        x: a.x,
        y: a.y,
        depth: camera.distanceTo(mid),
        focusDistM: Math.hypot(top.x - fe, -top.z - fn),
        inView: onScreen(a),
        boxInView: inFront && box.right > 0 && box.left < w && box.bottom > 0 && box.top < h,
        box,
      });
    }
    return out;
  }

  private placeLabels() {
    if (this.overlayOpacity <= 0) return;
    const w = this.options.container.clientWidth;
    const h = this.options.container.clientHeight;
    const scope = this.scope();
    const trees = this.treesOnScreen(w, h);
    const shown = chooseLabels(trees, scope, this.selected);
    const rank = new Map(shown.map((id, i) => [id, i]));
    const byId = new Map(trees.map((t) => [t.id, t]));
    this.options.labels.dataset.scope = scope.kind;
    for (const [id, el] of this.labelEls) {
      const i = rank.get(id);
      const t = byId.get(id);
      if (i === undefined || !t) {
        el.style.display = "none";
        continue;
      }
      el.style.display = "";
      el.style.transform = `translate(-50%, -100%) translate(${t.x}px, ${t.y}px)`;
      el.style.zIndex = String(1000 - i);
    }
  }

  private down: { x: number; y: number } | null = null;

  private readonly onPointerDown = (event: PointerEvent) => {
    this.down = { x: event.clientX, y: event.clientY };
    this.dragFrom = { x: event.clientX, y: event.clientY };
    if (this.nav === "walk" && this.phase === "world") {
      this.renderer.domElement.setPointerCapture?.(event.pointerId);
    }
  };

  private dragFrom: { x: number; y: number } | null = null;

  // Walking: dragging looks around.
  private readonly onPointerMove = (event: PointerEvent) => {
    if (this.nav !== "walk" || this.phase !== "world" || this.flight || !this.dragFrom) return;
    if (event.buttons === 0) {
      this.dragFrom = null;
      return;
    }
    const dx = event.clientX - this.dragFrom.x;
    const dy = event.clientY - this.dragFrom.y;
    this.dragFrom = { x: event.clientX, y: event.clientY };
    const height = this.options.container.clientHeight;
    this.walk = look(this.walk, dx, dy, height, this.camera.fov);
    this.dirty = true;
  };

  private readonly onPointerUp = () => {
    this.dragFrom = null;
  };

  // A click (not the end of a drag) picks what is in front: the front-most
  // tree whose silhouette it falls in, or a viewpoint ring nearer to the
  // camera than that tree. Walking or close to a tree, only what is around
  // can be picked (lib/world/labels.ts).
  private readonly onCanvasClick = (event: MouseEvent) => {
    if (this.phase !== "world" || this.flight) return;
    const down = this.down;
    if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const scope = this.scope();
    const tree = pickTree(this.treesOnScreen(rect.width, rect.height), x, y, scope);
    if (this.options.onViewpoint && this.viewpoints.length > 0) {
      const v = new THREE.Vector3();
      const [fe, fn] = this.focusEN();
      const rings: { id: string; x: number; y: number; depth: number }[] = [];
      for (const vp of this.viewpoints) {
        if (scope.kind === "near" && Math.hypot(vp.en[0] - fe, vp.en[1] - fn) > scope.radiusM) {
          continue;
        }
        const [vx, , vz] = sceneOf(vp.en[0], vp.en[1], 0);
        v.set(vx, groundAt(this.ground, vp.en[0], vp.en[1]), vz);
        const depth = v.distanceTo(this.camera.position);
        v.project(this.camera);
        if (v.z < -1 || v.z > 1) continue;
        rings.push({
          id: vp.id,
          x: ((v.x + 1) / 2) * rect.width,
          y: ((1 - v.y) / 2) * rect.height,
          depth,
        });
      }
      const ring = pickNearest(rings, x, y, VIEWPOINT_PICK_PX);
      if (ring && (!tree || ring.depth < tree.depth)) {
        this.options.onViewpoint(ring.id);
        return;
      }
    }
    this.options.onSelect(tree?.id ?? null);
  };

  // A double click on the ground walks there (from the overview: one walks in
  // at that point).
  private readonly onDoubleClick = (event: MouseEvent) => {
    if (this.phase !== "world" || this.flight) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    const hit = rayToGround([o.x, -o.z, o.y], [d.x, -d.z, d.y], (e, n) =>
      groundAt(this.ground, e, n),
    );
    if (!hit) return;
    if (this.nav === "walk") {
      this.walkTo(hit);
      return;
    }
    // Into the walk at the clicked point, facing away from the camera.
    const target = this.controls.target;
    target.set(hit[0], groundAt(this.ground, hit[0], hit[1]), -hit[1]);
    const back = this.camera.position.clone().sub(target);
    const len = Math.hypot(back.x, back.z) || 1;
    target.x += (-back.x / len) * WALK_IN_MARGIN_M;
    target.z += (-back.z / len) * WALK_IN_MARGIN_M;
    this.setNavigation("walk", () => this.options.onNavigation?.("walk"));
  };
}

const WOOD = 0xd8c7a6;
const PRUNED = 0xe2483a;
const CUT = 0xff2d1f;
// Thinnest tube drawn (the thinnest twigs would vanish at parcel scale).
const MIN_TUBE_M = 0.012;
// Smallest cut marker: a ball big enough to find from the overview.
const CUT_MIN_M = 0.09;

// The winter skeleton as instanced tubes (standing wood, pruned wood) and the
// cuts as small red balls, in scene axes.
function buildSkeleton(sk: WorldSkeleton): THREE.Group {
  const group = new THREE.Group();
  group.visible = false;
  const tube = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  const up = new THREE.Vector3(0, 1, 0);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  for (const kind of [0, SEGMENT_PRUNED]) {
    const ids: number[] = [];
    for (let i = 0; i < sk.segmentCount; i++)
      if ((sk.kind[i] === SEGMENT_PRUNED) === (kind === SEGMENT_PRUNED)) ids.push(i);
    if (ids.length === 0) continue;
    const material = new THREE.MeshLambertMaterial({
      color: kind === SEGMENT_PRUNED ? PRUNED : WOOD,
      emissive: kind === SEGMENT_PRUNED ? 0x5a0d08 : 0x1c160e,
    });
    const mesh = new THREE.InstancedMesh(tube, material, ids.length);
    ids.forEach((i, n) => {
      a.set(...sceneOf(sk.a[i * 3], sk.a[i * 3 + 1], sk.a[i * 3 + 2]));
      b.set(...sceneOf(sk.b[i * 3], sk.b[i * 3 + 1], sk.b[i * 3 + 2]));
      dir.subVectors(b, a);
      const length = dir.length();
      if (length > 0) q.setFromUnitVectors(up, dir.divideScalar(length));
      const r = Math.max(sk.radius[i], MIN_TUBE_M);
      scale.set(r, Math.max(length, 1e-4), r);
      m.compose(a.add(b).multiplyScalar(0.5), q, scale);
      mesh.setMatrixAt(n, m);
    });
    mesh.frustumCulled = false;
    mesh.userData.kind = kind;
    group.add(mesh);
  }
  if (sk.cutCount > 0) {
    const ball = new THREE.SphereGeometry(1, 10, 8);
    const mesh = new THREE.InstancedMesh(
      ball,
      new THREE.MeshBasicMaterial({ color: CUT }),
      sk.cutCount,
    );
    for (let i = 0; i < sk.cutCount; i++) {
      a.set(
        ...sceneOf(sk.cutPosition[i * 3], sk.cutPosition[i * 3 + 1], sk.cutPosition[i * 3 + 2]),
      );
      const r = Math.max(sk.cutDiameter[i] * 0.8, CUT_MIN_M);
      m.compose(a, q.identity(), scale.set(r, r, r));
      mesh.setMatrixAt(i, m);
    }
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return group;
}

// Point size in metres: covers the gaps between neighbouring points.
function pointSize(cloud: WorldCloud): number {
  return Math.max(0.02, cloud.header.voxel_m || 0.04) * POINT_VOXELS;
}

// A horizontal circle as line segments.
function ring(x: number, y: number, z: number, r: number, segments = 48): number[] {
  const out: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    out.push(
      x + r * Math.cos(a0),
      y,
      z + r * Math.sin(a0),
      x + r * Math.cos(a1),
      y,
      z + r * Math.sin(a1),
    );
  }
  return out;
}
