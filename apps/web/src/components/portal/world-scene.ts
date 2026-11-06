import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CrownGuide } from "@/lib/portal/crown-guide";
import { NO_TREE, type WorldCloud } from "@/lib/world/format";
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

export type ColorMode = "photo" | "height" | "diameter" | "growth";

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
}

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
  labelText: (tree: SceneTree) => string;
  onSelect: (treeId: string | null) => void;
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
}

const SWITCH_MS = 1400;

// Depth panorama resolution (a coarse grid is enough for the dissolve).
const DEPTH_W = 512;
const DEPTH_H = 256;
// Width of the bright front of the wave, metres.
const WAVE_M = 3;
// Point size in voxels: covers the gaps between neighbouring points.
const POINT_VOXELS = 1.8;
// Labels drawn at once (nearest to the camera).
const MAX_LABELS = 20;
// Height the label stands at when the tree has no measured height.
const DEFAULT_TOP_M = 4;
const NO_DEPTH = 1e6;
const BACKGROUND = 0x0d1b24;
const GUIDE = 0xffffff;
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
  varying vec3 vColor;
  varying float vWave;
  varying float vKeep;
  void main() {
    if (vKeep < 0.5) discard;
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;
    vec3 color = mix(vColor, vec3(0.55, 0.95, 1.0), vWave * uWaveOn * 0.85);
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
  private switching: { from: Layer; to: Layer; start: number } | null = null;
  private frame = 0;
  private phase: "entering" | "world" | "exiting" | "done" = "entering";
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
    this.renderer.domElement.addEventListener("click", this.onCanvasClick);
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

  // Flies the camera over a tree and keeps orbiting around it.
  flyTo(treeId: string) {
    const top = this.tops.get(treeId);
    if (!top) return;
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
    if (this.phase === "exiting" || this.phase === "done") return;
    this.onExited = done;
    this.controls.enabled = false;
    if (this.switching) this.finishSwitch();
    // Fly back from wherever the visitor orbited to.
    this.current = this.poseNow();
    this.phase = "exiting";
    this.phaseStart = performance.now();
    if (this.options.reducedMotion) this.phaseStart -= EXIT_MS;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.removeEventListener("click", this.onCanvasClick);
    this.controls.dispose();
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
        uSize: { value: Math.max(0.02, cloud.header.voxel_m || 0.04) * POINT_VOXELS },
        uScale: { value: this.scale },
        uSelected: { value: -1 },
        uWaveOn: { value: this.phase === "entering" ? 1 : 0 },
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
    const value = (t: SceneTree | undefined) =>
      (this.mode === "height"
        ? t?.heightM
        : this.mode === "diameter"
          ? t?.diameterM
          : t?.growthM) ?? null;
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
    this.dirty = true;
  }

  // ---------------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------------

  // Pose the exit starts from.
  private current: Pose | null = null;

  private readonly tick = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.tick);
    const now = performance.now();
    if (this.phase === "entering") {
      const ms = this.options.reducedMotion ? ENTER_MS : now - this.phaseStart;
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
    } else if (this.phase === "world") {
      if (this.switching) {
        this.stepSwitch(now);
        this.dirty = true;
      }
      if (this.controls.update()) this.dirty = true;
      if (!this.dirty) return;
    } else {
      return;
    }
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
    const t = this.controls.target;
    return { position: [p.x, p.y, p.z], target: [t.x, t.y, t.z], fovDeg: this.camera.fov };
  }

  private setOverlay(opacity: number) {
    this.overlayOpacity = opacity;
    this.guideMaterial.opacity = 0.85 * opacity;
    this.dashedMaterial.opacity = 0.7 * opacity;
    this.guides.visible = opacity > 0;
    this.selectedGroup.visible = opacity > 0;
    this.options.labels.style.opacity = String(opacity);
    this.options.labels.style.visibility = opacity > 0 ? "visible" : "hidden";
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

  private placeLabels() {
    if (this.overlayOpacity <= 0) return;
    const w = this.options.container.clientWidth;
    const h = this.options.container.clientHeight;
    const camPos = this.camera.position;
    const shown = [...this.tops.entries()]
      .map(([id, top]) => ({ id, top, d: top.distanceTo(camPos) }))
      .sort((a, b) => a.d - b.d);
    const v = new THREE.Vector3();
    let count = 0;
    for (const { id, top } of shown) {
      const el = this.labelEls.get(id);
      if (!el) continue;
      v.copy(top).project(this.camera);
      const visible =
        (count < MAX_LABELS || id === this.selected) &&
        v.z > -1 &&
        v.z < 1 &&
        Math.abs(v.x) < 1.05 &&
        Math.abs(v.y) < 1.05;
      if (!visible) {
        el.style.display = "none";
        continue;
      }
      count++;
      el.style.display = "";
      el.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
      el.style.zIndex = String(1000 - count);
    }
  }

  private down: { x: number; y: number } | null = null;

  private readonly onPointerDown = (event: PointerEvent) => {
    this.down = { x: event.clientX, y: event.clientY };
  };

  // A click (not the end of a drag) picks the tree nearest to it on screen.
  private readonly onCanvasClick = (event: MouseEvent) => {
    if (this.phase !== "world") return;
    const down = this.down;
    if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const v = new THREE.Vector3();
    const byId = new Map(this.trees.map((t) => [t.id, t]));
    const items: { id: string; x: number; y: number }[] = [];
    for (const [id, top] of this.tops) {
      const tree = byId.get(id);
      if (!tree) continue;
      // The middle of the tree: halfway between the ground and the top.
      v.copy(top);
      v.y -= (top.y - this.groundOf(tree)) / 2;
      v.project(this.camera);
      if (v.z < -1 || v.z > 1) continue;
      items.push({ id, x: ((v.x + 1) / 2) * rect.width, y: ((1 - v.y) / 2) * rect.height });
    }
    const hit = pickNearest(items, x, y, 48);
    this.options.onSelect(hit?.id ?? null);
  };
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
