# İP12-A2 Teklif, sipariş, ödeme, iade, aktivasyon, bildirim ve ops fonksiyonları

> **Orchestrator notes (27 Oct 2026). These take precedence over the brief below.**
>
> Task file: `docs/gorevler/ip12-a2-siparis-odeme-db.md`. Wave 2. Design: `docs/musteri-yonetimi.md`.

1. **Base branch.** The design doc and these task files live on `docs/ip12-musteri-yonetimi` (PR #52), which may not be merged to main yet. Wherever the brief says to branch from, rebase on, or read the design doc from `origin/main`, use `origin/docs/ip12-musteri-yonetimi` instead. If PR #52 is already merged, `origin/main` is fine. Do not stop because the doc is missing on main.
2. **Dependencies are NOT on main.** The brief says your dependency streams are "merged on main"; they are not (a human merges later). After branching, run `git fetch origin` and `git merge --no-edit` each of these into your branch, in this order (no rebase, no force-push). Resolve conflicts yourself, keeping every contract in the design doc. If one is missing, stop and report it:
   - `origin/claude/ip12-veri-modeli` (ip12-db-core)
   - `origin/claude/ip12-odeme-saglayici` (ip12-payments)
   Wherever the brief tells you to read "A1's migrations on main" etc., read them from your merged branch.
3. **Branch.** Push to `claude/ip12-siparis-odeme-db`. If the session forces a different branch name, use it and state it in the PR and in your final message.
4. **PR.** Open a PR against `main` through the REST API (`gh api repos/yusuftiryaki/orchadOS/pulls -f head=... -f base=main ...`; see `docs/gorevler/README.md` §9). Write the description in Turkish and mention the PRs you depend on. **Never merge a PR, never push to main, never force-push.**
5. **Autonomy.** Ask no questions. Where the brief leaves a choice open, pick the recommended or most conservative option and list it in the PR.
6. **Time.** Run only the test suites that matter for your stream. Do not run the Python pipeline suite (11 min). Run commands longer than 10 min in the background.
7. **Final message.** Give the branch, the PR URL, the commits, each test command with its pass/fail counts, any departure from the design doc contracts, and open follow-ups.

---

BRANCH = `claude/ip12-siparis-odeme-db`. Wave 2. İP12-A1 (all tables, grants, sign-up, catalog and application functions, `config.toml`), İP12-B (payment Edge Functions and `_shared/payments/db.ts`) and İP12-C (site) are merged on main.

You add the remaining functions on A1's tables. Wave 3 (portal and back office) builds UI on you. Do NOT add or alter tables, except the notification changes in §6.5.

## Working rules (all İP12 streams)
- **Design doc.** The design is `docs/musteri-yonetimi.md` on main and is the source of truth.
  - If it is missing on `origin/main`: make an empty commit, push, open a draft PR `BLOCKED: docs/musteri-yonetimi.md missing on main`, and stop.
  - Do not edit it.
- **Repo and branch.** Repo `github.com/yusuftiryaki/orchadOS`. Branch from the latest `origin/main` (or the assigned `claude/...` branch). Rebase before the PR.
- **Read first:**
  - `CLAUDE.md`
  - the design doc (§4–§6, §8.4–§8.6, §12, §14)
  - A1's migrations `20261030100000`–`20261030104999`
  - `supabase/functions/_shared/payments/db.ts` (B's contract and key constants)
  - the existing notification migrations (`20261023140000_notification_queue.sql` and the next two)
  - `20261021220000_operations_screens.sql`
- **Language.** Code, comments and commits are in English; docs are in Turkish.
- **Function rules.** Same as A1, §6.1:
  - `security definer`, `search_path = ''`, comments.
  - `revoke all ... from public, anon, authenticated`, then explicit grants. anon gets only `public_package_prices` and `price_preview`; service_role only for `payment_*`.
  - Validate before insert and catch check violations: errors carry codes and field names, never values.
  - Explicit audit actor and role.
  - Self-dealing refusal: `forbidden` when `customer_user_id = auth.uid()` in every `ops_*` write on a customer entity.
- **No dependencies.** Do not ask questions; write the decisions in the PR. Never touch mustNotTouch paths. If a `lib/billing` change is needed, describe it in the PR.
- **Setup:** `cat /tmp/orchados-session-start.log; docker info; pnpm install; pnpm db:stop; pnpm db:start && pnpm db:reset`. Use `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io` if pulls fail.
- **Fallback** if Docker or Supabase will not start: run `pnpm web:lint && pnpm web:build && pnpm --filter web test:unit`, open the PR anyway, watch `ci-db-web` via `gh api repos/yusuftiryaki/orchadOS/actions/runs?branch=BRANCH` and the job logs until green, and note in Test özeti what did not run.
- **CI order:** `pnpm db:reset && pnpm db:test && pnpm web:typegen && git diff --exit-code apps/web/src/lib/database.types.ts && pnpm web:lint && pnpm web:build && pnpm web:test && pnpm db:test && pnpm db:reset && pnpm web:e2e && pnpm db:test`. Commit the types.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **PR** via `gh api repos/yusuftiryaki/orchadOS/pulls -f title='...' -f head=BRANCH -f base=main -F body=@pr-body.md`. Turkish body with: Ne yapıldı, Kararlar, Test özeti, Eksikler / bilinen sorunlar, Sözleşmeden sapmalar. Last line: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Scope

1. **Migrations** `20261030105000`–`20261030109999`, new files with English header comments. Suggested split:
   - `105000_billing_notification_enum_values.sql`: the five `add value` lines only.
   - `105100_billing_notifications.sql`: §6.5 (`notification` columns, checks, vars whitelist, `notification_ref_once`), `private.enqueue_billing_notification`, and drop + recreate `ops_notifications` with a left join and a `ref` column, re-granted.
   - `105200_pricing.sql`: `private.price_lines`, `public_package_prices`, `price_preview`, `ops_preview_quote`.
   - `105300_quotes_orders.sql`: `ops_issue_quote`, `ops_issue_parcel_quote`, `customer_accept_quote` (requires the latest granted `kvkk_notice`, otherwise `consent_required` detail `kvkk_notice`), `customer_decline_quote`, `customer_cancel_order`, `ops_cancel_order`, `ops_extend_payment_due`, `ops_terminate_order`, `customer_payment_instructions`.
   - `105400_payments.sql`: the `payment_*` functions, `ops_record_manual_payment`, `ops_void_manual_payment`, `ops_resolve_payment_review`, `receipt_data`.
   - `105500_refunds.sql`: `private.open_system_refund`, `ops_request_refund`, `ops_can_process_refund`, `ops_complete_manual_refund`, `ops_cancel_refund`, `ops_resolve_refund`, `payment_refund_claim`, `payment_refund_report`.
   - `105600_order_activation.sql`: `private.activate_order`, `private.create_customer_parcel` (copy the logic of `register_parcel` and `add_owner_declared_boundary`; leave those two unchanged).
   - `105700_ops_billing_views.sql`: `ops_billing_summary` (including `signup_attempts_24h`), `ops_customers`, `ops_billing_internal`, `ops_orders`, `ops_payments`, `ops_payment_events`, `ops_refunds`, `ops_audit_events`.
   - `105800_billing_cron.sql`: `private.billing_housekeeping` (quote expiry, the reminder once, completion, deleting `payment_event` rows with a null `payment_id` older than 7 days), `private.dispatch_payment_reconcile` (Vault `payments_reconcile_url` + `orchados_cron_secret`, header `x-orchados-cron-secret`), and the two pg_cron jobs.
2. **Correctness rules (mandatory):**
   - **Lock order** application → quote → order → payment → refund, with `select ... for update`.
     - Any function that changes an order's money or status locks the `service_order` row first. Functions starting from a payment read its `order_id` unlocked, then lock the order, then the payment.
     - `customer_accept_quote` and `ops_issue_quote` both lock the application, then the quote.
     - Every transition is `update ... where id = $1 and status = '<expected>' returning`; no row → P0001 `state_changed`.
   - **`payment_finalize`** (§5.4):
     - idempotent on terminal rows
     - compares against the payment row
     - SUCCESS + mismatch → `pending_review` plus a system `void` refund with reason `provider_mismatch` (refund base = `provider_amount_kurus`)
     - success on a cancelled, terminated or completed order → a full `order_closed` refund
     - the excess over the total → an `overpayment` refund
     - refuses a fake success unless `allow_fake_payments` (`fake_payments_disabled`)
     - activates when `paid_kurus >= total_kurus`
   - **`payment_begin`:**
     - refuses `fake` unless `allow_fake_payments`
     - supersedes live attempts
     - returns `identity_number` as the real value only when `identity_number_required`, otherwise `'11111111111'`
     - writes NO snapshot
   - **`payment_attach_token`** writes the masked snapshot (`identity_number_last4`). `ops_record_manual_payment` writes one too.
   - **Cancellation** (`customer_cancel_order`, `ops_cancel_order`) returns `payment_in_progress` while a live attempt exists (§5.3). `ops_record_manual_payment` refuses with the same code.
   - **`payment_attempts_to_reconcile`** includes `expired` rows with `token_expires_at + 10 min > now()`.
   - **Refunds** (§5.5):
     - lock the payment
     - ceiling = amount + Σ(requested, processing, succeeded) ≤ base, per payment and per item, re-checked on a retry claim
     - `payment_refund_claim` rejects `kind = 'manual'`
     - `payment_refund_report` and `ops_resolve_refund` transition only from the allowed states, and increment `refunded_kurus` exactly once, keyed to the conditional update
     - `ops_resolve_refund(p_succeeded => true)` on a card refund requires `p_provider_ref`
     - a successful `void` sets the payment to `voided` (from `succeeded` or `pending_review`)
   - **`payment_record_event`** refuses `p_signature_valid = false`.
3. **Notifications and web.**
   - `_shared/messaging.ts`: the five templates and `ref`, with the exact Turkish texts in §12.
   - `send-notifications`: adjust only if it validates templates.
   - `tr.ts`: only the five labels under `notifications.template` ('Teklif hazır', 'Başvuru sonucu', 'Ödeme alındı', 'İade yapıldı', 'Ödeme hatırlatma').
   - `lib/notifications/data.ts`: `NotificationRow` gains `ref: string | null`; `parcelId` and `parcelName` become nullable.
   - `components/operations/notification-table.tsx`: show `ref` when there is no parcel.
   - Extend `messaging.test.ts` and `notifications.test.ts`.
4. **pgTAP** (start each file with `testing.reset_to_seed()`):
   - `32_applications_quotes`: pricing, including the 20-dönüm example = 1200000; supersede and accept; expiry.
   - `33_orders_payments`: activation and parcel creation; idempotency (3 calls → 1 receipt and 1 audit row); mismatch; closed order; overpayment; live-attempt cancel refusal; the manual payment refusal; reconcile selection; fake locks.
   - `34_refunds`: ceilings with concurrent-style sequences; manual claim refusal; report only from `processing`; the once-only increment; `ops_resolve_refund` provider_ref.
   - `35_billing_security`: every new function's grants; anon only the two; `payment_*` service_role only; every `ops_*` security definer; self-dealing refusals; customer `select ops_note` gives 42501.
   - `36_billing_notifications_audit`: the template checks, `notification_ref_once`, the `ops_notifications` left join, and `jsonb_object_keys(payment_begin(...))` and `payment_refund_claim(...)` equal to the key lists in §6.9 and B's `db.ts`.
   - Update `00_schema` (enum values, functions if listed) and `23_notifications`.
5. **Integration tests.**
   - `billing-db.test.ts`, as the customer (`signInCustomer` from fixtures) and as ops@:
     - draft → garden → submit → verify → quote → accept → manual payment → active → parcel with owner access → refund request and complete
     - a CONCURRENCY test: two clients run `payment_finalize` (service role, on a fake card attempt) and `ops_record_manual_payment` with `Promise.all`, repeated; assert a single activation and consistent `paid_kurus`, and that the overpayment refund exists when both succeed
     - clean up with `purgeBillingUsers`, `purgeParcels` and `deleteUser`
   - `payments-contract.test.ts`: call B's merged Edge `payments` `{action:'start'}` with return_origin `http://127.0.0.1:3100` as a fresh customer, then POST `payment-callback` with fetch (no cookies, `redirect: 'manual'`, token + `outcome=success`). Expect 303 and a succeeded payment. Fix contract drift on your side; report any drift on B's side in the PR.
6. **Docs.** Append the function summary to `docs/veri-modeli.md`.

## Contracts you provide
All A2 functions in §6.9 with exact names, parameters and returns, the §6.10 codes, §12, and `ops_notifications.ref`.

## Acceptance criteria
- CI is green and the types are committed.
- The contract test with B's functions passes.
- The concurrency test passes.
- No PII appears in errors, logs or audit details.
