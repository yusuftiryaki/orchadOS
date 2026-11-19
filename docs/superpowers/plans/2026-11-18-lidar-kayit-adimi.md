# LiDAR kayıt adımı (registration) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A versioned pipeline stage that turns a kit session's raw LiDAR MCAP + GNSS into `cloud.ply`/`cloud.json` plus a quality report, gated in the database (auto accept / ops review / auto reject) before LiDAR measurements and the 3D world reach parcel readers.

**Architecture:** Python stage in `services/pipeline` (segments → swappable LIO front end in its own container → GTSAM-style pose graph with the PPK trajectory → ENU cloud → quality metrics and verdict). A new `public.lidar_registration` table and gate in Supabase; a review band in the staff 3D world. Front end #1 is Point-LIO (ROS 2 Humble image, GPL, separate container); tests use a fake front end on a synthetic moving scan.

**Tech Stack:** Python 3.12, uv, numpy, `mcap` + `mcap-ros2-support`, `gtsam` (fallback: scipy sparse least squares), pytest; Postgres/Supabase migrations + pgTAP; Next.js (apps/web); Docker (ROS 2 Humble) for Point-LIO.

**Spec:** `docs/superpowers/specs/2026-11-18-lidar-kayit-adimi-design.md` (Turkish). Executors read both.

## Global Constraints

- Docs Turkish; code, identifiers, comments, commits English. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Contracts change in docs first: `docs/arayuzler.md` (files), `docs/veri-modeli.md` (schema).
- No field data in the repo; tests synthetic. No secrets.
- Measurements versioned; re-processing never deletes old results; each register run has its own `run_id` (uuid) and folder `<session>.processed/lidar/registration/<method>-<method_version>-<params_hash[:8]>-<run_id[:8]>/` (spec §5.11).
- Decisions of spec §5.11 apply: one current `accepted` registration per session (older accepted → `superseded`); trunk consistency from trunk candidates detected in the cloud (no inventory needed); without inventory `lidar process` skips crown; `--reuse-registration`; clock not `pps` or no `recording.json` → at most `review` (`clock_unlocked`, `no_recording_json`); null `registration_id` rows keep today's visibility, `lidar upload` refuses unregistered measurements unless `--allow-unregistered`.
- New migration timestamps after `20261107500100`; new table calls `select private.attach_demo_guard('lidar_registration')`.
- Parcel readers (owner, shareholder, viewer, demo) never see LiDAR measurements or `world_cloud` of a registration that is not `accepted`; rows with no registration (legacy/synthetic, `registration_id` null) keep today's visibility.
- GPL code (Point-LIO) only inside its own Docker image, called as a process; never imported.
- Thresholds (spec §5.7, start values, all parameters): reject if `lio_coverage < 0.5` or (PPK) `gnss_residual_p95_m > 1.0` or `trunk_spread_p95_m > 0.5` or no segment ran; accept only if PPK and `gnss_residual_p95_m <= 0.15` and `trunk_spread_p95_m <= 0.15` with `trees_checked >= 10` and `lio_coverage >= 0.9`; otherwise `review`. Without PPK never `accepted_auto`.
- Segments: split at LiDAR gaps > 2 s and at each `bag.N/`; drop segments < 20 s. Restamp when |header.stamp − log_time| > 50 ms or slope deviates > 1e-4. Skip segment with `imu_rate_low` when IMU rate < 0.5 × `expected_imu_hz` (parameter).
- Self-mask: drop points < 0.4 m from the LiDAR and in the zenith cone (parameter). Voxel dedupe 0.01 m.
- `registration_method`: `point_lio+gtsam_ppk` / `point_lio+gtsam_navpvt` (fake front end: `fake+gtsam_ppk` etc.).

## Review Focus

1. A session with **no `lidar/raw`** or an **empty MCAP**: `lidar process` skips LiDAR cleanly (exit 0, message), the visit is not blocked. → Task 6 test `test_process_without_lidar_is_noop`.
2. **Trajectory gaps / no GNSS fix during part of the scan** (keyframes outside trajectory): those keyframes get no GNSS factor, not an interpolated wrong one. → Task 4 test `test_keyframes_outside_trajectory_have_no_gnss_factor`.
3. **Re-running** register on the same input with same params writes a new run folder and never touches another run's folder; uploading the same run twice is idempotent; accepting a newer run supersedes the older accepted one. → Task 5 `test_register_twice_new_run`, Task 7 `test_upload_registration_idempotent`, Task 6 pgTAP `accept_supersedes_previous`.
4. **Decision race / double decision**: deciding a non-pending registration fails with a clear error. → Task 8 pgTAP.
5. **Measurements uploaded before ops decides become visible on accept without re-run**, and stay hidden on reject. → Task 8 pgTAP `accept_reveals_measurements`, `reject_keeps_hidden`.

---

### Task 1: Kit — L2 driver patches and bench checks

**Files:** Modify `services/kit-recorder/setup/install.sh` (build_unilidar), `services/kit-recorder/README.md` (L2 sürücüsü), `services/kit-recorder/tests/test_setup_files.py`, `docs/superpowers/plans/2026-11-16-pi-kayit-yazilimi.md` (Task 17 steps).

- [x] Test: `test_unilidar_patches_applied` — install.sh applies a patch file (`setup/patches/unilidar_sdk2-*.patch`, listed and existing) before `colcon build`, idempotently (`git apply --check` / reverse check).
- [x] Patches: (a) unilidar_sdk2 PR #33 — ROS 2 node reads the IMU packet once (no second `getImuData()` swallowing it); (b) #14 — ROS 2 IMU quaternion order consistent with the ROS 1 driver (w,x,y,z source → `orientation.{x,y,z,w}` correctly). Pin the upstream commit the patches apply to.
- [x] README + plan Task 17: bench checks `ros2 topic hz /unilidar/imu` (expected rate written down after measurement) and accelerations with the L2 on its side (#9).
- [x] `uv run pytest -q`, `bash -n`, shellcheck clean. Commit `kit-recorder: patch the L2 ROS 2 driver's IMU bugs`.

### Task 2: Contracts in docs

**Files:** `docs/arayuzler.md` ("Kayıtlı nokta bulutu"), `docs/veri-modeli.md`, `docs/lidar-olcumleri.md` (§1, §2), `docs/3d-dunya.md` (§9.4), `docs/plan.md` (progress row).

- [ ] arayuzler: registration output folder; `--cloud` resolution order (spec §5.10); `registration.json` schema `orchados.lidar_registration/1` (spec §5.7 fields); front-end output `orchados.lio_frontend/1` (spec §5.3) as an internal contract; `registration_method` values.
- [ ] veri-modeli: `lidar_registration` (spec §5.8 columns, states, rules) and the reader gate; `world_cloud.pose.registration_id`.
- [ ] lidar-olcumleri §1 status row "Ham MCAP'ten kayıtlı buluta" → in progress with link to spec; 3d-dunya §9.4 review band; plan.md row.
- [ ] Commit `Docs: LiDAR registration contracts and gate`.

### Task 3: Synthetic moving scan

**Files:** Create `services/pipeline/src/orchados_pipeline/lidar/synth_moving.py`; modify `lidar/cli.py` (`lidar synth --moving`), `pyproject.toml` (+`mcap`, `mcap-ros2-support`); test `tests/lidar/test_synth_moving.py`.

**Interfaces:** Produces `make_moving_session(dest: Path, cfg: MovingConfig | None = None) -> MovingTruth`; `MovingConfig(rows=3, trees_per_row=6, row_spacing_m=7.0, tree_spacing_m=6.0, speed_mps=1.5, duration_s=None, seed=0, gap=None | tuple[float, float], second_bag_at_s=None, stamp_offset_s=0.0, imu_hz=250.0, ppk=True)`; `MovingTruth(poses: np.ndarray (N×8: gps_time_ns,x,y,z,qx,qy,qz,qw in ENU of origin), origin_lat, origin_lon, origin_height_m, lever_arm_m, trees: list[(tree_id, e, n)])` written as `<dest>/truth.json`.

- [ ] Test: session folder has `session.json`, `gnss/gnss.ubx` (NAV-PVT 5 Hz along antenna path = pose ⊕ lever arm), `gnss/session.json`, `lidar/raw/bag/bag_0.mcap` with topics `/unilidar/cloud` (sensor_msgs/msg/PointCloud2, fields x,y,z,intensity float32, ring uint16, time float32 relative s) and `/unilidar/imu` (sensor_msgs/msg/Imu) at `imu_hz`, `lidar/raw/recording.json` (`orchados.lidar_recording/1`, gaps when `gap` set, second segment dir `bag.1/` when `second_bag_at_s`), `trees.json`; messages decode with `mcap_ros2.reader`; ~64 000 points/s; log_time = header.stamp + `stamp_offset_s`.
- [ ] Implement: lawn-mower path along rows (turns at row ends), trees as trunk cylinders + ellipsoid crowns + ground plane, rays from LiDAR at 10 Hz messages over the upper hemisphere (−6°..90°), IMU = analytic derivatives of the path + noise. Keep under ~5 s for the default CI config (short: 2 rows, 60 s).
- [ ] CLI `lidar synth --moving <dir> [--gap A,B] [--second-bag S] [--no-ppk]`. Commit `pipeline: synthetic moving LiDAR scan`.

### Task 4: Segments, stamps, front-end interface, fake front end, fusion

**Files:** Create `lidar/rawlog.py`, `lidar/frontend/__init__.py`, `lidar/frontend/fake.py`, `lidar/fusion.py`; tests `tests/lidar/test_rawlog.py`, `test_frontend.py`, `test_fusion.py`. `pyproject.toml` (+`gtsam` if a cp312 wheel installs with uv; otherwise implement the same graph with `scipy.optimize.least_squares` on a sparse Jacobian and add `scipy`).

**Interfaces:**
- `rawlog.plan_segments(session_dir: Path, params: RegistrationParams) -> list[Segment]`; `Segment(index:int, bag_dirs:list[Path], start_gps_ns:int, end_gps_ns:int, needs_restamp:bool, imu_rate_hz:float, skip_reason:str|None)`.
- `rawlog.write_restamped(segment: Segment, out: Path) -> Path` (MCAP with header.stamp := log_time for both topics, only the segment's window).
- `frontend.Keyframe(segment:int, index:int, gps_time_ns:int, t:np.ndarray(3), q:np.ndarray(4 xyzw), scan:Path)`; `FrontendResult(method:str, method_version:str, config_hash:str, segments:list[dict], keyframes:list[Keyframe], imu_rate_hz:float, points_total:int)`; `Frontend` protocol `run(session_dir: Path, segments: list[Segment], work_dir: Path) -> FrontendResult`; `get_frontend(name: str) -> Frontend` (`fake`, `point_lio`); `write_frontend_output(work_dir, result)` / `read_frontend_output(work_dir) -> FrontendResult` (spec §5.3 files: `frontend.json`, `keyframes.csv`, `scans/<segment>_<index>.npz` with `xyz`, `intensity`).
- `fake.FakeFrontend(drift_m_per_100m=0.0, yaw_drift_deg_per_100m=0.0, noise_m=0.0, swap_tree_at=None)`: reads `truth.json`, keyframes by spec spacing (0.5 m / 10° / 1 s), scans = the segment's MCAP points around the keyframe time transformed into the true body frame, then the reported pose gets the configured drift/noise in the segment's own odom frame (origin = first keyframe).
- `fusion.fuse(keyframes: list[Keyframe], trajectory: Trajectory, frame: LocalFrame, params: RegistrationParams) -> FusionResult`; `FusionResult(poses_enu: dict[(segment,index), (t:np.ndarray, q:np.ndarray)], residuals: list[(gps_time_ns, quality, residual_m)], used_gnss:int)`.

- [ ] Tests rawlog: gaps > 2 s and `bag.1/` split segments; < 20 s dropped with reason; `stamp_offset_s=0.2` → `needs_restamp`; low IMU rate → `skip_reason="imu_rate_low"`; empty/missing raw → `[]`.
- [ ] Tests frontend: write/read round trip; fake with zero drift reproduces truth poses within 1e-6.
- [ ] Tests fusion: fake drift 2 m/100 m + PPK fix trajectory → fused positions within 0.05 m of truth; `test_keyframes_outside_trajectory_have_no_gnss_factor`; NAV-PVT trajectory (sd ~1.5 m) still runs; Huber limits a single 5 m outlier fix to < 0.1 m effect; two segments tied only by GNSS.
- [ ] Implement. Between-factor sigmas: `between_sigma_m_per_m`, `between_sigma_deg_per_m` (params); GNSS sigma = max(trajectory sd, floor per quality: fix 0.02, float 0.3, other 2.0 m — params); lever arm param `lever_arm_m: [x,y,z]` in LiDAR body frame (default from truth/synthetic kit: `[0,0,0.5]`).
- [ ] pytest + ruff. Commit(s) `pipeline: LiDAR segments, front-end interface and fake`, `pipeline: pose-graph fusion with the GNSS trajectory`.

### Task 5: Cloud, quality metrics, verdict, register and process commands

**Files:** Create `lidar/registration.py`; modify `lidar/models.py` (+`RegistrationReport`, `RegistrationParams`), `lidar/cli.py` (`register`, `process`, `--cloud` on measuring commands), `lidar/cloud.py` (`resolve_cloud`); tests `tests/lidar/test_registration.py`, `test_cli_registration.py`.

**Interfaces:**
- `RegistrationParams` (pydantic, all spec values incl. thresholds, segment rules, self-mask, voxel, sigmas, lever arm, `expected_imu_hz`, `frontend`).
- `registration.run(session_dir: Path, out_root: Path | None = None, params: RegistrationParams | None = None, frontend: Frontend | None = None) -> tuple[Path, RegistrationReport]` — returns the version folder with `cloud.ply`, `cloud.json`, `registration.json`, `frontend/`.
- `registration.trunk_candidates(points_xyz: np.ndarray, params) -> np.ndarray (K×2 ENU)` (0.5–1.5 m above local ground, 0.3 m cells, vertical thin clusters); `registration.trunk_spread(scans_by_time, sensor_track, candidates, params) -> (p95_m | None, trees_checked)` (passes = continuous time with sensor < 10 m from the trunk).
- `registration.decide(metrics: dict, ppk: bool, params) -> tuple[str, list[str]]` reasons codes: `low_coverage`, `gnss_residual_high`, `trunk_spread_high`, `no_segments`, `no_ppk`, `few_trees_checked`, `imu_rate_low`, `restamped`.
- `cloud.resolve_cloud(session_dir: Path, cloud_dir: Path | None = None) -> Path` (folder holding cloud.ply+cloud.json; order: explicit → `<session>/lidar/` → newest non-`rejected_auto` registration folder).
- CLI `lidar register <session> [--frontend fake|point_lio] [--out] [--params]` prints the verdict line; `lidar process <session> [--frontend] [--upload] [--trees]` = register → if not `rejected_auto`: crown, world → if `--upload`: upload (Task 7).

- [ ] Tests: zero-drift fake + PPK → `accepted_auto`, cloud trunks within 0.05 m of truth trees; drift without enough GNSS / `swap_tree_at` (double trunk) → `review` or `rejected_auto` with matching reasons; `--no-ppk` → never `accepted_auto`, reason `no_ppk`; self-mask removes pole points; `cloud.json` fields per contract and readable by `load_session_cloud` via `resolve_cloud`; `test_register_twice_new_run`; `test_process_without_lidar_is_noop`; `test_process_without_inventory_skips_crown`; `--reuse-registration` runs crown on the newest non-rejected run without a new run; unlocked clock / missing recording.json → at most `review` with reason; `lidar crown --cloud <folder>` works; existing lidar tests unchanged.
- [ ] Implement; cloud written in chunks (no full in-memory copy beyond one segment). Commit `pipeline: lidar register and process`.

### Task 6: Database gate

**Files:** Create `supabase/migrations/20261118100000_lidar_registration.sql`, `supabase/tests/<next>_lidar_registration_test.sql`; regenerate `apps/web/src/lib/database.types.ts` (`pnpm web:typegen`).

**Interfaces:** `public.lidar_registration` (spec §5.8 + §5.11: `run_id uuid unique`, status adds `superseded`); `public.record_lidar_registration(p_session_id uuid, p_payload jsonb) returns uuid` (payload = registration.json subset: method, method_version, params_hash, ppk_status, metrics, verdict, reasons; idempotent on the unique key; ops only); `public.decide_lidar_registration(p_id uuid, p_accept boolean, p_note text) returns public.lidar_registration` (ops only, pending only, note required on reject); `record_lidar_measurements` payload accepts optional `registration_id uuid` (must belong to the same session; refused if that registration is `rejected`); world_cloud `pose.registration_id`.

- [ ] `record_lidar_measurements` dedup key includes `registration_id`; owners see only measurements/world_cloud of the session's current accepted registration (or null-registration rows).
- [ ] pgTAP: `accept_supersedes_previous`; ops records and decides; non-ops cannot; second decision fails; owner/shareholder/viewer/demo cannot read LiDAR measurements or world_cloud of pending/rejected registration (`accept_reveals_measurements`, `reject_keeps_hidden`); null registration keeps current behaviour (existing tests pass); staff read all; demo guard attached.
- [ ] `pnpm db:reset && pnpm db:test` all pass; `scripts/check-migration-order.sh` passes. Commit `db: lidar registration and reader gate`.

### Task 7: Upload

**Files:** Modify `lidar/upload.py`; tests `tests/lidar/test_upload.py` (+ local-Supabase integration test, skipped when unreachable).

**Interfaces:** Consumes Task 5 version folder and Task 6 RPCs. `lidar upload <out_dir> --session-id <uuid> [--registration <version folder>]` records the registration first, then measurements and world_cloud with `registration_id`; skips measurements of a `rejected_auto` registration; refuses measurements without a registration unless `--allow-unregistered` (demo loader updated to pass it).

- [ ] Tests: payload contains `registration_id`; `test_upload_registration_idempotent`; rejected → no measurements; `--dry-run` prints all three payloads. Commit `pipeline: upload the registration with its measurements`.

### Task 8: Staff review UI

**Files:** `apps/web/src/components/staff/staff-world.tsx` (+ a small `registration-band.tsx`), a server action next to the staff world, the ops dashboard list (find the ops pano page under `apps/web/src/app/`), tests alongside.

- [x] Band per spec §5.9 for `pending_review` / `rejected` / `accepted`; buttons only for the ops role; reject needs a note; after a decision the band updates. Ops list "İncelemede bekleyen LiDAR kayıtları" linking to the staff world.
- [x] Unit + integration tests (`pnpm web:test`), `pnpm web:lint`. Commit `web: LiDAR registration review in the staff world`.

### Task 9: Point-LIO front-end image and runner

**Files:** Create `deploy/lidar-frontends/point-lio/{Dockerfile, entrypoint.sh, keyframe_recorder.py, config/unilidar_l2.yaml, README.md, smoke.sh}`; `services/pipeline/src/orchados_pipeline/lidar/frontend/point_lio.py`; test `tests/lidar/test_frontend_point_lio.py`.

**Interfaces:** Image reads `/in/segments.json` (list of {index, mcap paths, start/end ns}) and writes `/out/` in the `orchados.lio_frontend/1` layout; `PointLioFrontend(image: str = env ORCHADOS_POINT_LIO_IMAGE or "orchados-lio-point-lio:local", rate: float = 1.0, docker: str = "docker")` builds and runs `docker run --rm -v <session>:/in/session:ro -v <work>:/out <image>`.

- [ ] Dockerfile: `ros:humble-ros-base`, build `dfloreaa/point_lio_ros2` at a pinned commit with the L2 config (lidar type/topics `/unilidar/cloud`, `/unilidar/imu`, Unitree's L2 extrinsics); `keyframe_recorder.py` (rclpy) subscribes odometry and the body-frame scan topic and writes keyframes per spec spacing; `entrypoint.sh` loops segments: `ros2 bag play --clock --rate $RATE` + Point-LIO with `use_sim_time`.
- [ ] Unit test (no Docker): command line built correctly; output read back via `read_frontend_output`. `smoke.sh`: builds the image, runs it on a short `lidar synth --moving` session and checks the output layout (manual; document the result in README).
- [ ] Try the build and smoke here; record honestly in README what was verified. Commit `lidar front end: Point-LIO image (L2)`.

### Task 10: Processing flow, commands, plan

**Files:** `deploy/processing/orchados-process` (+ its tests), `docs/bulut-isleme.md`, `CLAUDE.md` (İşleme hattı table: `lidar register`, `lidar process`, `lidar synth --moving`), `docs/plan.md`.

- [ ] `orchados-process`: after the pipeline run, when `lidar/raw` exists, `orchados-pipeline lidar process <session> --frontend ${PROCESS_LIDAR_FRONTEND:-point_lio} --upload`; `PROCESS_LIDAR=auto|0|1`. Tests of the script updated. Commit `processing: run the LiDAR registration`.
