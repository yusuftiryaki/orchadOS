# İP14-B Hukuk taslakları ve dokümanlar: çoklu bahçe, ek sipariş, bahçe bazında fesih

> **Orchestrator notes (28 Oct 2026). These take precedence over the brief below.**
>
> Task file: `docs/gorevler/ip14-b-hukuk-dokumanlar.md`. Wave 1. Design: `docs/bahce-yonetimi.md` (on main).

1. **Base.** Branch from `origin/main`. İP12 and İP13 are fully merged there, including #66 and #67. The repo is now **public**: never commit secrets, real data or personal data.
2. **No dependencies.** You run in parallel with the other wave-1 stream.
3. **Parallel work.** İP14-A on `claude/ip14-veri-modeli` Never touch another stream's owned paths.
4. **Branch.** Push to `claude/ip14-hukuk-dokumanlar`. If the session forces a different branch name, state it in the PR and in your final message.
5. **PR.** Open a PR against `main` with `gh api repos/yusuftiryaki/orchadOS/pulls -f head=... -f base=main ...` (`gh pr` is blocked). Write the description in Turkish. **Never merge a PR, never push to main, never force-push.**
6. **Autonomy.** Ask no questions. Where the brief leaves a choice, pick the recommended or most conservative option and list it in the PR.
7. **Time.** Run only the test suites that matter. Run commands that take longer than 10 minutes in the background.
8. **Final message.** Give the branch, the PR URL, the commits, each test command with its pass/fail counts, any deviation from the design doc's contracts, and the follow-ups.

---

> **Orchestrator notes (28 Oct 2026). These take precedence over the brief below.**
>
> Wave 1. Design doc: `docs/bahce-yonetimi.md` (on main, version 2). It is the source of every rule you put into the legal drafts.

1. **Base.** Create branch `claude/ip14-hukuk-dokumanlar` from the latest `origin/main` (at least `8ce1252`; #66 and #67 are merged, so `CLAUDE.md`, `plan.md`, `deployment.md` and `kullanim-kilavuzu.md` already carry the İP13 fixes; build on them).
2. **Parallel stream.** Stream A (`claude/ip14-veri-modeli`) builds the database at the same time. You write no code beyond the legal text mirror.
3. **PR.** Open a PR against `main` with `gh api repos/yusuftiryaki/orchadOS/pulls -f title='İP14-B: …' -f head=claude/ip14-hukuk-dokumanlar -f base=main -F body=@<file>` (`gh pr` is blocked). Write the description in Turkish. Follow your session's attribution rules. **Never merge, never push to main, never force-push.** If your branch is already pushed, merge `origin/main` instead of rebasing. The repository is public and GitHub Actions run on PRs: wait for the CI run of your branch and report its result.
4. **Autonomy.** Ask no questions. These are drafts for a lawyer: mark every legal choice with `[avukat: …]` and list the questions in `docs/hukuk/README.md`. Pick the option the design doc recommends.
5. **Final message.** Report: branch, PR URL, commits, test results, the CI result, the list of lawyer questions, and follow-ups.

---

## Context
- orchadOS is an independent audit service for pistachio orchards. Read `CLAUDE.md`, `docs/bahce-yonetimi.md` (İP14), `docs/musteri-yonetimi.md` §1, §2, §4, §16 and §19, and every file in `docs/hukuk/`.
- Docs are Turkish; code and identifiers are English.
- **İP14 decisions you must reflect** (design doc §2, §4–§7, §10):
    - **Service period.** A customer has one service period (üyelik dönemi), anchored on the base order. Gardens added later get an add-on order (ek sipariş) that ends on the same day. Existing customers with two separate periods are merged at renewal through an add-on quote.
    - **Add-on pricing.** The visit entitlement is yearly visits × remaining days ÷ period days, rounded half up, at least 1. The minimum fee is prorated by the same ratio. The inventory fee is charged in full; it is waived for a re-added garden with a published inventory. The add-on uses the price list in force on the quote day.
    - **Last add-on day.** The last day is period end − 30 + 1. An add-on quote is valid, can be accepted and must be paid by that day; later gardens join the next period. If the period closes before activation (for example, a late payment), the order is cancelled and the money refunded.
    - **Add-on contract.** The add-on order has its own payment, receipt and a 14-day withdrawal window. The window counts from its activation day; day 14 is included. `[avukat: separate distance contract or annex; activation day or acceptance day]`
    - **Per-garden termination.** The customer requests it in the portal and chooses explicitly: in 30 days, at period end, or, only inside the withdrawal window, the withdrawal right with exit today. It takes effect automatically on the effective day; ops may change the date by agreement, and the customer gets an SMS. A garden that is on an unpaid order (for example, an accepted renewal) cannot be removed until that order is cancelled.
    - **Refund.**
        - Formula: unused billable visits × the line's visit fee, plus the inventory share if no inventory was done. Visit fee = (line total − inventory share) ÷ entitled visits, from the frozen quote line.
        - Not counted as used: the company's own rescans (pipeline or expert extra-visit requests). Two scans on the same day count once.
        - Deducted: every refund already made on the line, including a Md. 8A missed-visit refund, so a visit is never paid twice. Example (doc §7.1): 1.200.000 kuruş, 4 visits, 1 done, 1 missed and already refunded 300.000 → 600.000 now.
        - A line whose period ended before the exit day is outside the removal refund; its missed visits are refunded only under Md. 8A.
        - Withdrawal: the whole line, minus the inventory share if the inventory was done and minus performed periodic visits `[avukat: md. 15/1-ğ]`.
        - A paid future renewal line of the garden is refunded in full.
        - Each refund shows its VAT part.
    - **After removal.** The parcel becomes passive and data is kept. For 90 days the access is read-only (no questions, no invitations). Then the system removes the access of the customer, of the co-owners they invited, and of every co-owner if no other owner remains. Other owners keep access unless ops removes all. On a transfer (sale) the access period is 0; a shorter period is allowed only for a transfer, a duplicate or with a written reason.
    - **Last garden.** When the last garden is removed, the membership ends.
    - **Renewal.** One renewal quote covers every garden in service.
    - **Notifications.** SMS when ops schedules, reschedules or cancels a removal, when it is completed, and 7 days before access ends.
    - **Switch.** Everything is off on hosted projects until the lawyer approves the texts (`org_billing_setting.garden_changes_enabled`).

## Deliverables

### 1. Legal drafts (`docs/hukuk/`, Turkish, marked as drafts)
- **`hizmet-sozlesmesi-taslagi.md` → version `mesafeli-v2-taslak`:**
    - **Md. 2 and Ek-1:** use bahçeleri; Ek-1 becomes a list of gardens, and gardens added by an add-on order join Ek-1.
    - **New article `Madde 8D – Dönem içinde bahçe ekleme`:** co-terminous add-on, the proration formula in plain words with the worked example (doc §6: 15 dönüm from 1 April, 2 visits, 4.500,00 TL incl. VAT at seed prices, marked as an example), the minimum-fee proration `[avukat/fiyat]`, the full inventory fee, the last add-on day and the cancellation and refund when the period closes before activation, the add-on's own withdrawal window `[avukat]`.
    - **Md. 8A:** a missed-visit refund is deducted from a later removal refund.
    - **Md. 8B:** an explicit partial withdrawal for one garden `[avukat]`, with the deductions for inventory and performed visits `[avukat: md. 15/1-ğ]` and the window definition.
    - **Md. 12/3:** per-garden partial termination (30 days or period end), the refund formula with both doc §7 examples, the billable-visit rule, prior-refund deduction, the ended-period rule, the automatic effect, the unpaid-order rule, and that the whole contract ends when the last garden is removed.
    - **Md. 12/4:** applies to a removed garden: 90 days of read-only access; the scope of access removal (customer, the co-owners they invited, all co-owners when no other owner remains); 0 days on a transfer; then deletion or anonymisation per the KVKK notice.
    - **Md. 12/2:** one renewal quote for all gardens in service.
- **`iptal-iade-politikasi-taslagi.md` → `iade-v2-taslak`:**
    - a new section `Bahçe çıkarma`: how to request, the three options, notice, at period end, the withdrawal case, the refund formula and examples, prior refunds, how the refund is paid, the read-only period, the SMS messages;
    - update §4 `Fesih` to point to it;
    - keep the existing contradiction note about unpaid orders, which is not İP14's.
- **`on-bilgilendirme-formu-taslagi.md` → `onbilgi-v2-taslak`:** the price section explains add-on proration, that the add-on quote shows its period, visit entitlement and last valid day, and that withdrawal is chosen explicitly.
- **`README.md`:** add the İP14 lawyer questions:
    - the nature of the add-on contract and its withdrawal window (activation day or acceptance day);
    - minimum-fee proration;
    - per-garden termination and notice;
    - missed visits and 8A deduction in the refund;
    - explicit partial withdrawal and the inventory and performed-visit deductions (md. 15/1-ğ);
    - 90-day read-only access, the access-removal scope (co-owners, other owners) and the 0-day transfer, and how they relate to the KVKK retention period [X];
    - whether an expired, unrenewed membership should also close access (12/4).
- **Do not change** `kvkk-aydinlatma-metni.md`, `acik-riza-metni.md` or their versions; put the KVKK question in the README instead.

### 2. Site mirror
- **`apps/web/src/lib/i18n/messages/legal.ts`:** mirror the changed drafts block by block. Its header explains the rule: `docs/hukuk` is the source; keep both in step.
- **`apps/web/src/lib/legal/versions.ts`:** bump `distance_sales` → `mesafeli-v2-taslak`, `pre_information` → `onbilgi-v2-taslak`, `refund_policy` → `iade-v2-taslak`. Leave `kvkk_notice`, `explicit_consent` and `privacy` unchanged.
- Update `versions.test.ts` and `legal.test.ts`. Other tests pass version strings directly to the database and do not depend on these constants; do not touch them.

### 3. Docs (Turkish)
- **`docs/plan.md`:**
    - an İP14 row in the work-package table: `Bahçe yönetimi`, P1, ~8 gün, with a summary and a link to `docs/bahce-yonetimi.md`;
    - a Gantt line;
    - status rows for İP14 tasarım, A, B, C and D (A, C and D `Sürüyor`, B `PR açık`);
    - a decision line (28 Ekim): `Müşterinin birden fazla bahçesi; üyelik boyunca ekleme ve çıkarma; tek dönem, ek sipariş, orantılı fiyat, bahçe bazında fesih`.
- **`CLAUDE.md`:** three edits, nothing else:
    - add `docs/bahce-yonetimi.md` to `Önce oku` with a one-line description;
    - change `İP0–İP12` to `İP0–İP14`;
    - in the migration rule, change `şu an 20261101120300` to `şu an 20261102120300`. Stream A's planned last file; A reports in its PR if it adds a later one, and a follow-up adjusts the line.
- **`docs/musteri-yonetimi.md`:** short pointer notes only; do not rewrite.
    - §1 `Yenileme` row: the renewal includes add-on gardens (İP14).
    - §4 step 9: a single renewal per period.
    - §5.3: new transitions are listed in `bahce-yonetimi.md` §8.4.
    - §6.9: İP14 replaces some functions with the same signature (`bahce-yonetimi.md` §9.6), among them `payment_begin`, `activate_order`, `ops_terminate_order`, `ops_orders`.
    - §19: unrenewed membership access.
- **`docs/kullanim-kilavuzu.md`:** in section `0 · Başvuru ve ödeme`, add `Bahçe ekleme ve çıkarma`, role by role:
    - customer: add a garden, follow the add-on quote, the three removal options, undo a removal, the read-only period;
    - co-owner: what they see and when their access ends;
    - ops: overlap check, linking an old parcel, add-on quote, merging two periods, removal queue, confirming or changing a date (SMS), blocked removals, completing now, refunds (including manual mode), renewal with all gardens, a transfer with 0 days, administrative termination and its cascade;
    - system: the nightly job.
- **`docs/MVP.md`:** a note in the parcel life-cycle part: removal makes the parcel passive and read-only for 90 days, ops cannot resume it during that time, and nothing is deleted.
- **`docs/deployment.md`:** a section `Bahçe ekleme ve çıkarma (İP14)`:
    - the switch in `/operasyon/ayarlar` (off on hosted projects until the lawyer approves);
    - the cron job `garden-removal-housekeeping` (installed by migration; no Vault, no secret);
    - the smoke list from design doc §15;
    - rollback.

## Tests and commands
```
pnpm install
pnpm web:lint
pnpm web:test   # unit part is enough if Supabase is not running; legal.test.ts and versions.test.ts must pass
pnpm web:build
```

## Acceptance criteria
- The three drafts carry the new versions, describe every İP14 rule above consistently with `docs/bahce-yonetimi.md`, and mark every legal choice with `[avukat: …]`.
- `legal.ts` mirrors the drafts; the version and legal tests pass; lint and build pass; CI is green.
- `plan.md`, `CLAUDE.md`, `musteri-yonetimi.md`, `kullanim-kilavuzu.md`, `MVP.md` and `deployment.md` are updated as listed, without touching any file outside your owned paths.
- The PR (Turkish) lists the lawyer questions and states that `garden_changes_enabled` stays off on hosted projects until they are answered.
