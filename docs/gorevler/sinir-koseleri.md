# Sınır Köşeleri: Kaydedicide Konum, İşleme Hattında Sınır Sürümü

- **Klasör:** `firmware/gnss-logger/` ve `services/pipeline/`. Ayrıca:
    - `docs/arayuzler.md`: BLE durum mesajı ve sınır bölümleri.
    - Şema gerekirse: `supabase/migrations/20261023120xxx_*.sql`, `supabase/tests/21_*.test.sql`, ardından `pnpm web:typegen`.
    - Seed'e dokunma.
- **Aynı anda çalışan oturumlar:** `apps/field/` (grid rotası), `apps/web/` (uzman ve portal; bildirimler) ve `services/ai-worker/`. Bunlara dokunma.
- **Okunacaklar:**
    - `docs/gorevler/README.md` (ortak kurallar)
    - `docs/arayuzler.md`: "BLE protokolü", "Sınır köşeleri ve kapsama", "Saha uygulaması ve veritabanı"
    - `firmware/gnss-logger/README.md`
    - `services/pipeline/README.md`
    - `docs/MVP.md` Modül 2, adım 2
    - `docs/veri-modeli.md`: sınır sürümleri

## Amaç

Saha uygulaması sınır köşelerini oturum olayı olarak yazıyor (`session_event`: `corner` ve `boundary_corners`). Ama iki eksik var:
1. Kaydedici durum mesajında konum göndermiyor. `docs/arayuzler.md`'de 51 baytlık bir konum bloğu öneriliyor.
2. Köşelerden kesin bir sınır sürümü üreten bir şey yok.

## Yapılacaklar

1. **Firmware 0.3.0: Durum mesajında konum.**
    - `docs/arayuzler.md`'deki öneriye göre 39 baytın ardına konum bloğu ekle (toplam 51 bayt). Kaynak, son NAV-PVT'deki enlem, boylam ve yükseklik.
    - Konum yalnızca fix geçerliyse dolu; değilse alanlar sıfır, bayrakla.
    - Firmware sürümünü 0.3.0 yap. README'de protokol tablosunu ve örnek mesajı güncelle; `docs/arayuzler.md`'de öneri ibaresini kaldır.
    - Birim testleri: Kodlama, sınır değerleri, fix olmayan durum.
    - `pio test -e native` ve `pio run -e esp32dev` geçmeli.
    - İşleme hattının sözleşme testleri README'deki örnekle karşılaştırıyor. Örnek değişirse `services/pipeline/tests/data/` altındaki dosyaları da güncelle.
2. **İşleme hattı: köşelerden sınır.**
    - Yeni bir komut ya da `run`/`upload`'a bir aşama: Oturumun `corner` ve `boundary_corners` olaylarını veritabanından okur. Okuma kuralı `docs/arayuzler.md`'de: en yeni liste geçerli.
    - Her köşenin `gps_time_ns`'i ile PPK'lı yörüngeden konumu bulunur; belirsizliği yörüngenin o anki belirsizliği olur.
    - Yörünge yoksa ya da o anda fix değilse:
        - Olaydaki telefon konumu, ya da kaydedicinin `events.csv`'sindeki `corner` satırının konumu kullanılır.
        - Belirsizliği büyük yazılır ve raporda işaretlenir.
    - Köşeler yürüme sırasıyla bir poligon olur. Kendini kesen poligon ya da 3'ten az köşe hata verir.
    - Kayıt: `public.boundary` yeni sürüm, kaynak `field_survey`. Alanlar: `session_id`, `vertex_uncertainty_m` (köşelerin en büyüğü), `surveyed_at`.
    - Aynı oturumdan aynı köşe listesiyle tekrar çalıştırılırsa yeni sürüm açılmaz.
    - Ops kimliğiyle çalışır; servis anahtarı yok.
    - Rapor: köşe sayısı, alan (m² ve dönüm), köşe başına kaynak (PPK / telefon / kaydedici) ve belirsizlik.
3. **Sentetik veri:** `synth` komutuna sınır yürüyüşü ekle: köşe olayları ve yörünge.
4. **Uçtan uca zincir testi:** `tests/test_chain_supabase.py`'ye bir envanter senaryosu ekle ya da yenisini yaz. Adımlar:
    1. Sınır yürüyüşü: oturum olayları veritabanına yazılır.
    2. `run` ve sınır aşaması: sınır sürümü oluşur.
    3. Sahip sınırı onaylar (`approve_boundary`).
5. **README:** İşleme hattı ve firmware README'leri.

## Kabul ölçütü

- Firmware: `pio test -e native` ve `pio run -e esp32dev` geçiyor.
- İşleme hattı: `uv run ruff check`, `uv run ruff format --check` ve `uv run pytest` geçiyor; Supabase testleri atlanmıyor.
- Migration eklendiyse `pnpm db:test` geçiyor.
