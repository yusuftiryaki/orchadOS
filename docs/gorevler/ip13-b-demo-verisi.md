# İP13-B Demo verisi: sentetik medya üretici, yükleyici ve iş akışı

> **Orchestrator notes (28 Oct 2026). These take precedence over the brief below.**
>
> Task file: `docs/gorevler/ip13-b-demo-verisi.md`. Wave 1. Design: `docs/demo-turu.md` (on main).

1. **Base.** Branch from `origin/main`. İP12 is fully merged there, including integration fix #61.
2. **No dependencies.** You run in parallel with the other wave-1 stream.
3. **Branch.** Push to `claude/ip13-demo-verisi`. If the session forces a different name, state it in the PR and in your final message.
4. **PR.** Open a PR against `main` with `gh api repos/yusuftiryaki/orchadOS/pulls -f head=... -f base=main ...` (`gh pr` is blocked). Write the description in Turkish. **Never merge a PR, never push to main, never force-push.**
5. **Autonomy.** Ask no questions. Where the brief leaves a choice, pick the recommended or most conservative option and list it in the PR.
6. **Human-only infrastructure.** The separate demo Supabase project, the Vercel project and the domain do not exist yet. Build and test everything locally and in CI. Write down in the PR every step a human must do.
7. **Time.** Run only the test suites that matter. Run commands longer than 10 minutes in the background.
8. **Final message.** Report: branch, PR URL, commits, each test command with pass/fail counts, any deviations from the design-doc contracts, and follow-ups.

---

You are implementing stream B of İP13 "Demo turu" (demo tour) for orchadOS: the synthetic demo dataset, its media generator, and an idempotent, versioned loader for the local stack and the hosted test and demo projects. The pilot (production) project never gets demo data.

## Context
- Repo yusuftiryaki/orchadOS (checked out in your environment). orchadOS is an independent audit service for pistachio orchards: Next.js owner portal (`apps/web`), Supabase (`supabase/`), Python processing pipeline (`services/pipeline`, uv, numpy, OpenCV).
- Read first:
    - `CLAUDE.md`
    - `docs/demo-turu.md`, the İP13 design doc. It is on main. §3.4, §8, §9, §10, §12, §15 and §17 are yours; its ids and names are binding.
    - `docs/arayuzler.md`: "Medya depolama", "Asset `pose` alanı", "Yakın plan listesi", "Kapsama raporu"
    - `docs/veri-modeli.md`, `docs/metodoloji.md`
    - `supabase/seed.sql`, especially the `auth.users` and `auth.identities` inserts and their token columns
    - `supabase/demo/scans.sql`
    - `services/pipeline/README.md`
    - `services/pipeline/src/orchados_pipeline/upload.py`
- Binding rules:
    - Real field imagery never enters the repo or the demo: everything is synthetic.
    - No real person's data: names start with "Örnek", there are no phone numbers, and e-mails use only `demo.orchados.invalid`.
    - Media is immutable and content-hash addressed (`storage://media/org/<org>/parcel/<parcel>/<sha256>`).
    - Measurements and products carry the producing method or version.
    - Nothing is sent to an LLM.
    - The service role key never leaves Supabase; remote loads use the database password and the anon key only.
    - Docs are in Turkish. Code, identifiers, comments and commits are in English.
- Base: create branch `claude/ip13-demo-verisi` from the latest `origin/main` (at least `e68bf9c`, all of İP12).
- Parallel streams:
    - Stream A (`claude/ip13-demo-erisim`, same wave) adds:
        - `private.demo_org` (with `loaded_at`, `visitor_email_domain` and `tour`) and `private.demo_parcel`
        - the public bucket `demo-media`
        - write and account guards
        - `demo-start`
        - `testing.register_demo_org`
    - Until A is on main, those objects do not exist. Locally, your loader must warn and skip the registry and mirror steps. With `--target remote`, it must refuse.
    - A's guards reject any demo visitor account (`app_metadata.demo = true`) outside demo orgs. Your personas use `demo_persona`, never `demo`, so they are unaffected.
    - Stream C (wave 2) runs `pnpm db:demo-tour --profile test --reset-local` in CI before the web integration tests and in Playwright global setup, and caches `.demo-build`. Keep that command working and fast.

## Goal
`pnpm db:demo-tour` on a fresh `pnpm db:reset` loads a complete, realistic dataset with real synthetic media into local Supabase. A manual workflow does the same on the hosted test or demo project, with loading and enabling as separate actions. A paying owner's portal must work one-to-one on it:
- garden list with two parcels
- 360° tour with neighbour arrows, tree markers and time travel between two summer scans a year apart
- health map with all layers
- parcel report card with same-season comparison and every dimension row:
    - structure: female/male ratio, ungrafted trees, age mix
    - care: basal sprouts
    - pests
    - fruit load against last year
- tree cards with crops, close-ups, a passing SHA-256 hash check and measurement history
- an approved inventory with panoramas
- findings with expert notes
- two answered question threads
- a viewers card
- an approved boundary
- both PDFs

## Fixed ids and personas (shared contract; doc §8.1)
- **Demo org:** `de000000-0000-4000-8000-000000000001`, "orchadOS Demo (örnek veri)". It has no `org_billing_setting` row.
- **Parcels:**
    - A `de100000-0000-4000-8000-000000000001` "Örnek Bahçe – Kuzey"
    - B `de100000-0000-4000-8000-000000000002` "Örnek Bahçe – Dere"
- **Personas** (`auth.users` + `auth.identities`, mirroring `supabase/seed.sql`):

  | Id | Role | E-mail |
  | --- | --- | --- |
  | `de900000-0000-4000-8000-000000000001` | owner | `ornek-sahip@demo.orchados.invalid` |
  | `de900000-0000-4000-8000-000000000002` | viewer | `ornek-hissedar@demo.orchados.invalid` |
  | `de900000-0000-4000-8000-000000000003` | expert | `ornek-uzman@demo.orchados.invalid` |
  | `de900000-0000-4000-8000-000000000004` | field_staff | `ornek-saha@demo.orchados.invalid` |
  | `de900000-0000-4000-8000-000000000005` | ops, also the media uploader | `ornek-operasyon@demo.orchados.invalid` |

    - `raw_app_meta_data = {provider: 'email', providers: ['email'], demo_persona: true}`. Never `demo: true`.
    - Every GoTrue string token column is `''`, never NULL: `confirmation_token`, `recovery_token`, `email_change_token_new`, `email_change`, `email_change_token_current`, `phone_change`, `phone_change_token`, `reauthentication_token`. Hosted GoTrue's Admin `listUsers` fails on NULLs, and customer-signup cleanup and many tests page through it.
    - `encrypted_password = ''` (not null), `phone` null, `email_confirmed_at` set.
    - `banned_until = '2999-01-01 00:00:00+00'`. Never `'infinity'`, which GoTrue cannot scan into a Go time.
    - Memberships in the demo org: expert, field_staff, ops.
    - `parcel_access`: owner persona `owner` on A and B; viewer persona `viewer` on A.
    - Only the viewer persona has a `private.owner_profile` row: `full_name` "Örnek Hissedar", phone null, `kvkk_consent` false.
    - No `viewer_invitation`. Its `phone` is NOT NULL and E.164 (`20261024120100_viewer_invitations.sql`), and the dataset has no phones. The viewers card shows "Örnek Hissedar" only.
- **Sessions** (all summer, so the pest and fruit-load rows exist; see below):

  | Id | Session |
  | --- | --- |
  | `de200000-0000-4000-8000-000000000001` | A inventory 2025-06-10 (approved) |
  | `de200000-0000-4000-8000-000000000002` | A periodic scan 2025-07-15 (published) |
  | `de200000-0000-4000-8000-000000000003` | A periodic scan 2026-07-14 (published) |
  | `de200000-0000-4000-8000-000000000004` | B inventory 2026-06-09 (approved) |
  | `de200000-0000-4000-8000-000000000005` | B periodic scan 2026-07-16 (published) |

  Publication dates are a few days after each visit, given explicitly. No future dates; today is 2026-10-28.
- **All other ids:** `uuid5(UUID('de0f0000-0000-5000-8000-000000000000'), f'v{version}:{kind}:{key}')`.
- **Tour config** (`private.demo_org.tour`):
    - `parcel_id`: A
    - `tree_id`: the tree at slot S3-6 of A
    - `session_id`: `de200000-0000-4000-8000-000000000003`
    - `previous_session_id`: `de200000-0000-4000-8000-000000000002`
    - `inventory_session_id`: `de200000-0000-4000-8000-000000000001`

## Dataset v1 content (doc §8.2–§8.3)
- **Season matters.** `apps/web/src/lib/portal/dimensions.ts` reads tree attributes and metric codes. Check `metric_definition.valid_seasons` and `apps/web/src/lib/expert/season.ts`: June and July are summer, October is harvest.
    - `pest_sign_severity`, `pest_sign_type` and `fruit_load_scale` are valid only in spring or summer.
    - `pruning_status` is valid only in winter, `harvest_complete` only in harvest.
    - The periodic scans are therefore in July. The care row then shows basal sprouts, as any real summer visit would.
- **Tree attributes:** every active tree has `sex` (about 1 male per 8–10 females; ~7 males in A), `graft` (a few ungrafted), `age_class` (mostly mature, a few young, one young replant) and `cultivar`. Use the schema's enum values.
- **Measurements:**
    - Each published scan carries one measurement per active tree for every tree-subject `metric_definition` whose `valid_seasons` includes `summer` and that the portal reads (`dimensions.ts`, `metrics.ts`, `score.ts`).
    - Today that is `dead_branch_scale`, `trunk_base_scale`, `crown_density_scale`, `dieback_pattern`, `dried_leaves_attached`, `basal_sprout_level`, `pest_sign_severity` and `fruit_load_scale`. Add `pest_sign_type` on trees with signs.
    - Read the list from the database at load time and never write an out-of-season code.
    - The `fruit_load_scale` mean is ~2.3 in 2025 and ~1.4 in 2026 (alternate bearing, so the trend reads `lower`).
    - Use the methodology version the schema accepts. Expert-approved assessments follow `scans.sql`. Algorithmic values carry producer `orchados-demo/1`.
- **A:**
    - 6 rows × 12 = 72 slots `S<row>-<pos>`, row spacing 7 m, tree spacing 6 m
    - boundary from a field survey, approved by the owner persona
    - the approved inventory, following `20261025120300_inventory_coverage_gate.sql` and pgTAP `15_inventory_chain` and `18_inventory_approval`, has:
        - verification items, trunk labels and presence measurements
        - about 16 preview panoramas
        - a coverage report that passes the gate
    - zones, if the schema has them
    - latest classes, approximately: 52 healthy, 9 attention, 5 problem, 1 dead, 2 empty, 1 young replant; 2025 is healthier
    - findings: about 10 in 2026 and 5 in 2025, of these types: dry branch, trunk wound with gummosis, leaf yellowing, psyllid signs, missing tree, parcel-level irrigation and weeds. Each has evidence links.
- **Expert notes** are `finding.description` plus `finding.recommendation` on every finding, parcel-level ones included, plus the expert persona's question replies. The owner portal never shows `session.notes` or `assessment.notes`, so do not invent per-visit summaries.
- **Featured tree S3-6:** healthy in 2025, problem in 2026, a dry-branch finding, 2–3 close-ups and a question thread.
- **Question threads on A:** asked by the owner and viewer personas, answered by the expert persona; one on S3-6, one on a parcel-level finding.
- **B:** 4 × 8 = 32 slots, the same attribute rules, an approved inventory with about 8 previews and a coverage report, one published scan and 3 findings.
- **Raw `capture` rows** (360 video, GNSS): `uri = 'station://orchados-demo/synthetic/<session>/<file>'` and a deterministic content_hash.
- **Close-ups:** `capture` rows of kind `photo` with `tree_id` and the close-up protocol fields (`20261028120000_closeup_protocol_v01.sql`).
- **Camera height:** set `camera_height_m = 2.0` wherever the schema records it (grep; `record_scan_setup`). The portal assumes 1.8 m, so markers sit 2–3° high. That is accepted.

## Insert order (no notifications)
Run one SQL transaction as postgres, in this order:
1. personas, org, memberships
2. rig, sensors, calibration
3. parcels, boundary, slots, trees, zones
4. sessions, inserted directly as published or approved (no status update, so `session_notify_published` never fires)
5. inventory chain, captures, assets, asset sources
6. measurements, assessments, findings and evidence (before any `parcel_access`, so `finding_notify_critical` finds no recipient)
7. viewer profile and `parcel_access`
8. questions and replies, last
9. the registry row with `loaded_at = null`, only when the table exists

Rows whose triggers derive identity from `auth.uid()` (questions; check `20261023130100_questions.sql`) are inserted under the author persona: `select set_config('request.jwt.claims', ..., true); set local role authenticated;` then `reset role`.

## Row builders and conflicts
- Build asset, capture, asset_source, coverage and presence rows with `orchados_pipeline.upload`'s `panorama_pose`, `crop_pose`, `_asset_row`, `presence_payload` and `coverage_payload`. Do not hand-write them.
- Preferably implement an SQL-emitting `Catalog`, so `upload_run`'s ordering and lineage rules are reused as they are. `mark_processed` and `record_*` become no-ops or SQL inserts.
- Use explicit conflict targets everywhere (`on conflict (id) do nothing`), so a `(session_id, content_hash)` collision fails loudly.
- Put the short asset key in every image's corner stamp, so no two files are byte-identical; two empty-slot crops, for example, must still differ.

## Synthetic media (doc §9)
Package `services/pipeline/src/orchados_pipeline/demo/`. Use numpy and OpenCV only. Add no dependency unless unavoidable, and justify it.
- **Convention:** exactly the pipeline's equirectangular convention: the centre column faces `heading_deg`, azimuth increases to the right, the top row is the zenith. Trees must appear at the bearings `apps/web/src/lib/portal/tour.ts` computes.
- **Resolution:** the internal render is the profile's full size: test 1024×512, full 3840×1920. Previews are downscaled from it and crops are cut from it with the pipeline's gnomonic projection and crop code.
- **Speed:**
    - Sky and ground are vectorised in numpy.
    - Trees are rasterised per object: project each ellipsoid's and trunk's bounding box into equirectangular space and z-buffer only those pixels. Never loop over all objects per pixel.
    - Add a pytest timing guard: the test-profile build takes under 90 s on CI. The full profile must build in under 10 minutes.
- **Scene:**
    - sky gradient, sun disc and glow from the date and time, seeded fBm clouds
    - hill silhouette with distance haze
    - soil with furrows parallel to the rows, dry grass, aisle tyre tracks, a drip line and crown shadows
- **Trees:**
    - a textured, slightly leaning trunk
    - a crown of 6–12 jittered, Lambert-shaded ellipsoid clusters
    - summer foliage, with nut clusters on healthy trees
    - appearance by class: healthy deep green; attention yellowish; problem sparse with brown patches; dead bare grey; young small with a stake; empty a stake or nothing
    - the 2025 and 2026 renders of a tree differ by its class in that year
- **Stamps:** a nadir disc with the ASCII text "orchadOS SENTETIK ORNEK" (`cv2.putText` cannot draw Turkish), and a small corner stamp with the asset key on crops and photos.
- **Panoramas:**
    - A scans: about 40 positions each (4 aisles, every 8 m), nearly the same in both years so `sameSpot` pairs them
    - B scan: about 16
    - inventories: about 16 on A and 8 on B
    - variants as `apps/web/src/lib/media/panorama-variants.ts` pairs them: `pose.variant` full or preview, the same `gps_time_ns`, `width_px` and `height_px`
    - A 2026 has full and preview variants; everything else is preview only
    - WebP
- **Crops:** about two directions per active tree per scan, with `pose` exactly as in `docs/arayuzler.md`. JPEG.
- **Close-ups:** procedural macro scenes (leaflets, bark with a gum drop, a dry twig, an empty nut cluster, psyllid spots), each tied to a finding type. JPEG.
- **Profiles** (sizes match the pipeline's 4K and 2K outputs):

  | Profile | Full | Preview | Crop | Close-up | Total |
  | --- | --- | --- | --- | --- | --- |
  | `full` | 3840×1920 | 1920×960 | 1024² | 1600×1200 | ≤ 150 MB (aim ~115) |
  | `test` | 1024×512 | 512×256 | 256² | 400×300 | ≤ 10 MB |

- **Determinism:** all randomness is seeded from `(dataset_version, key)`. Same machine and same uv.lock give identical bytes. Other CPUs may not, so hosted loads never depend on bytes matching (below).

## Loader CLI (doc §10)
Register a `demo` group in `services/pipeline/src/orchados_pipeline/cli.py`:

```
orchados-pipeline demo build   [--profile full|test] [--out DIR] [--force]
orchados-pipeline demo load    --target local|remote [--profile full|test] [--build DIR]
                               [--dry-run] [--reset-local] [--verify] [--demo-only] [--enable]
orchados-pipeline demo enable  --target local|remote
orchados-pipeline demo disable --target local|remote
orchados-pipeline demo verify  --target local|remote
```

- **Build cache:** `services/pipeline/.demo-build/v<version>-<profile>/manifest.json` plus `files/<sha256>`. Add `.demo-build/` to the root `.gitignore`.
- **Manifest:** dataset name and version, profile, generator version, and per file: key, sha256, bytes, mime, width and height, parcel. `dataset_sha256` is the SHA-256 of its canonical JSON.
- **SQL transport:** always psql, with `-v ON_ERROR_STOP=1 -1`; the same code path on both targets.
    - `local`: `docker exec -i supabase_db_orchados psql -U postgres -d postgres`.
    - `remote`: `psql "$DEMO_DB_URL"` with `PGPASSWORD`.
    - Do not use the Management API for the load.
- **Media:** use `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Locally, take them from `pnpm exec supabase status -o env`.
- **`--reset-local`** (local only): `testing.purge_org('de000000-0000-4000-8000-000000000001')` with the local service role key from `supabase status`. Auth personas stay.
- **`--demo-only`:** before writing anything, abort if `public.org` has any row other than the demo org. The demo-project workflow always passes it, so mis-set secrets can never write to the pilot.
- **Enable and disable:**
    - `load --enable` enables only after a passing verify.
    - `enable` builds nothing. It requires the registry row with `loaded_at` set and a passing verify. Then, in one transaction, it disables every other demo org and sets `enabled = true`.
    - `disable` only disables.
- **Steps:**
    1. Build, or reuse the cache.
    2. **Pre-check, version-based:**
        - If version v is registered with `loaded_at` set and verify passes: print `already loaded` and exit 0, without comparing bytes.
        - If v is registered with `loaded_at` null (a partial load): resume when the manifest sha equals `dataset_sha256`. Otherwise abort, saying to rerun with the earlier build artifact or bump the version.
        - Locally, a different profile or different bytes: suggest `pnpm db:reset` or `--reset-local`.
        - No registry table: local warns, remote refuses.
    3. The SQL transaction above.
    4. **Media:**
        1. SQL gives the ops persona a random password (`extensions.crypt(..., extensions.gen_salt('bf'))`) and clears `banned_until`.
        2. Sign in with GoTrue's password grant.
        3. Upload missing objects to bucket `media` at `org/<org>/parcel/<parcel>/<sha256>` with the right content type. Upload the same bytes to the same path in bucket `demo-media` with `cache-control: max-age=31536000`, only if that bucket exists. "Already exists" is success. Reuse `orchados_pipeline.media.SupabaseMediaStore` and `supabase.py` where they fit.
        4. Read a sample back and verify its sha256.
        5. In a `finally` block, set `encrypted_password = ''` and `banned_until = '2999-01-01 00:00:00+00'`. If the runner dies, A's housekeeping re-bans after an hour.
    5. **Registry:** set `loaded_at`, `dataset_sha256`, `dataset_source 'synthetic'` and `tour`; upsert `demo_parcel` (A sort 1, B sort 2, active).
    6. **Verify** (`--verify`, and always in tests).
        - Under the owner persona's claims with `set local role authenticated`, i.e. under RLS:
            - published sessions: A 2, B 1
            - panorama full and preview pairs
            - at least one crop per active tree per scan
            - close-ups on S3-6
            - findings
            - answered questions
            - an approved inventory with panoramas and a coverage report
            - an approved boundary
            - for A's latest scan, per-tree counts of the structure, care, pest and fruit-load codes, and males, females and ungrafted all above 0
        - As postgres:
            - every demo `storage://` URI has an object in `media`, and in `demo-media` when that bucket exists
            - every persona has `coalesce(encrypted_password, '') = ''`, `banned_until` in the future and no NULL token column
            - no `org_billing_setting` row
            - `select count(*) from public.notification where org_id = <demo org>` is 0
- **Idempotency and versions:**
    - A second identical run inserts 0 rows, uploads 0 files and says so.
    - Version 2 only adds rows. Apply versions in order, from v1 to the target.
- **Showcase hook (doc §10.5):** keep a small source-adapter seam (`synthetic` now, `showcase` later). Showcase builds must write outside the repo, never under `services/pipeline`. Implement nothing else.

## Root script and workflow
- **Root `package.json`:** add only `"db:demo-tour": "uv run --directory services/pipeline orchados-pipeline demo load --target local --verify --enable"`. Extra args are appended.
- **`.github/workflows/demo-data.yml`** (`workflow_dispatch`).
    - Inputs:
        - `project`: choice `test` | `demo`, default `test`. Never `pilot`.
        - `action`: choice `load` | `enable` | `disable`, default `load`.
        - `dry_run`: boolean, default false.
        - `reuse_build_run_id`: string, optional.
    - Secrets:
        - `test`: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`
        - `demo`: `SUPABASE_ACCESS_TOKEN`, `DEMO_SUPABASE_PROJECT_REF`, `DEMO_SUPABASE_DB_PASSWORD`, `DEMO_SUPABASE_URL`, `DEMO_SUPABASE_ANON_KEY`
    - Steps:
        1. Skip with a warning when secrets are missing.
        2. Checkout, then pnpm and node as in `deploy-db.yml` (for the supabase CLI).
        3. `supabase link --project-ref ... --password ...`.
        4. Build `DEMO_DB_URL` from `supabase/.temp/pooler-url`, switched to session mode (port 5432), and pass the password as `PGPASSWORD`. GitHub runners have no IPv6, so never use `db.<ref>.supabase.co`. Fail clearly if the file is missing. psql is preinstalled on ubuntu-24.04.
        5. For `load`:
            1. `astral-sh/setup-uv` and `uv sync --locked`
            2. Either `demo build --profile full`, or `actions/download-artifact` with `run-id: reuse_build_run_id` and `github-token` (needs `actions: read`)
            3. Fail if the build is over 150 MB.
            4. `actions/upload-artifact` of the build, retention 30 days
            5. `demo load --target remote --verify`, plus `--demo-only` for `demo` and `--dry-run` from the input
        6. For `enable` and `disable`: only `demo enable|disable --target remote`; never build.
        7. Write row counts, files and MB to `$GITHUB_STEP_SUMMARY`.
    - Concurrency group `demo-data-${{ inputs.project }}`, timeout 45 min.

## Tests (`services/pipeline/tests/test_demo_*.py`)
- **Render determinism:** test-profile bytes are identical across two runs.
- **Projection:** a tree at bearing θ lands in the expected column with its crown colour; the nadir stamp is present.
- **Timing guard:** the test-profile build takes under 90 s.
- **Crop poses:** fields and types match `docs/arayuzler.md`. Rows come from the upload.py builders.
- **Dataset invariants:**
    - ids come from the de-prefix or the uuid5 namespace
    - persona e-mails end in `.invalid`
    - no phone-like string appears anywhere
    - all names start with "Örnek"
    - A's scans are about one year apart and in summer
    - the class distribution matches
    - every active tree has sex, graft, age_class and cultivar
    - the male ratio is between 1:8 and 1:10
    - the fruit-load means differ by at least 0.5
    - no out-of-season metric code
    - no `viewer_invitation`
- **SQL emission:**
    - every insert has an explicit `on conflict (...)` target
    - inserts follow the order above
    - persona inserts set every token column to `''`
    - there is no delete or update of domain rows, except the ops persona lines
- **Size budget:** test ≤ 10 MB; the full-profile estimate ≤ 150 MB.
- **`test_demo_load_supabase.py`** (`@pytest.mark.supabase`, skipped when local Supabase is unreachable):
    1. `--reset-local`, then load the test profile.
    2. Reload: 0 inserts, 0 uploads.
    3. Verify passes.
    4. Fetch one panorama and one close-up through a signed URL as a temporary owner user (service role locally only), and through the public `demo-media` URL when the bucket exists. sha256 equals `content_hash`.
    5. Persona passwords are empty and token columns are not NULL.
    6. With the local service role, `GET /auth/v1/admin/users?page=1&per_page=1000` and `GET /auth/v1/admin/users/<each persona>` return 200.
    7. `public.notification` has 0 demo rows.
    8. If `private.demo_org` exists, check its row, `loaded_at` and `tour`. `demo enable` then `demo disable` toggle `enabled`.

Do not edit `ci-pipeline.yml` unless strictly needed.

## Docs
- `services/pipeline/README.md`: a "Demo verisi" section.
- `supabase/demo/tour/README.md` (Turkish): what the dataset is, the ids, the summer-season reason, local and hosted loading (`load` then `enable`), and versioning.
- `CLAUDE.md`:
    - add `docs/demo-turu.md` to "Önce oku"
    - add `pnpm db:demo-tour` to the database commands
    - add `orchados-pipeline demo build|load|enable|disable|verify` to the pipeline table
    - under the migration rules add: "Yeni tablo ekleyen migration `select private.attach_demo_guard('<tablo>')` çağırır; kullanıcıya erişim ya da kimlik veren tablo ayrıca `private.attach_demo_account_guard(...)` çağırır (docs/demo-turu.md §6.1–6.2). Servis rolüyle yazan yeni Edge yolları demo claim'ini reddeder."
- Do not edit `docs/demo-turu.md`, `docs/deployment.md` or `docs/plan.md`. Put deployment notes in the PR.

## Files you own
- `services/pipeline/src/orchados_pipeline/demo/**`, `cli.py`, `services/pipeline/tests/test_demo_*.py`, `services/pipeline/README.md`
- `pyproject.toml` and `uv.lock`, only if unavoidable
- `supabase/demo/tour/**`
- root `package.json` (the one script), root `.gitignore`
- `.github/workflows/demo-data.yml`, `CLAUDE.md`

Do not touch:
- `supabase/migrations/**`, `supabase/tests/**`, `supabase/testing/**`, `supabase/functions/**`
- `supabase/config.toml`, `supabase/seed.sql`, `supabase/demo/scans.sql`
- `apps/**`, `services/ai-worker/**`
- other workflows
- `docs/demo-turu.md`, `docs/deployment.md`, `docs/plan.md`

## Commands
- From the repo root: `pnpm install`, `pnpm db:start`, `pnpm db:reset`, `pnpm db:demo-tour`, `pnpm db:demo-tour --profile test --reset-local`, `pnpm db:test` (must stay green after loading).
- In `services/pipeline`: `uv sync`, `uv run pytest`, `uv run ruff check .`, `uv run ruff format --check .`.
- Optionally inspect the portal with `pnpm web:dev`, giving a local user owner access with SQL. Never commit that.

## Acceptance criteria
- On a fresh `pnpm db:reset`, `pnpm db:demo-tour` loads the full profile in under 10 minutes and verify passes. A second run is a no-op.
- `--profile test --reset-local` builds and loads in about 2 minutes; a cached rerun is much faster.
- `uv run pytest` is green, including the supabase-marked test. Ruff is clean. `pnpm db:test` stays green after loading.
- Full build ≤ 150 MB and test ≤ 10 MB, at 3840×1920 and 1920×960 for full. Images are stamped and orchard-like. The README describes 2–3 sample renders; commit no images.
- No real imagery, names or phones. No service key is used for remote. The ops persona has an empty password and a finite ban after every run, including failed ones.
- Without A's objects: local warns and skips; remote refuses. With them: the registry, tour and mirror are written, and `enable` and `disable` work without rebuilding.
- The workflow YAML is valid (`actionlint` if available). `dry_run` writes nothing. `--demo-only` aborts on a project with other orgs.

## Process
- Work autonomously and ask no questions. Where the doc leaves a choice, take the simplest consistent option, and list each deviation in the PR.
- Commit in logical steps. End commit messages and the PR body with the attribution lines your environment specifies.
- Before opening the PR: `git fetch origin` and integrate the latest `origin/main`. Rebase if you have not pushed yet, otherwise merge. If A has landed, run the loader against the new schema once more. Never force-push, never push to main, never merge.
- If Docker or local Supabase will not start: run the non-supabase tests and ruff, open the PR, and say that CI must validate.
- `gh pr` is blocked by the proxy. Open the PR with:

  ```
  gh api repos/yusuftiryaki/orchadOS/pulls -X POST -f title='İP13-B: demo verisi (sentetik medya, yükleyici, iş akışı)' -f head='claude/ip13-demo-verisi' -f base='main' -F body=@<file>
  ```

  Write the description in Turkish with these headings:
    - Özet
    - Veri kümesi (counts, sizes, seasons)
    - Komutlar
    - Sözleşmeler (ids, tour config, registry and mirror behaviour)
    - Testler
    - Sapmalar
    - Dağıtım notları (`demo-data` load then enable, artifacts, `DEMO_` secrets)
    - İnsan eylemi

