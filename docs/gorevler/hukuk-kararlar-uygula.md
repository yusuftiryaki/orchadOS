# Apply the legal decisions (docs/hukuk/kararlar.md)

> **Orchestrator notes (28 Oct 2026). These take precedence over the brief below.**
>
> 1. Branch `claude/hukuk-kararlar-uygula` from `origin/main`. Open a PR with `gh api repos/yusuftiryaki/orchadOS/pulls ...` and write the description in Turkish. Never merge PRs, never push to main, never force-push.
> 2. The user ordered that the legal-expert agent's decisions be accepted as correct. Do not reopen them.
> 3. **Scope of this PR:** texts only, plus small UI/text wiring. That means `docs/hukuk/**`, `apps/web/src/lib/i18n/messages/legal.ts` and its tests, `apps/web/src/lib/legal/**`, the static legal and site pages that show these texts (for example a new `/bahcede-bulunanlar` page), the design docs' open-question sections, `docs/plan.md` and `CLAUDE.md` (T25).
> 4. **Do not write migrations or Edge Function changes in this PR.** İP14's integrated fix is touching `supabase/` right now, and the follow-up tasks T01–T26 will be implemented separately. If a text version bump needs a DB-side change (for example `customer_accept_quote` checking `text_version`), check that the DB doesn't hardcode the versions. If it does, list the change in the PR instead of making it.
> 5. Run `pnpm web:lint` and `pnpm web:test`, plus the e2e tests that cover sign-up and quote acceptance. Everything must pass and CI must be green.
> 6. In the PR, list which follow-ups (T..) still need code.

---

# Implementation brief: apply the legal decisions (docs/hukuk/kararlar.md, 28 Oct 2026)

You are one cloud coding agent working in the repository `yusuftiryaki/orchadOS`.

**Goal:** open ONE pull request that applies every text change and the small system changes decided in the accompanying decisions document. The decisions were made by a legal-expert AI agent at the user's instruction and are to be applied as final. Do not re-litigate them.

**Source of exact wording:** The decisions document (Turkish Markdown, provided alongside this brief) is the source of every Turkish clause referenced below by its H-number. Your first step is to commit it verbatim as `docs/hukuk/kararlar.md`. If you did not receive it, stop and report; do not invent legal wording.

## Ground rules

- Branch from `origin/main`, e.g. `claude/hukuk-kararlar`. One PR. Title: `docs(legal): apply legal decisions H01–H34 (kvkk-v2, riza-v2, gizlilik-v2, mesafeli-v3, onbilgi-v3, iade-v3)`.
- **No database migrations in this PR.** Every DB, Edge-function or cron change is a follow-up (T01–T26 in kararlar.md § Takip işleri). Do not implement those; only reference them.
- Do not edit `CLAUDE.md` (T25 is for the owner).
- Keep the repo's doc style: Turkish, short sentences, existing heading and table conventions.
- Keep every version name ending in `-taslak`; publication conditions are listed in kararlar.md § Yayın şartları.
- **Placeholders:** Remove every “[avukat …]”, “[Avukat: …]”, “Avukata not”, “[avukat/fiyat]” and “[avukat ve mali müşavir …]” marker where a decision covers it. Keep factual company placeholders such as [Adres], [KEP], [alanadi], [Tarih], [Telefon], [E-posta], [MERSİS], provider names in brackets, the bracketed 8/4 pilot business choice, and [3] in the vitrin consent.
- **Brackets that become plain numbers:**
  - 8A/2: 14
  - 12/3: 30 and 14
  - 12/2: 45
  - 12/4: 90
  - 8D/5: 30
  - 4/3: 15 iş günü
  - 12/1: 1 yıl
- **Validation:** Run the web unit tests (vitest in `apps/web`), the ai-worker tests (`uv run pytest` and `uv run ruff check . && uv run ruff format --check .` in `services/ai-worker`) and any repo lint scripts used by CI. CI must be green.

## A. Versions and archives (README "Eski sürümler" rule)

1. **Archive before editing.** Copy each current file to `docs/hukuk/arsiv/` before editing it. Use the same header note format as the existing `arsiv/*-v1.md` files: an "Arşiv" blockquote naming the version, saying it is frozen, and linking the current file. Files:
   - `kvkk-aydinlatma-metni.md` → `arsiv/kvkk-aydinlatma-metni-v1.md` (kvkk-v1-taslak)
   - `acik-riza-metni.md` → `arsiv/acik-riza-metni-v1.md` (riza-v1-taslak)
   - `gizlilik-cerez-politikasi-taslagi.md` → `arsiv/gizlilik-cerez-politikasi-taslagi-v1.md` (gizlilik-v1-taslak). Also append the demo paragraph exactly as `/gizlilik` showed it: the "Demo turu" block from `apps/web/src/lib/i18n/messages/demo.ts` `privacy`, placed before "5. Haklarınız", with a note that it was shown there.
   - `hizmet-sozlesmesi-taslagi.md` → `arsiv/hizmet-sozlesmesi-taslagi-v2.md` (mesafeli-v2-taslak)
   - `on-bilgilendirme-formu-taslagi.md` → `arsiv/on-bilgilendirme-formu-taslagi-v2.md` (onbilgi-v2-taslak)
   - `iptal-iade-politikasi-taslagi.md` → `arsiv/iptal-iade-politikasi-taslagi-v2.md` (iade-v2-taslak)
2. **Bump versions** in the source files' `**Sürüm:**` lines and in `apps/web/src/lib/legal/versions.ts`:
   - kvkk_notice: `kvkk-v2-taslak`
   - explicit_consent: `riza-v2-taslak`
   - privacy: `gizlilik-v2-taslak`
   - distance_sales: `mesafeli-v3-taslak`
   - pre_information: `onbilgi-v3-taslak`
   - refund_policy: `iade-v3-taslak`
   - new key `field_notice: "bahcede-v1-taslak"`

   Update `versions.test.ts` to match.
3. **Update draft headers.** In each changed draft, replace the "> **Taslak:** Avukat incelemesi için…" blockquote with: "> **Taslak:** Hukuki kararlar ([kararlar.md](kararlar.md)) uygulandı. Şirket bilgileri doldurulup [yayın şartları](kararlar.md#yayin) tamamlanınca sürüm adındaki "-taslak" eki kaldırılır." Add a one-line "**v3 (28 Ekim 2026)**" or "**v2 (…)**" change note listing the changed sections. Remove the İP14 note in İade about the "kendiliğinden düşer" gap.

## B. Edits to docs/hukuk sources (apply exact Turkish from kararlar.md)

### `hizmet-sozlesmesi-taslagi.md` (mesafeli-v3-taslak)

- **Intro:** add the premises-only paper sentence (H10).
- **Md. 1:** append the "Tacir Sahip" definition (H10).
- **Md. 2:** replace the second paragraph (H18).
- **Md. 4:**
  - 4/2 and 4/3 rewritten (H34).
  - 4/4: append the sentence that a critical-finding notice is not guarding or monitoring (H08).
- **Md. 5:**
  - 5/1 replaced (H09).
  - 5/4 replaced (H01).
  - New 5/6 (H32).
- **Md. 6:** replaced by 5 paragraphs (H07).
- **Md. 7/3:** replaced (H08).
- **Md. 8:**
  - 8/2 replaced (H24 + H29).
  - 8/3 replaced (H17).
  - 8/4 replaced by the template (H34).
- **Md. 8A:**
  - 8A/1–4 replaced (H15).
  - 8A/5 replaced and new 8A/6 (H21).
- **Md. 8B:**
  - 8B/1 (H13), 8B/2 (H11), 8B/4 (H11, including the reference to the separate checkbox).
  - 8B/5: remove the note and append the warning sentence (H11).
  - 8B/6 (H10).
  - Replace every "15/1-ğ" with "15/1-(h)".
- **Md. 8D:**
  - 8D/2: append (H19).
  - 8D/3: inventory sentence (H19).
  - 8D/5: brackets and note removed.
  - 8D/6: append (H19).
  - 8D/7: replaced (H13).
- **Md. 9:**
  - 9/2 replaced (H01).
  - 9/4 replaced (H32).
  - New 9/5 (H01).
- **Md. 10/3:** replaced (H31).
- **Md. 11:** replaced; 11/3 in bold (H08).
- **Md. 12:**
  - 12/1 (H34).
  - 12/2: note removed; add the paper-also sentence (H14) and the renewal-as-new-contract sentence (H13).
  - 12/3: restructured per H20 + H21.
    - Owner may terminate at any time; no default option; new "hemen" option.
    - Company just causes, notice and refund rule.
    - Pending-order sentence.
    - Refund formula (remainder method, rounding to the owner).
    - Earlier-refunds paragraph.
    - Used-visit additions (8A/3 counts as used; an unpublishable report does not).
    - Ended-line paragraph.
    - Examples keep their results.
  - 12/4: rewritten per H22 + H23 (all endings, reopening on renewal, access ≠ deletion, other owner, transfer).
- **Md. 13:** append (H15).
- **Md. 14:** replaced (H06).
- **Md. 15:** replaced (H10).
- **Md. 16:** replaced (H12).
- **Ekler:**
  - Ek-1: add sentences (H18).
  - Ek-4: description updated (H06).
  - New Ek-7: model withdrawal form (H11).

### `on-bilgilendirme-formu-taslagi.md` (onbilgi-v3-taslak)

- Header note (H13).
- §2: boundary sentence (H07).
- §3:
  - Add-on additions and rounding (H19).
  - Inventory 24-month rule (H19).
  - Last item replaced (H29).
- §4:
  - Invoice sentence (H17).
  - Payment-obligation sentence (H24).
  - Report deadline of 15 iş günü (H34).
  - Envanter after the withdrawal period unless early start is requested (H11).
- §5:
  - Notice channels, including post and the model form (H11).
  - Statutory-start sentence (H13).
  - Early-start item rewritten (H11).
  - Notes removed.
- §6: second item (H10).
- Before the final confirmation sentence, add the copy sentence; the confirmation sentence ends "teyit ederim." (H12).
- Append the model withdrawal form (H11).

### `iptal-iade-politikasi-taslagi.md` (iade-v3-taslak)

- §1: unpaid-order sentence (H24); add-on cancellation SMS and 14 days (H19).
- §2: rewritten on the H11 + H13 model (separate box; post and model form).
- §3: rewritten (H15 + H21).
- §4: first item (H20).
- §5:
  - Timing table: no default; new "Hemen" row.
  - Refund and used-visit bullets (H20).
  - Company-removal causes, short (H20).
  - Missed-visit sentence (H21).
  - Rename "Çıkıştan sonra" to "Hizmet bittikten sonra" and add the H22 + H23 sentences.
  - 24-month inventory rule on re-adding (H19).
  - "[30]", "[90]" and "[14]" become numbers.
- §6: "SMS ya da WhatsApp" becomes "SMS" (H06); full-amount, no-cost refund sentence (H29).

### `kvkk-aydinlatma-metni.md` (kvkk-v2-taslak)

- §2:
  - İletişim row note on WhatsApp (H02/H06).
  - Finans TCKN sentence (H16).
  - Kayıt güvenliği: "anahtarlı tek yönlü özeti (2 gün)" with phone and e-mail (H25).
  - New third-party row (H32).
  - Last paragraph replaced (H31).
- §3: purpose 3 replaced, purpose 6 replaced, new purpose 8 (H06, H31).
- §4: add row 8 and replace the paragraph under the table (H06, H16, H31).
- §5:
  - Domestic: expert/staff item (H05), Netgsm (H02), iyzico sentence (H16), co-owners line (H32).
  - Foreign: table and text (H02).
- §6: sentence (H32).
- §7: table and closing text (H25) plus the portal-access row (H22).
- §8: "Başvuru" replaced (H26).
- §9: replaced (H01).

### `acik-riza-metni.md` (riza-v2-taslak)

Replace the whole body with the H06 text. Title: "Açık Rıza ve Ticari Elektronik İleti Onayı Metni". One ☐. Items 1 and 2 removed (H02, H31).

### `gizlilik-cerez-politikasi-taslagi.md` (gizlilik-v2-taslak)

- §2 and §3 rewritten (H03).
- §4 hash sentence (H25).
- New "## 5. Demo turu" (H27).
- "Haklarınız" becomes "## 6.", "Değişiklikler" becomes "## 7.".

### New files

| File | Content |
| --- | --- |
| `docs/hukuk/bahcede-bulunanlar-aydinlatma-metni.md` | `**Sürüm:** bahcede-v1-taslak · [Tarih]`; sections 1–8 as listed in H01 (write full sentences from those bullets in the same style as the KVKK notice) |
| `docs/hukuk/calisan-aydinlatma-metni.md` | personel-v1-taslak; structure and mandatory sentences in H05 |
| `docs/hukuk/demo-vitrin-izni.md` | vitrin-v1-taslak; text in H28 |
| `docs/hukuk/kvkk-basvuru-proseduru.md` | internal; outline in H26 |
| `docs/hukuk/saklama-imha-politikasi.md` | internal; outline and table in H25 |
| `docs/hukuk/yurt-disi-aktarim-kaydi.md` | internal. Table columns: Sağlayıcı, Hizmet, Ülke/bölge, Aktarılan veri, Standart sözleşme modülü, İmza tarihi, Kurum'a bildirim tarihi, Durum. Rows: Supabase, Vercel, Cloudflare, Anthropic, bulut işleme (seçilmedi), e-posta/ofis sağlayıcısı (belirlenecek), all "bekliyor". Note: no real personal data goes to a provider until its row is complete; `ORCHADOS_AI_TRANSFER_SAFEGUARD` holds the AI provider's reference |

### `docs/hukuk/README.md`

- Replace the top blockquote with a note that decisions are in kararlar.md and that "-taslak" stays until § Yayın şartları is met.
- Add the new files to the table.
- Under "Avukata sorulacaklar", rename the heading to "Hukuki sorular (karara bağlandı)" and prefix each numbered question with "**Karara bağlandı:** [Hx](kararlar.md#hx) — <one-line decision>". Mapping:
  - 1→H01, 2→H02, 3→H04, 4→H05, 5→H06, 6→H07, 7→H08, 8→H09
  - 9→H10/H11/H12, 10→H14, 11→H15, 12→H16, 13→H03, 14→H17
  - 15→H18, 16→H13, 17→H19, 18→H20, 19→H21, 20→H11/H10, 21→H22, 22→H23, 23→H24
- Update "Bugünkü arşiv" to list all archived versions.
- Add the third-party-script rule (H03) and the VERBİS note (H04).

## C. Site mirror (apps/web)

1. **`apps/web/src/lib/i18n/messages/legal.ts`:** mirror the new texts for kvkk_notice, explicit_consent, privacy, distance_sales, pre_information and refund_policy.
   - Lawyer notes and drafting blockquotes stay out of the site.
   - Links must be public paths: `/kvkk`, `/acik-riza`, `/bahcede-bulunanlar`, `/gizlilik`, `/iade`, `/on-bilgilendirme`, `/mesafeli-satis`.
   - Update `source` strings (explicit_consent no longer says "2. ve 3. maddeler").
   - Add a `field_notice` document with source `docs/hukuk/bahcede-bulunanlar-aydinlatma-metni.md`.
   - Privacy now includes section "5. Demo turu" directly.
2. **`apps/web/src/app/(site)/gizlilik/page.tsx`:** remove the splice of `demoText.privacy`; render `legalText.privacy` like the other pages. Remove the `privacy` export from `demo.ts` (and its tests) if nothing else uses it.
3. **New route** `apps/web/src/app/(site)/bahcede-bulunanlar/page.tsx` using `LegalPage which="field_notice"` and `legalMetadata("field_notice")`. Add `/bahcede-bulunanlar` to `PUBLIC_PREFIXES` in `apps/web/src/lib/site/public-paths.ts` and to the sitemap if there is one. Optionally add a footer legal link.
4. **`demo.ts` `start.privacy`:** items 2–4 per H27.
5. **`legal.test.ts`:**
   - The explicit-consent test now expects exactly one ☐, contains "Tanıtım" and "İYS", and does not contain "Hizmetin geliştirilmesi", /yapay zekâ|Anthropic|yurt dışı/i.
   - Extend the "keeps in step with its draft" and "archives every earlier version" tests to kvkk_notice, explicit_consent, privacy and field_notice where they are mirrored whole. field_notice has no earlier version.

## D. Small code and UI changes

1. **Consent boxes (H06, H31).** Add `apps/web/src/lib/legal/consents.ts` exporting `MARKETING_CONSENT_ENABLED = false`, with a comment pointing to kararlar.md H06 and T22.
   - **Signup form** (`apps/web/src/app/(site)/kayit/signup-form.tsx`, `signup-state.ts`, `actions.ts`, `apps/web/src/lib/signup/*`):
     - Never render the service-improvement checkbox.
     - Render the marketing checkbox only when enabled. Its label is the H06 box text (SMS only).
     - Keep the Edge wire contract unchanged: still send `explicit_text_version` (now riza-v2-taslak) and both booleans, forced to `false` for disabled kinds server-side. It is accepted that signup_complete still writes granted=false rows.
     - Remove `explicitServiceImprovement` from `site.ts`. Update `explicitMarketing` to the H06 text. Change `explicitIntro` to "İsteğe bağlı izin (vermemeniz hizmeti almanıza engel değildir):".
   - **Portal** `apps/web/src/app/portal/hesap/izinler/page.tsx` and `billing-actions.ts` `setConsentAction`:
     - Show a kind's grant/withdraw section only if the kind is enabled (marketing when the flag is on; service improvement never).
     - If a disabled kind's latest record is granted, show it with the note "Bu izin artık sorulmuyor ve kullanılmıyor; isterseniz geri alabilirsiniz." and only a withdraw button.
     - Server-side: refuse granting a disabled kind (redirect with a new result code `consent_unavailable` and a Turkish message in `portal-billing.ts`); always allow withdrawal.
   - Update all affected unit and integration tests (signup validation and client tests, flags-off test, portal-billing tests, demo-actions test, etc.).
2. **Wording (H30, H24, H29, H09, H10, H32, H02, H06).** Exact Turkish in kararlar.md.
   - `portal-billing.ts`:
     - both `kvkkSubmit`: "Kaydet"
     - quote `kvkkBody`: "...Teklifi kabul etmeden önce metni okuyup kaydedin."
     - `kvkkOtherOrg` per H30
     - `accept`: "Teklifi kabul et (ödeme yükümlülüğü doğar)"; `acceptHint` per H24
     - `transferBody`: append the H29 fee note
     - `authorizationValues` and `entryPermission` per H09
     - `accessNoteHint` per H32
     - contact `preferences`: WhatsApp hint
   - `site.ts`:
     - signup `kvkk_notice.required`: "Devam etmek için aydınlatma metnini okuduğunuzu işaretleyin."
     - add a contact-preference hint "WhatsApp seçseniz de mesajlar şimdilik SMS olarak gönderilir." where the preference is chosen
     - "SMS ya da WhatsApp ile bağlantı" becomes "SMS ile bağlantı"
     - contact label "Telefon ve WhatsApp" becomes "Telefon"
   - `billing.ts`:
     - `consentKind.kvkk_notice`: "Aydınlatma metni (okundu teyidi)"
     - `explicit_service_improvement`: "Hizmetin geliştirilmesi için açık rıza (artık sorulmuyor)"
     - `explicit_marketing`: "Tanıtım iletileri için onay (açık rıza ve ticari elektronik ileti onayı)"
     - `billingPartyKind`: "Bireysel (kendi adınıza)" / "Şirket (tüzel kişi ya da ticari işletmeniz adına; unvan ve VKN ile)"
   - `back-office.ts`: the "SMS ya da WhatsApp gider" sentence becomes "SMS gider"; matching authorization-basis labels if duplicated.
   - `apps/web/src/lib/i18n/tr.ts` (ops):
     - `kvkk`: "Aydınlatma metni"
     - `kvkkConsent`: "Aydınlatma metni verildi (okundu teyidi)"
     - `kvkkConsentAt`: "Teyit tarihi"
     - `kvkkTextVersion`: "Aydınlatma metni sürümü"
     - `invitationsHint` per H30
   - Fix any tests asserting the old strings.
3. **Notification template guard (H06).** In `apps/web/src/lib/notifications/messaging.test.ts`, add a test that renders every template exported by `supabase/functions/_shared/messaging.ts` (report, account and garden templates and the login code) with sample vars and asserts that none matches /kampanya|indirim|fırsat|avantaj|hediye|yeni paket|tanıtım/i.
4. **ai-worker cross-border gate (H02).**
   - In `services/ai-worker/src/orchados_ai_worker/config.py`, add a way to tell whether a provider is cross-border:
     - `anthropic`: always.
     - `openai`: unless the `base_url` host is localhost, 127.0.0.1, ::1 or host.docker.internal.
     - Allow an explicit override field `cross_border: bool | None = None`.
   - In `cli.py` `_api()`: if the provider is cross-border, `--test-data-only` is not set, and the environment variable `ORCHADOS_AI_TRANSFER_SAFEGUARD` is empty, raise `ValueError` with a message explaining that, under KVKK md. 9, real orchard data may go abroad only after the provider's standard contract is signed and notified (see `docs/hukuk/yurt-disi-aktarim-kaydi.md`): set the variable to the contract reference or run with `--test-data-only`.
   - Keep the existing `may_train_on_requests` rule (test data only regardless).
   - Include the safeguard reference in the run report if easy.
   - Tests:
     - anthropic without the env var or flag → refused (exit 1, message mentions ORCHADOS_AI_TRANSFER_SAFEGUARD)
     - with the env var → allowed
     - local Ollama config → allowed
     - `--test-data-only` → allowed

     Injected fake APIs already bypass `_api`; keep existing tests green.
   - Update `services/ai-worker/README.md`: "Kişisel veri kuralı" (gate, eval data kept outside the repo with codes only) and the free-providers line ("…ve yalnızca standart sözleşmesi imzalanıp Kurum'a bildirilmiş sağlayıcıya").

## E. Design and ops docs

- **`docs/musteri-yonetimi.md`:**
  - §2 AI-transfer bullet replaced (H02).
  - "Hizmetin geliştirilmesi ve tanıtım rızaları kaydedilir…" bullet replaced (H31).
  - TCKN wording (H16) in §2/§16/§19.
  - "aydınlatma onayı" becomes "aydınlatma teyidi" (H30).
  - §19: email_taken note (H33), yenilenmeyen üyelik risk marked decided with T08 (H23), "Yapay zekâ aktarımının hukuki dayanağı" marked decided (H02).
- **`docs/bahce-yonetimi.md`:**
  - §2: "15/1-ğ" becomes "15/1-(h)"; withdrawal start decided (H13); removal options note (H20); "Veri silinmez" note (H25).
  - §1 and §19: mark the questions decided with links (H18–H23).
  - §16 Avukat row: "Karara bağlandı: hukuk/kararlar.md".
  - Do not change the user decisions.
- **`docs/MVP.md`:** KVKK step 6 (H02); "Saklama süresi sözleşmede yazılır" (H25); Owner row (H30); risk table "KVKK ve girme izni" mitigation becomes "Aydınlatma metni, yurt dışı aktarımda standart sözleşme, yazılı yetki ve giriş izni beyanı".
- **`docs/kullanim-kilavuzu.md`:**
  - §1 step 1 and the diagram (H30).
  - Step 4: remove the WhatsApp password line; add SMS or spoken delivery (H02).
  - Paper receipt template (H30); paper contracts only at the company's premises (H10).
  - Interim rule: no field work inside the withdrawal period until T03 (H11).
  - §3.1 visit notice at least 3 days before, with the field-notice link (H15/H01).
  - §3.2 sign text, ID card, spoken notice, owner-caused failure documentation (H01/H15).
  - §3.4 AI gate note (H02).
  - Ops removal only for listed causes with the reason noted, and revoke_all_access limits (H20/H22).
  - Refund-in-full rule (H29).
  - Period-end manual 8A check (H21).
  - Boundary-person and co-owner first-call script (H32).
  - v1 non-renewal SMS text (H14).
  - Avoid ops_terminate_order on real customers until T08 (H23).
- **`docs/demo-turu.md`:** §12 (H27); §7 vitrin rules and link to demo-vitrin-izni.md (H28).
- **`docs/teknik-mimari.md`:** "Her şey AB'de" option wording (H02); note the AI gate.
- **`docs/deployment.md`:** "Log saklama" pins the plans and states the privacy text says ≤30 days (update the text first if exceeded, H03/H25). Also:
  - production `NEXT_PUBLIC_MAP_STYLE_URL` must point to our own or proxied tiles (T12)
  - the unverified-account cleanup cron is mandatory (T09)
  - `ORCHADOS_AI_TRANSFER_SAFEGUARD` on the processing station
  - `garden_changes_enabled` may be opened only after kararlar.md § Yayın şartları plus T05 and T18
- **`docs/bulut-isleme.md`:** add "KVKK standart sözleşmesini değiştirmeden imzalaması (birinci ölçüt)" to provider selection (H02).

## F. Acceptance checklist

- [ ] `docs/hukuk/kararlar.md` committed verbatim.
- [ ] All six texts archived; the new versions appear in their source files, `versions.ts` and tests.
- [ ] No "[avukat" or "Avukata not" left in `docs/hukuk/*.md`, except inside `arsiv/` and `kararlar.md`.
- [ ] No "15/1-ğ" left outside `arsiv/` and `kararlar.md`.
- [ ] `/bahcede-bulunanlar` renders publicly.
- [ ] `/gizlilik` shows "5. Demo turu" from legal.ts.
- [ ] Signup and Hesabım › İzinler show no optional consent boxes while the flag is off; previously granted consents can be withdrawn.
- [ ] ai-worker refuses real data to Anthropic without the safeguard variable.
- [ ] All tests and CI pass.
- [ ] The PR body lists follow-ups T01–T26 and states that no migration is included.

## G. Follow-ups (do NOT implement)

T01–T26 as listed in kararlar.md § Takip işleri. In particular, these are larger DB, Edge or cron changes that need their own design and PR:

| Task | Scope |
| --- | --- |
| T03 | early_performance consent and scheduling guard |
| T04 | per-order contract PDF |
| T05 | removal "hemen", remainder refund, restricted reasons |
| T06 | period-end 8A reconciliation |
| T07 | visit_scheduled SMS and missed-visit reasons |
| T08 | 12/4 on all endings |
| T09 | retention cleanups |
| T11 | KVKK manual scripts |
| T13 | TCKN storage |
| T15 | invite SMS and first-login acknowledgement |
| T16 | boundary declaration |
| T18 | add-on breakdown and inventory reuse |
| T19 | account enumeration |
| T20 | image hide |
| T21 | production legal gate |

## Follow-ups (not in this PR; for reference)
- T01 (publication gate, URGENT; company action): sign the unchanged Kurul standard contract (controller→processor module) with Supabase, Vercel, Cloudflare, Anthropic (or the AI provider used), the chosen processing cloud and, if hosted abroad, the e-mail/office provider. Notify each to the Kurum within 5 business days of signing. Record it in docs/hukuk/yurt-disi-aktarim-kaydi.md. Only then set ORCHADOS_AI_TRANSFER_SAFEGUARD for real data. A provider that does not sign receives no personal data; if Supabase or Vercel refuse, move the private schema to Türkiye or to a provider that signs.
- T02 (before pilot): md. 12/2 processing contracts with Netgsm and with the expert if not an employee. Hand the personnel notice (personel-v1-taslak) to field staff and the expert, signed or recorded.
- T03 (publication gate, DB + web): consent_kind 'early_performance'. Optional unticked checkbox at quote acceptance, recorded with text version, source quote_acceptance and order id; add it via a separate RPC so customer_accept_quote keeps its signature. Without the record, block envanter and visit scheduling before withdrawal_until + 1. Apply removal-v1 withdrawal deductions only if the record exists. 'Cayma bildiriminiz alındı (C-…)' SMS. Ops entry of withdrawals received by post, e-mail or KEP, dated by notice arrival (overrides withdrawal_expired). Warning when other removal options are chosen inside the withdrawal period.
- T04 (publication gate): generate an order-specific PDF of the pre-information form and contract at every acceptance (first, add-on, renewal). Contents: parties, garden lines, totals, VAT, period, visit entitlement, last withdrawal day, version. Store in immutable private storage; record text_sha256 and the PDF id/hash in append-only storage. Add a Hesabım › Sözleşmelerim page (private, no-store) and a post-acceptance SMS link. Populate the pre-information screen with quote data. Add a test that each archive file matches its version text hash.
- T05 (before garden_changes_enabled): removal 'hemen' option (exit = tomorrow), and the form must have no default option. Change the removal-v1 refund to the remainder method so rounding cents go to the owner. Restrict ops removal reasons to the just causes (new enum values for breach, dispute, safety, out_of_area, region_exit), with the owner's written consent noted for agreed removals. In the removal flow, offer 'cancel the pending order and continue'.
- T06 (before first period end): when housekeeping completes an order, and at 'end of period' exits, open an ops task for lines with fewer periodic visits than the entitlement and no 8A refund or carry-over, with a 14-day deadline and an overdue warning.
- T07 (pilot; manual until done): visit_scheduled SMS template sent at least 3 days before each visit, including the /bahcede-bulunanlar link. Missed-visit record with reason (customer, company, weather, force_majeure) and evidence; the customer reason requires 'notified' and 'new date offered' flags. Count 8A/3 'deemed done' visits as used in the removal calculation. Field app: 'sign placed / spoken notice given' checklist saved on the visit.
- T08 (at least 30 days before the first service_end): apply the 12/4 read-only-then-revoke flow to orders completed without renewal, to ops_terminate_order and to pilot parcels made passive by ops. Reopen access if a renewal is paid within the access period.
- T09 (publication gate for the first four items): purge public.notification rows older than 12 months. Purge auth.sessions rows ended more than 30 days ago (or null their IP and user agent). Make the unverified-account cleanup cron mandatory in hosted projects via a deploy check. Guarantee demo GoTrue audit-log IP purge within 30 days. Delete the boundary person's phone at the end of access. Store the contract end date per parcel and owner for later retention calculations.
- T10 (before end of 2028): long-term destruction and anonymisation of panoramas and unused images (2 years after the contract), and of reports, identity and records (10 years). Periodic destruction at least every 6 months with a destruction log.
- T11 (scripts before pilot; form later): reviewed SQL scripts for KVKK erasure and pseudonymisation (owner_profile, parcel_detail contacts, questions, co-owner invites; pseudonymise append-only tables) that write audit events. Later a portal 'KVKK başvurusu' form with a 30-day ops task.
- T12 (publication gate): serve production map tiles from our own infrastructure (e.g. PMTiles) or a proxy. Set NEXT_PUBLIC_MAP_STYLE_URL accordingly; no direct browser requests to OSM. If Cloudflare will not sign the standard contract, replace Turnstile with a self-hosted proof-of-work check, keeping rate limits and fail-closed behaviour.
- T13 (before identity_number_required is enabled): either collect the TCKN at payment and forward it to iyzico without storing it (keep only the last 4 digits), or encrypt it at application or column level with the key outside the DB and Edge-only decryption. Add a TCKN pattern to the payment_event allow-list test. 'Written risk acceptance' is not allowed.
- T14 (process before the first paid order): the accountant issues an e-Arşiv or e-Fatura within 7 days of payment and the invoice number is noted on the payment. Ops dashboard tasks for invoices and refund correction documents. Later, an integrator API with the invoice shown in the portal.
- T15 (pilot): co-owner invite SMS with the notice link and 'your number was given by the garden owner'. First-login notice acknowledgement screen for co-owners and ops-created owners. Mandatory owner declaration checkbox in the invite form ('Bu kişinin bahçede hakkı var ve numarasını vermeye yetkiliyim').
- T16 (pilot): show the declaration text on the boundary approval screen and record its version and time append-only. Keep who showed the boundary (name, role) in the inventory record. Boundary wording on every PDF page and on the map. Ops 'boundary dispute / suspension' reason.
- T17 (before any real garden enters the demo showcase): export tool excludes frames with people by default, with a per-frame approval list, blur fallback, EXIF/XMP strip, location shift and neighbour/TKGM layers off. It refuses to run without a recorded vitrin consent (version, scope). Withdrawal runbook: remove from demo-media and the demo DB and purge the CDN within 30 days.
- T18 (before garden_changes_enabled): numeric breakdown and remaining window names on the add-on quote screen and PDF. Ops warning when entitlement exceeds the remaining windows. Setting inventory_reuse_months = 24, checked in pricing-v2. SMS on order_closed add-on cancellation with refund within 14 days.
- T19 (before public self-service launch): remove email_taken and phone_registered disclosure. A registered phone gets the same 'code sent' flow; an e-mail collision gets a generic message; response timing is similar. Add a deploy check that rate limits are enabled.
- T20 (pilot): ops function to hide a panorama or crop from portal views on a data subject's objection, without deleting it, written to the audit log. A developer handles requests manually until then.
- T21 (publication gate): in hosted production, customer_accept_quote and ops paper-contract registration fail with 'legal_texts_not_final' if any required text version ends in '-taslak' or a company field is empty (title, MERSİS, address, phone, e-mail, KEP, tax office or number). Read company info from one setting used by the pre-information form, contract PDF, receipt and site footer. Demo and dev environments are exempt.
- T22 (company/human actions): fill in the company details (sicil title, MERSİS, address, phone, e-mail, KEP, tax office and number, domain). ETBİS registration. İYS registration and integration (upload consents within the legal period, sync refusals), then set MARKETING_CONSENT_ENABLED and re-ask marketing consent. iyzico written confirmation of the '11111111111' placeholder. Yearly VERBİS threshold check (employees, balance sheet). Professional liability insurance. Send the non-renewal SMS to v1 paper pilot owners. Decide the pilot pricing for contract 8/4. If the company seat is not Gaziantep, update Md. 15/2. Identify the e-mail/office provider (abroad → T01). Confirm Netgsm sends service SMS as informational (non-commercial) messages.
- T23 (verify before pilot): the approving expert's name and title appear on published reports, the PDF and the portal; owners cannot see staff GNSS tracks; on multi-owner parcels, Q&A and owner-specific data are visible only to the asking owner's side; a transfer-type removal sends the 'download your reports' SMS before exit; Hesabım › Bahçelerim lists removed gardens with their exit dates. Fix any gaps.
- T24 (only if needed): an off-premises-compliant paper contract version (6502 md. 47: written form, copy handed over, model withdrawal form, no payment during the withdrawal period). Until then, paper contracts are signed only at the company's premises.
- T25 (Yusuf): update the 'veri silinmez' rule in CLAUDE.md to 'sözleşme, erişim ve saklama süresi içinde silinmez; süre dolunca silinir ya da anonim hale getirilir' (kararlar.md H25).
- T26 (optional): local person detection so panorama crops showing people go only to the expert queue, not to the foreign AI provider. Extra minimisation only; it does not replace the standard contract.
