# Yüz Bulanıklaştırmayı Üründen Kaldır

- **Klasör:**
    - `services/pipeline/`, `services/ai-worker/`
    - `supabase/tests/24_ai_preassessment.test.sql`, gerekirse
    - `docs/` altındaki `.md` dosyaları; `docs/gorevler/` hariç, orası geçmiş kaydı
    - `CLAUDE.md`
- **Dokunma:** `apps/` (orada "bulanık" kelimesi fotoğraf netliği demek; o kalite kontrolü kalır), seed, migration'lar.
- **Okunacaklar:** `docs/gorevler/README.md` (ortak kurallar), `services/pipeline/README.md`, `services/ai-worker/README.md`, `docs/arayuzler.md` ("Asset `pose` alanı").

## Karar (21 Ekim 2026)

Yüz bulanıklaştırma üründen tamamen çıkarıldı; ertelenmiş bir iş değil. Ürün sahibinin kararı: ihtiyaç yok. Bunun sonucu olarak:
- Panoramalar ve kesitler bulanıklaştırma şartı olmadan yüklenir.
- Ağaç kesitleri bu şart olmadan AI'a gönderilir.

## Yapılacaklar

1. **İşleme hattı:**
    - Bulanıklaştırılmamış görüntüyü reddeden yükleme kuralını, `--allow-unblurred` seçeneğini ve ilgili uyarıları kaldır.
    - `ImageFilter` arayüzü başka bir iş için kullanılmıyorsa onu da kaldır; kullanılıyorsa yüz bulanıklaştırmayla ilgili kısmını kaldır.
    - `outputs.json` ve `pose` içindeki `filters_applied` alanı: Sadece bu amaçla eklendiyse kaldır, değilse boş bırak. Kararını yaz.
    - Testleri buna göre güncelle; bulanıklaştırma kuralının testleri silinir.
2. **AI worker:**
    - Kesitleri `filters_applied` içinde `face_blur` şartıyla süzen kuralı kaldır; bütün kesitler gönderilir.
    - **Yakın plan fotoğrafları** v0.1'de yine gönderilmez. Gerekçe artık bulanıklaştırma değil, kapsam: yakın plan analizi sonraki sürümde. README'deki gerekçeyi buna göre düzelt.
    - Kişisel veri kuralı aynen kalır: sahip adı, telefon, parsel adı, köy ve soru metinleri istemlere girmez.
    - Testleri güncelle.
3. **Dokümanlar:** "Yüz bulanıklaştırma" ve "bulanıklaştırılmamış" geçen her yeri düzelt:
    - `docs/MVP.md` Modül 1, KVKK maddesi: "Görüntülerde çıkan kişilerin yüzleri bulanıklaştırılır" cümlesini kaldır. Yerine: "Görüntülerde kişiler görünebilir; bu, aydınlatma metninde belirtilir."
    - `docs/MVP.md` Modül 4: işleme hattının "Hazırlık" adımı.
    - `docs/teknik-mimari.md`: KVKK bölümü ve işleme adımları.
    - `docs/metodoloji.md` Ek A: referans fotoğraf notu.
    - `docs/kullanim-kilavuzu.md`: 2.2 ve 3.4 bölümleri.
    - `docs/plan.md`: açık işlerdeki bulanıklaştırma maddeleri; ayrıca "Karar (21 Ekim): yüz bulanıklaştırma üründen kaldırıldı" satırı.
    - `docs/arayuzler.md`: `filters_applied` anlatımı.
    - `CLAUDE.md`: ilgili satır varsa.

## Kabul ölçütü

- `services/pipeline`: `uv run ruff check`, `uv run ruff format --check` ve `uv run pytest` geçiyor; Supabase testleri atlanmıyor.
- `services/ai-worker`: lint ve testler geçiyor.
- `pnpm db:test` geçiyor.
- `docs/gorevler/` ve `apps/` dışında `grep -ri "bulanıklaştır\|face_blur\|unblurred"` sonuç vermiyor; varsa nedeni PR'da yazılı.
