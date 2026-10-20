# İP8 – Sahip Portalı v0.1

- **Klasör:** `apps/web/` içinde sadece şunlar:
    - `src/app/portal/**`, `src/components/portal/**`, `src/lib/portal/**`, `src/lib/media/**`, bunların testleri
    - `e2e/` altında `portal-*` adlı dosyalar
    - `src/lib/i18n/tr.ts`'ye sadece kendi anahtar bloğun
    - Aynı anda başka bir oturum uzman panelini (`/uzman`, `src/lib/expert/`) yazıyor ve migration ekliyor. Ortak bileşenleri (`src/components/*.tsx`: harita, ağaç paneli) değiştirmek yerine `components/portal/` altında sar ya da kopyala; PR'da yaz.
    - `package.json`'a yeni bağımlılık gerekirse ekleyebilirsin (Photo Sphere Viewer eklentileri gibi); PR'da yaz.
    - **Şema:** Gerekmemeli. Gerekirse `supabase/migrations/20261020140xxx_*.sql` ve `supabase/tests/12_*.test.sql`, ardından `pnpm web:typegen`. Seed'i değiştirme.
- **Okunacaklar:** `docs/gorevler/README.md` (ortak kurallar), `docs/MVP.md` Modül 5 (durum izleme portalı) ve Modül 4 (genel sınıf kuralı), `docs/veri-modeli.md` (yayımlama kuralı, son değerlendirme görünümleri), `apps/web/README.md`, `supabase/migrations/` (özellikle `..._latest_views`, `..._hide_unpublished_results`, `..._media_storage`), `supabase/demo/scans.sql`

## Amaç

Bahçesinden uzakta yaşayan sahip, son denetimin sonucunu tek ekranda görür ve kanıtına kadar iner: parsel karnesi → sağlık haritası → ağaç karnesi → fotoğraf geçmişi → 360° gezi. Sahip ve hissedar (`viewer`) aynı portalı kullanır. Sahip sadece **yayımlanmış** ziyaretleri görür. Bu kural veritabanında uygulanıyor; portal buna ayrıca güvenmez ama testle doğrular.

## Geliştirme verisi

`pnpm db:reset && pnpm db:demo` iki tarama ziyareti yükler: 14 Ekim (yayımlanmış) ve 18 Ekim (`in_review`; sahip görmemeli). Görüntü dosyaları depoda yok: kayıtlar var olmayan nesnelere işaret ediyor. Portal, dosya yoksa yer tutucu göstermeli. Testler bu veriye dayanmaz; kendi verilerini oluşturur (seed satır sayılarına dayanan başka testler var).

## Yapılacaklar

1. **Bahçelerim** (`/portal`): Mevcut listeye her parsel için son yayımlanmış ziyaret tarihi ve sınıf dağılımı (küçük bir çubuk).
2. **Parsel karnesi** (`/portal/parsel/[id]`):
    - Son yayımlanmış ziyaretin özeti: ağaç sayısı, sağlıklı / dikkat / sorunlu / kurumuş / yok.
    - Önceki yayımlanmış ziyarete göre değişim: kaç ağaç kötüleşti, kaç ağaç iyileşti.
    - Bulgular, öneme göre sıralı; tıklanınca ilgili ağaca gider.
    - Karnede görünen metriklerin özeti (`card_visibility = shown`).
    - Ziyaret geçmişi.
    - Dil sade olmalı: sahip ziraat mühendisi değil.
3. **Sağlık haritası:**
    - Ağaçlar son değerlendirmeye göre renkli. Renk `tree_latest_assessment` görünümünden gelir: önce en yeni ziyaret, aynı ziyarette kaynak önceliği.
    - Mevcut ağaç rengi kaynak gözetmeden en yeni değerlendirmeyi alıyor (`docs/plan.md`, açık işler). Portalda bunu düzelt; uzman ve ofis tarafındaki kullanım koordinatöre kalsın.
    - Renk açıklaması ve sınıfa göre filtre. Değerlendirmesi olmayan ağaç ayrı renkte.
    - Boş yerler ve bulgu konumları (parsel düzeyindeki bulgular dahil) haritada görünsün.
4. **Ağaç karnesi:** Haritada ya da listede ağaca tıklayınca açılır:
    - Kod (`S5-12a`), cins, aşı, yaş sınıfı, çeşit.
    - Son sınıf ve kimin verdiği (uzman / AI). Sahibe "uzman onaylı" ayrımı açıkça görünsün.
    - Ölçüm geçmişi, ziyaret ziyaret.
    - Fotoğraf geçmişi: her ziyaretin kesitleri, aynı yönden yan yana.
    - O ağaca ait bulgular ve öneriler.
5. **360° gezi:**
    - Photo Sphere Viewer ile son yayımlanmış ziyaretin panoramaları. Varsa önizleme (`pose.variant = preview`), yakınlaşınca tam çözünürlük.
    - Haritada bir noktaya tıklayınca en yakın panorama açılır. Panoramada komşu panoramalara geçiş okları.
    - Ağaç işaretçileri: Ağaç konumu, panoramanın konumu ve `heading_deg`'inden yön hesaplanır. Tıklanınca ağaç karnesi açılır. Kesme listesinde; zaman kalırsa ekle.
    - Panorama kuralı `services/pipeline/README.md`'de: orta sütun `heading_deg`'e bakar, azimut saat yönünde artar.
6. **Medya** (`src/lib/media/`):
    - `storage://media/<ad>` adreslerini imzalı adrese çeviren yardımcı. Toplu imzalama (`createSignedUrls`) ve kısa önbellek.
    - Dosya yoksa ya da imzalama reddedilirse yer tutucu.
    - Uzman paneli de sonradan bunu kullanacak; arayüzü sade tut.
7. **PDF rapor:** Kesme listesinde ilk sırada. Sadece yazdırma için CSS (tarayıcıdan "PDF olarak kaydet") yeterli. Zaman kalmazsa atla ve PR'da yaz.
8. **Telefon görünümü:** Sahiplerin çoğu telefondan bakacak. Karne, harita ve ağaç karnesi dar ekranda düzgün çalışmalı.
9. **Testler:**
    - Birim: Özet ve değişim hesapları, renk eşleme, panoramada ağaç yönü hesabı, medya adresi ayrıştırma.
    - Entegrasyon (yerel Supabase): Test, biri yayımlanmış biri yayımlanmamış iki ziyaret oluşturur. Kontroller:
        - Sahip ve hissedar sadece yayımlanmışı görüyor.
        - Başka parselin sahibi hiçbir şey görmüyor.
        - Yayımlanmamış ziyaretin dosyası imzalanamıyor.
    - Tarayıcı: Sahip olarak giriş → karne → haritada ağaç → ağaç karnesi; dar ekran boyutunda bir senaryo.
10. **README:** `apps/web/README.md`'ye "Sahip portalı" bölümü.

## Kabul ölçütü

- `pnpm web:lint`, `pnpm web:build`, `pnpm web:test`, `pnpm web:e2e` geçiyor. Migration eklendiyse `pnpm db:test` de.
- PR'da demo verisiyle ekran görüntüleri ya da kısa bir tarif: karne, harita, ağaç karnesi, gezi.
