# İP7 – Uzman Paneli v0.1

- **Klasör:** `apps/web/` içinde sadece şunlar: `src/app/uzman/**`, `src/components/expert/**`, `src/lib/expert/**`, bunların testleri ve `e2e/` altında `expert-*` adlı dosyalar. `src/lib/i18n/tr.ts`'ye sadece kendi anahtar bloğunu ekle.
    - Aynı anda başka bir oturum sahip portalını (`/portal`) ve `src/lib/media/` klasörünü yazıyor. Ortak bileşenlere (`src/components/*.tsx`), `src/lib/supabase`, `src/lib/auth` ve `package.json`'a dokunma. Ortak bir şey gerekiyorsa kendi klasörüne kopyala ve PR'da yaz; birleştirmede koordinatör birleştirir.
    - **Şema:** `supabase/migrations/20261020130xxx_*.sql` ve `supabase/tests/11_*.test.sql`. Bu ad aralığının dışına çıkma; seed'i değiştirme. Migration ekledikten sonra `pnpm web:typegen` ile `database.types.ts`'yi yeniden üret ve commit'le.
- **Okunacaklar:** `docs/gorevler/README.md` (ortak kurallar), `docs/MVP.md` Modül 4 (değerlendirme akışı) ve Modül 3 (ziyaret türleri ve ölçekler), `docs/veri-modeli.md` (ölçüm, değerlendirme, bulgu; kaynak önceliği; yayımlama kuralı), `apps/web/README.md`, `supabase/migrations/`, `supabase/demo/scans.sql`

## Amaç

Uzman (ziraat mühendisi) bir tarama ziyaretinin sonuçlarını uzaktan inceler: her ağacın bu ve önceki ziyaretteki kesitlerine bakar, AI ön değerlendirmesini kabul eder ya da düzeltir, ölçekleri girer, bulgu ve öneri yazar, sonunda raporu imzalayıp yayımlar. Yayımlanana kadar sahip hiçbir sonucu görmez (veritabanı kuralı zaten var).

## Geliştirme verisi

`pnpm db:reset && pnpm db:demo` iki tarama ziyareti yükler: 14 Ekim (yayımlanmış, uzman değerlendirmeli, bulgulu) ve 18 Ekim (`in_review`, sadece AI ön değerlendirmeleri). Görüntü dosyaları depoda yok: kayıtlar var olmayan nesnelere işaret ediyor. Arayüz, dosya yoksa yer tutucu göstermeli. Testler bu veriye dayanmaz; kendi verilerini kendileri oluşturur (seed satır sayılarına dayanan başka testler var).

## Yapılacaklar

1. **Ziyaret kuyruğu** (`/uzman`):
    - `processed` ve `in_review` durumundaki ziyaretler; parsel, tarih, ağaç sayısı, incelenmiş/kalan sayısı.
    - Bir ziyareti açmak onu `in_review`'a alır.
2. **Ağaç ağaç inceleme:**
    - Sıra/pozisyon koduna göre sıralı liste.
    - Filtreler: incelenmemiş, AI'ın sorunlu dedikleri, düşük güvenli olanlar.
    - Her ağaç için yan yana: bu ziyaretin kesitleri (yönlere göre) ve önceki yayımlanmış ziyaretin kesitleri.
    - Görünen bilgiler: AI önerisi (sınıf, güven, ölçümler), önceki ziyaretin uzman sonucu, ağaç özellikleri (cins, aşı, yaş sınıfı, çeşit).
    - Görüntüler `media` alanından imzalı adreslerle; toplu imzalama (`createSignedUrls`).
3. **Karar:**
    - **"AI'ı kabul et"**: AI satırı değişmez; aynı sınıfla yeni bir `source = expert` değerlendirmesi yazılır. AI ve uzman görüşü ayrı satırlardır (`docs/veri-modeli.md`).
    - **"Düzelt"**: Uzman sınıfı seçer ve ölçekleri girer.
    - Hangi metriklerin girileceği `metric_definition`'dan gelir: ziyaretin mevsimine uyan (`valid_seasons`) ve karnede görünen (`card_visibility = shown`) metrikler. Ölçek sınırları ve birimler de oradan.
    - Ölçümler `source = expert`, yöntem ve sürüm bilgisiyle yazılır; kanıt olarak bakılan kesitler `measurement_evidence`'a bağlanır.
    - Değerlendirme ile ölçümler `assessment_measurement` üzerinden bağlanır.
    - Bir ağacın kararı değiştirilirse eski satırlar silinmez; yeni satır eklenir. En yeni olan geçerlidir.
4. **Bulgu ve öneri:**
    - Ağaca ya da parsele bağlı bulgu: tür, önem, açıklama, öneri.
    - Kanıt kesitleri `finding_evidence` ile bağlanır.
    - Ziyaret yayımlanmadan önce düzenlenip silinebilir.
5. **Rapor imzası ve yayımlama:**
    - Ziyaret özeti: sınıf dağılımı, önceki ziyarete göre değişenler, bulgular, incelenmemiş ağaçlar.
    - **Veritabanı fonksiyonu** `publish_session(p_session_id uuid)`:
        - Sadece `expert` rolündekiler çağırabilir.
        - Ziyaretteki her aktif ağacın bir uzman değerlendirmesi olmalı; yoksa hata verir ve eksikleri bildirir.
        - `status = published` yapar; kimin ve ne zaman yayımladığını kaydeder (yeni sütunlar: `published_at`, `published_by`).
        - O ziyaretteki onaysız bulguları imzalayan uzman adına onaylar.
    - **Açık bir boşluk kapatılmalı:** `session_update` kuralı şu an her kurum üyesinin durumu değiştirmesine izin veriyor. Saha personeli bir ziyareti doğrudan `published` yapabilir. Durumun `published`'a geçişi sadece bu fonksiyonla olabilsin; yayımlanmış bir ziyaretin durumu da geri alınamasın. pgTAP testleriyle göster.
    - Geri alma (yayından kaldırma) bu sürümde yok.
6. **Klavye kısayolları** (sonraki ağaç, kabul, sınıf seçimi): Kolaysa ekle. Kesme listesinde, zorunlu değil.
7. **Testler:**
    - Birim: Metrik seçimi (mevsim ve görünürlük), özet ve değişim hesapları.
    - Entegrasyon (yerel Supabase):
        - Uzman AI'ı kabul ediyor, düzeltiyor, bulgu ekliyor, yayımlıyor.
        - Eksik değerlendirmeyle yayımlama reddediliyor.
        - Saha personeli ve operasyon yayımlayamıyor, durumu doğrudan `published` yapamıyor.
        - Yayımlamadan önce sahip sonuçları göremiyor; sonra görüyor.
    - Tarayıcı: Uzman olarak giriş, bir ağacı kabul etme, bir ağacı düzeltme, yayımlama.
    - pgTAP: Yeni fonksiyon ve kural için.
8. **README:** `apps/web/README.md`'ye "Uzman paneli" bölümü.

## Kabul ölçütü

- `pnpm db:test`, `pnpm web:lint`, `pnpm web:build`, `pnpm web:test`, `pnpm web:e2e` geçiyor.
- `pnpm web:typegen` sonrası `git diff` boş.
- PR'da demo verisiyle kısa bir kullanım tarifi ya da ekran görüntüsü.
