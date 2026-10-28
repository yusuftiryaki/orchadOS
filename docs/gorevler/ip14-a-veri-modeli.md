# İP14-A Veri modeli ve sözleşmeler: üyelik dönemi, ek teklif (pricing-v2), bahçe çıkarma

> **Orchestrator notes (28 Oct 2026). These take precedence over the brief below.**
>
> Task file: `docs/gorevler/ip14-a-veri-modeli.md`. Wave 1. Design: `docs/bahce-yonetimi.md` (on main).

1. **Base.** Branch from `origin/main`. İP12 and İP13 are fully merged there, including #66 and #67. The repo is now **public**: never commit secrets, real data or personal data.
2. **No dependencies.** You run in parallel with the other wave-1 stream.
3. **Parallel work.** İP14-B on `claude/ip14-hukuk-dokumanlar` Never touch another stream's owned paths.
4. **Branch.** Push to `claude/ip14-veri-modeli`. If the session forces a different branch name, state it in the PR and in your final message.
5. **PR.** Open a PR against `main` with `gh api repos/yusuftiryaki/orchadOS/pulls -f head=... -f base=main ...` (`gh pr` is blocked). Write the description in Turkish. **Never merge a PR, never push to main, never force-push.**
6. **Autonomy.** Ask no questions. Where the brief leaves a choice, pick the recommended or most conservative option and list it in the PR.
7. **Time.** Run only the test suites that matter. Run commands that take longer than 10 minutes in the background.
8. **Final message.** Give the branch, the PR URL, the commits, each test command with its pass/fail counts, any deviation from the design doc's contracts, and the follow-ups.

---

> **Orchestrator notes (28 Oct 2026). These take precedence over the brief below.**
>
> Wave 1. Design doc: `docs/bahce-yonetimi.md` (on main, version 2). Its public names, signatures, return columns, error codes and notification texts (§6, §7, §9, §10) are binding. Where this brief and the doc differ, the doc wins; say so in the PR.

1. **Base.** Create branch `claude/ip14-veri-modeli` from the latest `origin/main` (at least `8ce1252`: all of İP12 and İP13, #66 and #67 merged). `scripts/check-migration-order.sh` is on main and runs in CI; run `scripts/check-migration-order.sh origin/main` before every push.
2. **Parallel stream.** Stream B (`claude/ip14-hukuk-dokumanlar`) edits legal drafts and docs at the same time. Streams C (portal) and D (back office) start after you merge and build on your contracts, so keep every public name exactly as written. If you must deviate, say so prominently in the PR and in section 20 of the design doc.
3. **PR.** Open a PR against `main` with `gh api repos/yusuftiryaki/orchadOS/pulls -f title='İP14-A: …' -f head=claude/ip14-veri-modeli -f base=main -F body=@<file>` (`gh pr` is blocked). Write the description in Turkish. Follow your session's commit and PR attribution rules. **Never merge a PR, never push to main, never force-push.** If your branch is already pushed, merge `origin/main` into it instead of rebasing. The repository is public now and GitHub Actions run on PRs: wait for the CI run of your branch (`gh api 'repos/yusuftiryaki/orchadOS/actions/runs?branch=claude/ip14-veri-modeli'`) and report its result.
4. **Autonomy.** Ask no questions. Where the brief leaves a choice, pick the recommended or most conservative option and list it in the PR.
5. **No Docker?** If Docker or the local Supabase does not start, run the unit tests, lint and build, open the PR anyway and let CI verify. Say so in the PR.
6. **Time.** Run only the test suites that matter while iterating. Run commands longer than 10 minutes in the background. Before the PR, run the full `pnpm db:test` and `pnpm web:test`.
7. **Scope cut line (doc §9.13).**
    - MUST: the schema (incl. `application_garden.withdrawn_at`) and every error code; pricing-v2; the coverage and period helpers; the service-period reads; add-on quotes (application and parcel paths); `ops_link_application_garden_parcel`; `ops_garden_overlaps` with containment and intersection; the accept, payment, due-date and activation changes; `ops_terminate_order`, `ops_set_parcel_passive`, `ops_orders`, `ops_billing_summary`, settings; removal, refunds, completion, housekeeping, guards, notifications, drift; the web contract files and test helpers.
    - SHOULD (only if time allows): `customer_revise_order`, `customer_withdraw_application_garden`, `ops_withdraw_application_garden` and their `quoted/accepted → submitted` transitions; the 200 m proximity part of `ops_garden_overlaps` (return `distance_m` null when cut).
    - Anything cut goes into the PR and into §20 under `Teslim edilmeyenler`; streams C and D hide the matching buttons.
    - Work in two milestones on the same branch: M1 = migrations 120000–120200 + regenerated types + contract files, committed and pushed; M2 = 120300 + removal tests. One PR at the end.
8. **Final message.** Report: branch, PR URL, commits, each test command with pass/fail counts, the CI result, any deviation from the design-doc contracts, what was cut, and follow-ups (including whether you created migrations after `20261102120300`, so the CLAUDE.md pointer can be fixed).

---

## Context
- Repo `yusuftiryaki/orchadOS`: an independent audit service for pistachio orchards: a Next.js owner portal and back office (`apps/web`), Supabase (`supabase/`), and a Python pipeline.
- **Read first:** `CLAUDE.md`; `docs/bahce-yonetimi.md` (all of it); `docs/musteri-yonetimi.md` §5 and §6 (function pattern, lock order, error codes, audit, column grants); `docs/demo-turu.md` §6 (demo guards).
- **Binding rules from CLAUDE.md:** owner PII stays in the `private` schema and is never sent to an LLM; media is immutable; measurements are versioned; migrations are fix-forward with increasing timestamps (never edit an existing migration); every new table calls `select private.attach_demo_guard('<table>')`, and a table holding a user id also calls `private.attach_demo_account_guard(...)`; docs are Turkish, code, identifiers, comments and commits English.
- **Existing code you build on (read these):**
    - `20261030100100_billing_tables.sql`: tables, `service_order_item_guard`, `quote_guard`, `audit_event` CHECK, `document_sequence`, `next_document_number`, column grants.
    - `20261030100400_catalog_applications.sql`: applications, `check_application_package`, `ops_billing_setting` (`setof public.org_billing_setting`), `ops_save_billing_setting`, `ops_verify_application_garden`, `cancel_open_quote`.
    - `20261030105200_pricing.sql`: `price_lines`, `price_preview`, `ops_preview_quote`.
    - `20261030105300_quotes_orders.sql`: `write_quote`, `supersede_open_quote`, `ops_issue_quote`, `ops_issue_parcel_quote` (catches unique_violation as `state_changed`), `customer_accept_quote`, `cancel_order`, `ops_extend_payment_due`, `ops_terminate_order` (line 781), lock helpers.
    - `20261030105400_payments.sql` (`write_payment_items`, `complete_payment`, `ops_record_manual_payment`, `ops_resolve_payment_review`) and `20261101100000_payment_begin_buyer_email.sql` (the latest `payment_begin` body).
    - `20261030105500_refunds.sql`: `refund_room`, `insert_refund`, `open_system_refund`, `ops_request_refund` kind rules (manual refunds and voids carry no payment item).
    - `20261030105600_order_activation.sql`: `activate_order`, `create_customer_parcel` (returns early for a garden that already has a parcel).
    - `20261030105700_ops_billing_views.sql`: `ops_billing_summary`, `ops_orders` (renewal_due), `private.user_ref`.
    - `20261030105800_billing_cron.sql`; `20261030105100_billing_notifications.sql` (`notification_ref_once`, vars check allows `parcel_name`, `date`, `path`, `ref`).
    - `20261024120000_parcel_lifecycle.sql` (`ops_set_parcel_passive`, `parcel_lifecycle_status`, `guard_passive_parcel_visit` is API-only and insert-only), `20261024120100_viewer_invitations.sql` (`invited_by`; `ops_resolve_viewer_invitation` inserts viewers without `granted_by`, so the column defaults to the ops user), `20261024120200_followup_requests.sql` and `20261025120100_pipeline_rescan_request.sql` (`kind 'extra_visit'`, `origin`, `target_session_id`), `20261023130100_questions.sql`, `20261021210000_inventory_approval.sql` (`create_verification_tour`, security definer).
    - `20261101120000`–`20261101120300` (demo: `assert_not_demo`, `is_demo_org`, `authz.is_demo_account`, `attach_demo_guard(s)`, `attach_demo_account_guard`, the demo version of `enqueue_billing_notification`, `demo_guard_drift`).
    - `supabase/testing/purge.sql` (`_delete_by`, `purge_billing_users` with `session_replication_role = replica`).

## Goal
Deliver the whole database layer of İP14, the generated types, the shared web contract files (error codes, column lists, status labels, notification templates, the ops and payments error lists) and the test helpers that streams C and D will use. No UI.

## Common rules
- İP12 function pattern: `security definer`, `set search_path = ''`, schema-qualified names, `comment on function`, `revoke all … from public, anon, authenticated` then explicit grants.
- Errors carry short codes with a field-only `detail`. Every transition is a conditional update raising `state_changed` when the row moved. Every transition writes `private.audit` with an explicit actor and role. An ops write on the caller's own record is `forbidden`.
- **Lock order:** application → quote → advisory `customer_gardens:<user_id>` → advisory `parcel_coverage:<parcel_id>` (parcel id order) → order(s) (id order) → garden_removal → payment(s) (id order) → refund. Advisory locks use `pg_advisory_xact_lock(hashtextextended('<name>:' || id, 0))`.
- A unique violation of `garden_removal_open_uq` is caught and raised as `garden_removal_open`.
- Today is `private.istanbul_today()`. A visit day is `coalesce((started_at at time zone 'Europe/Istanbul')::date, planned_date)`.
- Every replaced function is copied from its latest body on main and changed only as listed.

## Migrations (range `20261102120000`–`20261102129999`, after `20261101120300`)
1. **`20261102120000_garden_notification_enum_values.sql`:** `alter type public.notification_template add value if not exists` for `garden_removal_scheduled`, `garden_removal_rescheduled`, `garden_removal_cancelled`, `garden_removal_completed`, `garden_access_ending`. A separate file, because an added enum value cannot be used in the transaction that adds it.
2. **`20261102120100_garden_membership_schema.sql`:** exactly doc §9.2–§9.5:
    - the two enums; the five `org_billing_setting` columns; `quote.addon_of_order_id` and `service_order.addon_of_order_id` with their checks and indexes; `application_garden.withdrawn_at`;
    - `service_order_item.removed_on`, `garden_removal_id`, the pair check and `unique (id, order_id)`; `refund.garden_removal_id`;
    - the table `public.garden_removal` with the DDL of §9.4: `revoke_all_access`, `blocked_reason`, refund modes `unused_visits|withdrawal|duplicate|manual|none`, `cancelled_by` incl. `system`, the composite FKs `(order_id, customer_user_id, org_id)` and `(order_item_id, order_id)`, every check, the partial unique `garden_removal_open_uq`, the indexes; then the FKs from `service_order_item` and `refund`;
    - triggers `garden_removal_touch_updated_at` and `garden_removal_guard`: no DELETE; the immutable columns of §9.4; on an open row `blocked_reason`, `revoke_all_access` and the scheduling columns may change; on a completed or cancelled row only `access_notice_sent_at`, `access_revoked_at`, `updated_at`; `requested_by` and `decided_by` may be unlinked (`private.only_unlinks_users`);
    - `service_order_item_guard` recreated: no DELETE; `parcel_id` null→value once; (`removed_on`, `garden_removal_id`) null→value once, together; nothing else;
    - `'C'` in `document_sequence.kind` and `next_document_number` (same signature); `'garden_removal'` in the `audit_event.entity_type` check;
    - RLS and grants: policy `garden_removal_select`; revoke all from `anon` and `authenticated`; select on every column except the internal ones `ops_note`, `requested_by`, `decided_by`, `blocked_reason`, `revoke_all_access`; add the new columns to the grants of `quote`, `service_order`, `application_garden`, `refund`; no API writes;
    - demo guards: `attach_demo_guard('public.garden_removal')`, `attach_demo_account_guard('public.garden_removal', 'customer_user_id')`.
3. **`20261102120200_garden_addons.sql`:** pricing-v2, coverage and period helpers, service-period reads, add-on quotes, link, overlaps, (SHOULD) withdraw and revise, and the replaced quote, accept, payment, due-date and activation functions, plus `ops_orders`.
4. **`20261102120300_garden_removals.sql`:** removal functions, refund calculation and rows, completion, housekeeping and cron, read-only and visit guards, `ops_terminate_order`, `ops_set_parcel_passive`, `ops_billing_summary`, settings functions, `enqueue_garden_notification`, the drift function.

## Private helpers (names recommended; doc §9.6)
- `addon_visits(V smallint, p_start, p_period_start, p_period_end) returns smallint`, immutable: `least(V, greatest(1, round(V * (p_period_end - greatest(p_start, p_period_start) + 1)::numeric / (p_period_end - p_period_start + 1))))`.
- `price_lines_v2(p_org_id, p_package_id, p_areas_m2 numeric[], p_inventory boolean[], p_visits smallint, p_discount_bp default 0, p_on default null)`: the columns of `price_lines`; up to 50 areas; `visit_amount = round(visits * tenths * unit / 10)`, `minimum = round(minimum_fee * visits / V)`, inventory fee only where `p_inventory[i]`; `line_base = greatest(visit_amount, minimum) + inventory`; discount and VAT as in v1. Errors `invalid_input` (areas, inventory, visits, discount_bp), `no_price_list`, `package_not_priced`. With `p_visits = V` and every flag equal to v1's `first_year` it equals `price_lines` exactly (test it).
- `parcel_served_on(p_parcel_id, p_day) returns boolean`: a line of an `active` order with `service_start <= p_day <= service_end` and `removed_on` null or `> p_day`.
- `parcel_in_service(p_parcel_id, p_from, p_to, p_exclude_order_id default null) returns boolean`: (a) an active line whose `[service_start, coalesce(removed_on - 1, service_end)]` overlaps; (b) an `awaiting_payment` order (not excluded) with a line for the parcel (`quote_item.parcel_id` or a linked `application_garden.parcel_id`) whose intended period overlaps: add-on [greatest(coalesce(quote start, today), today), base end], otherwise [coalesce(proposed start, today), +1 year −1 day].
- `lock_parcel_coverage(uuid[])`; `account_garden_count(org, user, from, to)` (distinct parcels in service or on awaiting-payment orders in the window, plus unlinked garden lines of awaiting-payment orders).
- `addon_base_order(org, user) returns public.service_order`: among active base orders with `service_end - greatest(today, service_start) + 1 >= addon_min_days`, the one with the smallest `greatest(today, service_start)`, then the latest `service_end`, then id.
- `addon_last_day(o) returns date` = `o.service_end - addon_min_days + 1`. `withdrawal_until(o) returns date` = `(o.activated_at at time zone 'Europe/Istanbul')::date + 14`, used by `my_gardens`, the preview and the request.
- `renewal_due(o, p_notice) returns boolean`: `o` is an active base order with `service_end < today + p_notice`; no renewal order in awaiting_payment/active/completed; and at least one parcel served on `o.service_end` through `o` or its active add-ons that has no open removal and is not `parcel_in_service(p, o.service_end + 1, o.service_end + 1)`.
- `write_addon_quote(...)`: the v2 sibling of `write_quote`. It holds `price_list:<org>` and prices with one fixed day. `inputs` = the v1 keys + `formula='pricing-v2'` + `addon {base_order_id, base_order_number, period_start, period_end, service_start, remaining_days, period_days, visits_per_year, visits, addon_last_day}` + `areas[].inventory`, `areas[].parcel_id`. Also `first_year = bool_or(inventory)`, `addon_of_order_id`, `proposed_service_start = start`, `valid_until = least(today + valid_days, addon_last_day)`. It audits `quote.issued` with `addon_of_order_id` and sends `quote_ready`.
- `parcel_read_only(p_parcel_id) returns boolean`: a `completed` removal on the parcel with `access_revoked_at` null **and** `not parcel_served_on(p, today)`. It does not depend on `parcel.status`.
- `removal_calculation(p_removal_id, p_effective_on) returns jsonb`: formula `removal-v1`, doc §7.1–7.2 exactly.
    - **Affected lines:** the customer's lines on the parcel in `active` or `completed` orders with `removed_on` null and `service_end >= effective_on`. Lines that end before the effective day are not affected.
    - **Per line:** `amount`, `inventory_share`, `service_amount`, `entitled = quote_item.visits`.
    - **`used`:** distinct Istanbul days of `periodic_scan` sessions in captured/processed/in_review/published with visit day in [service_start, removed_on − 1], excluding sessions that are the `target_session_id` of an `extra_visit` followup_request in planned/done (`visits_excluded`), capped at `entitled`.
    - **Other per-line values:** `inventory_done` (an inventory session captured or later in the same range); `visit_fee = floor(service_amount / entitled)`.
    - **Gross by mode:** `unused_visits` = (unused = entitled ? service_amount : unused × visit_fee) + (inventory_done ? 0 : inventory_share); `withdrawal` = amount − (inventory_done ? inventory_share : 0) − used × visit_fee; `duplicate` = amount − used × visit_fee.
    - **`already_refunded`:** refunds in requested/processing/succeeded on payment items with `order_item_id` = the line, plus item-less refunds (no item or the balance item) on the order's payments except reasons `overpayment` and `provider_mismatch`. A single-line order takes all of them. A multi-line order takes the pro-rata share `round(Σ × amount / total)` and is flagged `unattributed`.
    - **Result:** `refund = max(0, gross − already_refunded)`, `refund_vat = round(refund × vat_bp / (10000 + vat_bp))` with the frozen `quote.vat_rate_bp`.
    - **Modes:** `withdrawal` (the removal's flag, requested line only), `duplicate` (reason), `unused_visits` (default; a paid future renewal line comes out whole); `manual` when the setting is manual or any line is unattributed (compute, open nothing); `none` for amount 0 or no affected line.
    - **Shape:** the JSON of doc §7.2. No PII.
- `open_removal_refunds(p_removal_id) returns integer`: per line with a refund, walk the order's `succeeded` payments newest first (locked in id order). The item is the payment_item of the line, else the balance item, up to `refund_room`. The kind follows the `ops_request_refund` rules (manual for a transfer; void for a card, full amount, same day; else refund). Call `insert_refund(…, reason 'withdrawal' in withdrawal mode else 'termination', note 'garden_removal:<C-…>', actor null, role 'system')`, then set `refund.garden_removal_id`. A remainder goes to `calculation.unallocated_kurus`.
- `complete_garden_removal(p_removal_id, p_actor, p_role) returns boolean`. Steps (doc §5.3):
    1. Lock `parcel_coverage:<parcel>`, then the affected orders plus the customer's awaiting_payment orders containing the parcel (id order), then the removal. Return false unless it is open and due. A `requested` row is first scheduled on `requested_effective_on` with `access_until = effective_on + access_days`.
    2. Pending orders: cancel each with no money kept and no live attempt via `private.cancel_order(o, null, 'system', 'garden_removed', null)`. Otherwise set `blocked_reason = 'pending_order'`, audit `garden_removal.blocked` once and return false.
    3. Mark the affected lines (`removed_on = greatest(effective_on, service_start)`). With no affected line: when the requested line's order is terminated or cancelled, cancel the removal (cancelled_by 'system', ops_note 'order_terminated'); otherwise complete it with mode none.
    4. Store `calculation`, `refund_mode` and `refund_kurus`.
    5. Unless `parcel_served_on(parcel, effective_on)` through another line: cancel **every** `planned` session of kind inventory/periodic_scan/verification regardless of `planned_date`; cancel open and planned followup_requests (`resolved_at = now()`); cancel pending viewer_invitations; set the parcel `passive`. Record the counts.
    6. Set status `completed`, clear `blocked_reason`, and open refunds unless the mode is manual or none.
    7. Terminate emptied orders as system (`all_gardens_removed`, audit `order.terminated`): an add-on whose lines are all removed; a base only when its lines and all lines of its active add-ons are removed (those add-ons too). Then cancel that base's awaiting-payment add-ons with no money kept, and cancel its issued add-on quotes (audit `quote.cancelled`, reason `base_closed`).
    8. Audit `garden_removal.completed` with the details of doc §9.9 and send `garden_removal_completed` (path `/portal/parsel/<parcel_id>` when `access_days > 0`, else `/portal`).
- `garden_removal_housekeeping() returns jsonb` `{scheduled, completed, blocked, cancelled, access_notices, access_revoked, access_resumed}`:
    - complete due rows;
    - send `garden_access_ending` once when `access_until - 7 <= today < access_until` and `access_days >= 14`;
    - when `access_until <= today` and `access_revoked_at` is null, apply doc §5.4:
        - if the parcel is served today by a line of the same customer, delete nothing, set `access_revoked_at` and audit `access_revoked {removed: 0, reason: 'resumed'}`;
        - otherwise delete the customer's own owner row, the viewers they invited (approved `viewer_invitation.invited_by` = customer, or `parcel_access.granted_by` = customer), every viewer when no other owner remains, and everyone when `revoke_all_access` (ignored when the parcel is served by another customer's line); then set `access_revoked_at` and audit `{removed_user_ids, kept, reason: 'expired'}`.
    - Schedule it with `cron.schedule('garden-removal-housekeeping', '30 0 * * *', 'select private.garden_removal_housekeeping()')`.
- `enqueue_garden_notification(p_template, p_org_id, p_user_id, p_ref_id, p_ref, p_path, p_parcel_id) returns integer`: a sibling of `enqueue_billing_notification`, which you must not replace. It has the same demo filter, vars `{ref, path, parcel_name}` and sets `notification.parcel_id`.

## Public functions
The binding signatures, return columns and errors are in doc §9.6. Grants go to `authenticated`; `anon` gets nothing new. Customer writes start with `perform private.assert_not_demo();`. Key behaviors:
- **Customer reads:** `my_service_period()` (one row per current base order; a paid renewal folds into `next_*`; `is_primary` on exactly one row; `period_count`; `addon_*` from `addon_base_order`; `garden_count` = distinct parcels served today). `my_gardens()` (one row per parcel: the line covering today, else the earliest future line, else the latest line closed by a removal with access still open; `state`, `next_order_item_id`, `in_next_period`, `withdrawal_until` via the helper, `visits_used` as in §7.1). Also `parcel_service_status(p_parcel_id)` and `customer_addon_preview(p_areas_m2)`.
- **Removal preview:** `customer_garden_removal_preview(p_parcel_id, p_at_period_end default false, p_withdrawal default false)`.
- **`customer_request_garden_removal(p_parcel_id, p_reason, p_note default null, p_at_period_end default false, p_withdrawal default false) returns uuid`:**
    - takes the parcel lock;
    - raises `parcel_order_pending` when the parcel is on an awaiting_payment order of the customer;
    - `p_withdrawal` requires today <= `withdrawal_until(order)` (else `withdrawal_expired`), and both flags together are `invalid_input` (withdrawal);
    - the effective day is today for withdrawal, `service_end + 1` at period end, else `least(today + removal_notice_days, service_end + 1)`; if only a paid future renewal line exists, that line with effective = its start;
    - audits `garden_removal.requested`; no SMS.
- **`customer_cancel_garden_removal`.**
- **SHOULD:** `customer_withdraw_application_garden`, `customer_revise_order`.
- **Ops reads:** `ops_customer_service_period`, `ops_customer_gardens` (the same columns as `my_*`), `ops_garden_overlaps`.
- **`ops_link_application_garden_parcel`:** parcel lock; `parcel_not_reusable` when the customer has neither owner access nor a past line, or when their latest completed removal of the parcel has reason `transfer`; `parcel_in_service` for [today, today + 1 year].
- **SHOULD:** `ops_withdraw_application_garden`.
- **`ops_preview_addon_quote`.**
- **`ops_issue_addon_quote`:** customer lock, then parcel locks; `parcel_in_service` over [start, base end]; `account_garden_limit` (50); `parcel_not_reusable` for transfers on the parcel path; `addon_period_too_short` when start > `addon_last_day`.
- **Removal queue and preview:** `ops_garden_removals` (with `blocked_reason`, `revoke_all_access` appended); `ops_garden_removal_preview` (adds `pending_orders`, `access_scope`, `blocked_reason`).
- **`ops_request_garden_removal(…, p_revoke_all_access default false)`:** parcel lock; `parcel_order_pending`; `access_days` below the setting only with reason transfer or duplicate or a note; audits from/to access days; sends `garden_removal_scheduled`.
- **`ops_schedule_garden_removal(…, p_revoke_all_access default null)`:** a null parameter keeps the value; the same access rule. The first confirmation sends `garden_removal_scheduled` (ref_id = removal id); a later date change sends `garden_removal_rescheduled` with a fresh `gen_random_uuid()` ref_id recorded as `change_id` in the audit.
- **`ops_cancel_garden_removal`:** the note is required; sends `garden_removal_cancelled`.
- **`ops_complete_garden_removal`:** `removal_not_open`, `removal_not_due`, `state_changed`, or `parcel_order_pending` when blocked.

## Replaced with the same signature (doc §9.6 table)
- `private.price_lines`: the area cap goes from 10 to 50; `price_preview` follows.
- `ops_preview_quote` and `ops_issue_quote`: skip withdrawn gardens. `ops_issue_quote` takes parcel locks for linked gardens and checks `parcel_in_service` and `account_garden_limit`.
- `ops_verify_application_garden`: `garden_withdrawn`.
- `ops_issue_parcel_quote`:
    - the parcel cap is 50; an add-on order as renewal target gives `invalid_input` (renewal_of_order_id);
    - customer and parcel locks;
    - `parcel_in_service` (detail parcel_ids) for [start, +1y−1] on renewals and first orders alike;
    - `garden_removal_open` (detail parcel_ids) for open removals with `coalesce(effective_on, requested_effective_on) <= start`;
    - `parcel_not_reusable` for transfers; `account_garden_limit`.
- `customer_accept_quote`:
    - for an add-on: the base must be active and today <= `addon_last_day`, else `addon_base_closed`; copy `addon_of_order_id`; `payment_due_at = least(now + due days, (addon_last_day + 1)::timestamp at time zone 'Europe/Istanbul')`;
    - for every quote: customer and parcel locks, then re-check `parcel_in_service` (excluding nothing; the new order does not exist yet) and `account_garden_limit`;
    - `garden_removal_open` when a quoted parcel has an open removal of the customer, or a non-cancelled removal requested after `quote.issued_at`.
- `payment_begin` (copy the `20261101100000` body):
    - `garden_removal_open` when a line's parcel has an open removal of the customer;
    - `addon_base_closed` for an add-on whose base is not active or when today > `addon_last_day`.
    - Add both codes to `BEGIN_STATUS` (409) in `supabase/functions/_shared/payments/handlers.ts` and its test.
- `ops_record_manual_payment`: `garden_removal_open` only. It does not check the add-on timing: a received transfer is always recorded, and activation decides.
- `ops_extend_payment_due`: for an add-on, `p_due_on > addon_last_day` gives `invalid_input` (due_on).
- `private.activate_order`:
    - **Add-on whose base is not active, or today > `addon_last_day`:** do not activate. Update the order to `cancelled` (cancel_reason `addon_base_closed`) directly, call `open_system_refund(payment, room, 'order_closed')` for every succeeded payment with room (payments locked in id order), audit `order.activation_refused` and return false.
    - **Otherwise:** start = `greatest(coalesce(proposed, today), today)` and end = base end for an add-on.
    - **For every line:** insert owner access when missing; set a passive parcel to `parcel_lifecycle_status`; set `access_revoked_at` on the same customer's completed removals of the parcel whose access is still open (audit `garden_removal.access_closed`, reason `resumed`).
    - **For a linked garden:** upsert `private.parcel_detail` from `private.application_garden_detail`. When the parcel has no `field_survey` boundary and the rough boundary differs from the latest, insert a new `owner_declared` boundary version (lock `boundary:<parcel>`, version = max + 1).
- `ops_terminate_order`:
    - read the order, collect the base plus its add-ons, lock them in id order and re-check;
    - for a base: terminate the active add-ons (audit each, reason `base_terminated`), cancel the awaiting add-ons with no money kept, and cancel the issued add-on quotes;
    - cancel the open removals on the terminated orders' lines whose parcel has no line on another active order (cancelled_by `system`, no SMS);
    - the existing termination of the order itself stays.
- `ops_set_parcel_passive`: resuming a parcel where `parcel_read_only` holds gives `parcel_removed`.
- `ops_billing_summary` (drop and create): `renewals_due` via `renewal_due` (and still excluding issued renewal quotes); append `garden_removals_requested`, `garden_removals_due` (open, effective <= today + 7) and `garden_removals_blocked`; grant again.
- `ops_orders` (drop and create): `renewal_due` via `renewal_due` (false for add-ons); append `addon_of_order_id uuid`; grant again.
- `ops_billing_setting` and `ops_save_billing_setting`: the five keys with their ranges and defaults.
- `next_document_number` (`'C'`), `service_order_item_guard`, `demo_guard_drift`.

## Triggers (doc §9.8)
- **`private.guard_parcel_read_only()`,** which raises `parcel_read_only` (P0001), on:
    - `question` and `question_reply` (insert and update): API users who are not expert or ops of the org;
    - `parcel_access` (insert): API users who are not ops;
    - `private.viewer_invitation` (insert): every role.
- **`session_guard_removal`** `before insert or update of planned_date, status` on `session`: API users; kinds inventory, periodic_scan and verification; new status `planned`.
    - (a) An open removal exists and `planned_date >= coalesce(effective_on, requested_effective_on)` → `parcel_removal_scheduled`.
    - (b) `parcel_read_only` → `parcel_passive`.
- Document in a comment that security-definer paths (`create_verification_tour`) bypass the guard, like the existing passive guard.

## Error codes (P0001 unless noted)
- **New:** `no_membership`, `addon_period_too_short`, `addon_base_closed`, `parcel_in_service`, `parcel_not_reusable`, `account_garden_limit`, `garden_withdrawn`, `last_garden`, `not_revisable`, `not_in_service`, `garden_removal_open`, `parcel_order_pending`, `withdrawal_expired`, `removal_not_open`, `removal_not_due`, `garden_changes_closed`, `parcel_read_only`, `parcel_removal_scheduled`, `parcel_removed`.
- **Existing:** `demo_read_only` (42501). `too_many_gardens` stays only for the 10-per-application limit.
- **Where they go:** add all of them to `BILLING_ERRORS` with Turkish texts in `billingText.errors` (for `account_garden_limit`: `Hesabınızda aynı anda en fazla 50 bahçe hizmet alabilir; daha fazlası için bizimle iletişime geçin.`). Also add `parcel_removal_scheduled` and `parcel_removed` to `OpsError`/`KNOWN` in `lib/operations/mutations.ts` and `ERRORS` in `lib/operations/urls.ts`, with Turkish texts in `tr.ts` next to `parcel_passive`.

## Notifications (doc §10)
- Five templates go through `enqueue_garden_notification`. Texts start with `orchadOS:` and use `{parcel_name} adlı bahçenizin…`. Without a parcel name, fall back to `bahçenizin` / `bahçeniz`. No dates, amounts or reasons.
- In `supabase/functions/_shared/messaging.ts`: `AccountTemplate`, `ACCOUNT_REF_PREFIX` `C`, and the rendering with the optional parcel name. Test with and without the name. Add Turkish labels to `tr.ts`.

## Web contract files you own
- **`database.types.ts`:** regenerate with `pnpm web:typegen`.
- **`lib/billing/columns.ts`:** a new `garden_removal` list (the granted columns only) and the new columns in `quote`, `service_order`, `service_order_item`, `application_garden`, `refund`, `org_billing_setting`.
- **`lib/billing/errors.ts` and `messages/billing.ts`:** the codes and texts above; labels for removal statuses, reasons (customer and ops), refund modes and `my_gardens.state`.
- **`lib/billing/types.ts`:** types if useful.
- Keep `pnpm web:lint` green. If new enum values break exhaustive records outside your files, report them.

## Seed and test helpers
- **`seed.sql`:** `garden_changes_enabled = true` for the local org.
- **`supabase/testing/purge.sql`:** add `union all select id from public.garden_removal where customer_user_id = any(p_user_ids)` to `v_entities` in `purge_billing_users`. The rows themselves are removed by the generic `_delete_by('customer_user_id', …)`; replica mode also disables FK triggers, so no special order is needed.
- **New test functions:** `testing.run_garden_removal_housekeeping() returns jsonb` and `testing.set_order_period(p_order_id, p_start, p_end) returns void`.
- **Purge test:** `27_testing_purge` asserts that no garden_removal row and no garden_removal audit row remain.
- **`apps/web/tests/local-db.ts`:** `runGardenRemovalHousekeeping()`, `setOrderPeriod(orderId, start, end)`.
- **`billing-fixture.ts`:** `activeOrderFor(customer, areasM2?)`, `addonOrderFor(customer, baseOrderId, areasM2?)` (paid via `ops_record_manual_payment`).
- **`e2e/billing-helpers.ts`:** `activeMember(email, password?) → { userId, orderId, parcelIds }`, `opsAddonQuote(applicationId, baseOrderId) → quoteId`, `removalFor(email, password, parcelId, opts?: {atPeriodEnd?, withdrawal?, complete?}) → removalId`. Streams C and D rely on these; document them in comments.

## Tests (doc §14 lists every case; all are required)
- **New pgTAP files:** `45_garden_addons.test.sql`, `46_garden_removals.test.sql`, `47_garden_security.test.sql`. Cover in particular:
    - two overlapping base orders (`my_service_period` rows, `is_primary`, `addon_base_order`);
    - a paid renewal gives one `my_gardens` row with `in_next_period = true`;
    - activation refusal with an `order_closed` refund; the `payment_begin` and `ops_extend_payment_due` caps;
    - the `ops_terminate_order` cascade; `ops_orders.renewal_due` and `addon_of_order_id`;
    - prior refunds: a `missed_visit` refund on the item, a single-line item-less transfer refund, a multi-line unattributed refund (→ manual), and the period-end exclusion;
    - a pipeline rescan that does not reduce the refund; same-day scans counted once;
    - inventory share refunded when no inventory was done; `duplicate`; withdrawal on day 14 accepted and on day 15 refused;
    - `parcel_order_pending` on request; pending-order cancellation and blocking at completion; the `payment_begin` and `ops_record_manual_payment` `garden_removal_open` path (set up the open removal and the pending order with triggers off);
    - all planned visits cancelled regardless of date, with the counts;
    - the guards on insert and update of `planned_date` and on question updates; `parcel_removed` from `ops_set_parcel_passive(false)`;
    - the access scope (own row and invited viewers; another owner kept; sole owner → all viewers; `revoke_all_access`);
    - re-add, re-invite a viewer, pass `access_until` → the viewer is kept (`resumed`);
    - the VAT split; the `rescheduled` and `cancelled` notifications; the short-access rule;
    - the doc §6 and §7 examples reproduced.
- **Update:** `00_schema`, `23_notifications` (if it enumerates templates), `26_parcel_lifecycle`, `27_testing_purge`, `30_billing_schema` (enum labels), `31_billing_rls` (the function grant list; the internal-column assertion with garden_removal `ops_note`, `requested_by`, `decided_by`, `blocked_reason`, `revoke_all_access`), `32_applications_quotes`, `33_orders_payments`, `34_refunds`, `35_billing_security`, `36_billing_notifications_audit`, `40_payment_begin_in_review`, `42_payment_begin_buyer_email`, `43_demo_write_guard`, `44_demo_account_lockdown`.
    - Before replacing `ops_issue_parcel_quote`, run `git grep -n ops_issue_parcel_quote supabase/tests apps/web/tests`.
    - `34_refunds` (q2, q3) and `36_billing_notifications_audit` (q2, q3) issue non-renewal parcel quotes for an already active parcel, which the new coverage rule refuses. Rebuild those fixtures with separate parcels or as renewals, without weakening any assertion.
    - Adapt every overlapping case in the files you own; report any in files you do not own.
- **Integration (`apps/web/tests/integration/garden-membership-db.test.ts`):**
    - the full flow;
    - `Promise.all` of `ops_complete_garden_removal` and housekeeping → one completion, one refund set, one notification;
    - `Promise.all` of two accepts holding the same parcel → one `parcel_in_service`;
    - two concurrent removal requests → one `garden_removal_open` (not a raw 23505);
    - accept a renewal → the removal request gives `parcel_order_pending` → cancel the order → request and complete → the cancelled order cannot be paid.
    - Also update `billing-columns.test.ts`, and `billing-db.test.ts` if a shape changed.
- **Unit:** `messaging.test.ts`, `lib/payments/handlers.test.ts`, the billing error mapping, and the `lib/operations` error lists.

## Commands
```
pnpm install
pnpm db:start && pnpm db:reset
pnpm db:test
pnpm web:typegen
pnpm web:lint
pnpm web:test
pnpm web:build
scripts/check-migration-order.sh origin/main
```

## Docs
- `docs/veri-modeli.md`: a short İP14 section (Turkish).
- `docs/bahce-yonetimi.md`: append `## 20. Uygulama notları` (Turkish) with deviations, private helper names, `Teslim edilmeyenler`, and the name of your last migration file. Do not edit sections 1–19.
- `supabase/README.md`: only if commands changed.

## Acceptance criteria
- All migrations apply on a fresh `pnpm db:reset`; `pnpm db:test` is fully green; the migration-order check passes; CI is green.
- `pnpm web:lint`, `pnpm web:test` and `pnpm web:build` pass with the regenerated types.
- Every MUST public function exists with the exact signature, return columns and grants of doc §9.6; `anon` cannot execute any new function.
- `select * from private.demo_guard_drift()` returns no rows after `select private.attach_demo_guards()`.
- The price parity test passes; the doc §6 and §7 examples are reproduced in tests.
- No existing migration file is modified; no file outside your owned paths is changed.
- The PR (Turkish) lists the migrations, functions, error codes, the helpers for C and D, test counts, the CI result, deviations, the cut items and human steps (none expected beyond enabling the switch on hosted projects).
