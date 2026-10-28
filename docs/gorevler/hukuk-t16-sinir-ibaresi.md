> **Orchestrator notes (28 Oct 2026):** Branch `claude/hukuk-t16-sinir-ibaresi` from `origin/main`, or merge `origin/main` into it if it already exists. Wave 1; dependencies: none. A dependency PR may already be merged into main; if not, merge its branch (`git merge --no-edit origin/<branch>`) and merge it again before you open your PR. Open the PR with `gh api repos/yusuftiryaki/orchadOS/pulls ...` and write the description in Turkish. Never merge PRs, never push to main, never force-push. Ask no questions.

# Legal follow-up, wave 1: the boundary notice on every report, every PDF page and every owner map (T16, notice part)

You are one cloud coding agent in the repository yusuftiryaki/orchadOS (Next.js owner portal in apps/web). This is wave 1 of the follow-up work in docs/hukuk/kararlar.md, section “Takip işleri”. You write no migration and no Edge Function.

State of main: İP12-İP14, #79 (legal texts) and #80/#83/#84 (shared demo host: the demo org can live on the hosted test project, DEMO_HOST=test; the demo tour uses the same portal components) are merged.
Parallel streams in wave 1 (never touch their paths): claude/hukuk-t03-teklif-kabul (the only database stream; owns supabase/**, database.types.ts, every messages/*.ts file, billing/ops/site code, components/portal/service-card.tsx, components/portal-billing/** and app/portal/parsel/[parcelId]/page.tsx and actions.ts; it may add keys inside the tr.ts blocks notifications.template and operations.errors, which you must not edit), claude/hukuk-t07-saha-kayitlari (apps/field), claude/hukuk-t11-kvkk-betikleri (scripts/kvkk, docs). The wave-2 stream claude/hukuk-t19-kayit-dogrulama owns apps/web/src/lib/demo/**. The other parts of T16 (boundary declaration with version record, the boundary pointer's name and role, the ops boundary-dispute reason) are done by the field stream (wave 1) and the wave-2 database stream. The owner-facing boundary wording in messages/site.ts and the application map caption in components/portal-billing/garden-form.tsx are done by claude/hukuk-t03-teklif-kabul with the same two sentences as yours.
Merge order: claude/hukuk-t03-teklif-kabul merges first (it may change portal-fixture.ts and billing-fixture.ts); then merge main into your branch and let CI run again before your PR is merged.

## Ground rules
1. Read first: CLAUDE.md; docs/gorevler/README.md (common rules for cloud agents); docs/hukuk/kararlar.md sections “Yayın şartları”, “Takip işleri” and H07; docs/hukuk/hizmet-sozlesmesi-taslagi.md Md. 6.
2. The decisions in docs/hukuk/kararlar.md are final: the user ordered that the legal-expert agent's decisions be accepted as correct. Do not reopen them. The Turkish wording below is binding.
3. Edit only the paths under “You own”. You own apps/web/src/lib/i18n/tr.ts in this wave except the blocks `notifications.template` and `operations.errors` (carved out for the database stream): change only what this task needs. If you need a change elsewhere, work around it inside your files and describe it in the PR. Never edit CLAUDE.md, docs/plan.md or docs/hukuk/kararlar.md.
4. Safety: this adds text only; it is on everywhere, including the demo tour. Never weaken any existing lock or demo guard.
5. Language: code, comments, commit messages in English; UI strings in Turkish; PR description in Turkish.
6. Your first commit saves this brief verbatim as docs/gorevler/hukuk-t16-sinir-ibaresi.md. Commits end with the Co-Authored-By line from docs/gorevler/README.md (or your session's attribution rule if it differs); the PR body ends with the “Generated with Claude Code” line from the same file.
7. Never rebase, never force-push, never push to main, never merge a PR. Catch up with `git fetch origin && git merge --no-edit origin/main`; merge main once more right before opening the PR.
8. PR: `gh pr` is blocked. Use `gh api repos/yusuftiryaki/orchadOS/pulls -f title='Hukuk T16: sınır ibaresi her raporda, PDF sayfasında ve haritada' -f head=claude/hukuk-t16-sinir-ibaresi -f base=main -F body=@pr.md`. Turkish description: what was done, decisions, test commands with pass/fail counts, CI result (wait for GitHub Actions), deviations, follow-ups.
9. Ask no questions; choose the most conservative option and list it in the PR. If Docker does not start, run unit tests, lint and build, open the PR anyway and let CI verify.
10. Final message: branch, PR URL, commits, test commands with pass/fail counts, CI status, deviations, follow-ups.

## Commands
Root: `pnpm install`, `pnpm db:start && pnpm db:reset`, `pnpm web:lint`, `pnpm web:build`, `pnpm web:test`, `pnpm web:e2e`. CI: ci-db-web.

## Base
Branch claude/hukuk-t16-sinir-ibaresi from the latest origin/main. No dependencies.

## Decision
H07: “İbare gereklidir ve korunur, ama tek başına yeterli değildir. ... 5. İbarenin yeri: Her raporda, PDF'in her sayfasında ve harita görünümünde yer alır.” T16 (this part): “İbare PDF'in her sayfasında ve haritada yer alır.” Contract Md. 6/1 (mesafeli-v3-taslak): “Haritada gösterilen sınır, Sahip'in ya da yetkilendirdiği kişinin gösterdiği fiili kullanım sınırıdır. Tapu sınırı, kadastro ölçümü, mülkiyet ya da kullanım hakkı tespiti değildir; resmi bir sınır belirlemez. Sınır ve mülkiyet uyuşmazlıklarında kanıt olarak sunulmak üzere hazırlanmamıştır. Bu ibare her raporda ve haritada yer alır.”

## Do
1. One notice constant in tr.ts, with exactly these two forms (binding; the database stream uses the same sentences in its files). Long form for report pages and PDFs: “Haritadaki sınır, sizin ya da yetkilendirdiğiniz kişinin gösterdiği fiili kullanım sınırıdır. Tapu sınırı, kadastro ölçümü, mülkiyet ya da kullanım hakkı tespiti değildir; resmi bir sınır belirlemez. Sınır ve mülkiyet uyuşmazlıklarında kanıt olarak sunulmak üzere hazırlanmamıştır.” Short form for map overlays: “Fiili kullanım sınırı; tapu ya da kadastro sınırı değildir.” Replace the ad-hoc owner-facing variants in your files (for example the inventory report boundary note) with these constants; keep ops texts in tr.ts consistent in meaning.
2. PDFs: the visit report PDF (lib/pdf/report-pdf.tsx) and the inventory PDF (lib/pdf/inventory-pdf.tsx) carry the long form in a `fixed` footer element on every page, demo mode included (lib/pdf/parts.tsx is yours). Receipt PDF: no change.
3. Web reports: the parcel report and inventory report pages (components/portal/parcel-report.tsx, inventory-report.tsx) show the long form near the map or the boundary card. Every owner-facing map (components/portal/portal-map.tsx, health-map.tsx, boundary-card.tsx, the inventory report map, any tour map that draws the boundary) shows the short form as a persistent caption or overlay that is visible on mobile and in print. The demo tour uses the same components: check that the demo pages still render well.
4. Do not edit app/portal/parsel/[parcelId]/page.tsx or service-card.tsx (another stream): components import the notice themselves.
5. Tests: the PDF fonts in lib/pdf/fonts are embedded subsets, so text in the rendered bytes is glyph-encoded: do not grep the raw PDF for the sentence. Assert on the React element tree instead (every Page of a synthetic multi-page report and inventory document contains the fixed footer element with the long form), and if you want a byte-level check, only count pages in the rendered output; no new dependency (package.json is not yours). Component tests for the maps and report pages; a new e2e spec apps/web/tests/e2e/boundary-notice.spec.ts that asserts the caption on the owner parcel page and in the demo tour; update portal-owner.spec.ts, demo-tour.spec.ts, portal.test.ts and portal-report-layers.test.ts only where your change breaks an assertion.

## You own
apps/web/src/lib/pdf/**; apps/web/src/lib/i18n/tr.ts except the blocks notifications.template and operations.errors; apps/web/src/components/portal/** except service-card.tsx; apps/web/src/lib/portal/**; apps/web/src/lib/map/**; apps/web/src/app/portal/parsel/[parcelId]/{envanter,rapor.pdf,agac,gezi}/**; apps/web/tests/e2e/{portal-owner,demo-tour,boundary-notice}.spec.ts; apps/web/tests/integration/{portal,portal-report-layers}.test.ts; docs/gorevler/hukuk-t16-sinir-ibaresi.md.

## Do not touch
supabase/**; database.types.ts; the tr.ts blocks notifications.template and operations.errors; components/portal/service-card.tsx; app/portal/parsel/[parcelId]/page.tsx and actions.ts; every apps/web/src/lib/i18n/messages/*.ts file; lib/{billing,legal,portal-billing,back-office,operations,signup,notifications,demo}/**; components/{portal-billing,back-office,operations,site,demo}/**; app/operasyon/**; apps/web/package.json, pnpm-lock.yaml; apps/field/**; services/**; scripts/**; workflows; all docs except your brief file (CLAUDE.md, docs/plan.md, docs/hukuk/** in particular).

## Acceptance criteria
- CI green.
- Every page of the report and inventory PDFs, every owner report page and every owner-facing map (demo included) shows the notice; the wording is exactly the binding long and short forms.
- No other behaviour changes; the two carved-out tr.ts blocks are untouched.
