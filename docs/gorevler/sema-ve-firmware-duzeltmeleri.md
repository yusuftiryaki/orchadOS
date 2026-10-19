# Şema ve Firmware Düzeltmeleri

- **Klasörler:** `supabase/`, `firmware/gnss-logger/`, `docs/veri-modeli.md`, `docs/arayuzler.md`. Ayrıca `apps/web/src/lib/database.types.ts` yeniden üretilir (`pnpm web:typegen`). `apps/web` testleri şema değişikliği yüzünden kırılırsa **sadece testler** uyarlanabilir; uygulama koduna dokunulmaz, gerekiyorsa PR'da yazılır.
- **Okunacaklar:** `docs/gorevler/README.md` (ortak kurallar), `docs/plan.md` ("Açık işler"), `docs/veri-modeli.md`, `docs/arayuzler.md`, `supabase/migrations/`, `firmware/gnss-logger/README.md`, `apps/field/README.md` (BLE durum mesajı uzantısı önerisi)

## 1. Yayımlanmamış sonuçların sahipten gizlenmesi

- Parsel rolüyle (sahip, izleyici) erişen kullanıcılar, bir oturuma bağlı satırları ancak o oturumun durumu `published` ise görebilsin. Kapsam: capture, asset, measurement, assessment, finding ve bunların ara tabloları.
- Oturuma bağlı olmayan satırlar (parsel, sınır, yer, ağaç özellikleri) bundan etkilenmez.
- Organizasyon rolleri (saha personeli, uzman, operasyon) her şeyi önceki gibi görür.
- Yeni migration olarak yaz; mevcut migration'ları değiştirme.

## 2. Son değerlendirme ve son ölçüm görünümleri

- `tree_latest_assessment`: her ağaç için gösterilecek tek değerlendirme. Öncelik: uzman > model > ai; aynı kaynakta en yeni olan.
- `tree_latest_measurement`: her ağaç ve metrik için en son ölçüm, aynı öncelik kuralıyla.
- Görünümler `security_invoker` ile çalışsın, yani yetki kuralları görünümlerde de geçerli olsun.
- Web uygulaması bu görünümleri sonraki işte kullanacak; şimdi uygulamaya bağlama.

## 3. Medya depolama

- Supabase Storage'da özel (public olmayan) bir `media` alanı.
- Nesne yolu kuralı: `org/<org_id>/parcel/<parcel_id>/<sha256>`. Kuralı `docs/arayuzler.md`'ye ekle.
- Okuma: Kullanıcı ilgili `asset` ya da `capture` satırını görebiliyorsa nesneyi de okuyabilsin; 1. maddedeki yayın kuralı burada da geçerli.
- Yazma: Sadece servis rolü (işleme hattı) ve operasyon.
- Gerekirse `asset`/`capture` tablolarında depolama anahtarı sütununu ekle ya da netleştir.

## 4. Personel cevaplarında belirsizlik

Saha uygulaması evet/hayır cevaplarını `measurement` olarak yazıyor, ama şema sayısal ve ölçek değerlerinde belirsizliği zorunlu tutuyor. Kategori ve evet/hayır değerlerinde belirsizlik boş olabilsin. Kararı `docs/veri-modeli.md`'ye işle.

## 5. Firmware: durum mesajına GPS zamanı

- BLE durum mesajının sonuna `gps_time_ns` alanı ekle:
    - Ofset 31, `u64`, mesajdaki diğer alanlarla aynı bayt sırası.
    - Değer: mesajın oluşturulduğu anın GPS zamanı, PPS çapasından `çapa_gps + (şimdi − çapa_micros) × 1000`.
    - Eşleme yoksa 0.
    - Toplam mesaj 39 bayt.
- README'de: Protokol tablosunu güncelle. `qr_sync` olay örneğinin payload'ını `OQ1:...` biçimine çevir. `events.csv` örneğindeki ikinci satırda `gps_time_ns` ile çapadan hesaplanan değer arasındaki 20 µs tutarsızlığı düzelt.
- Birim testlerini güncelle ve yeni alan için test ekle. `pio run -e esp32dev` derlenmeli.
- Saha uygulaması (`apps/field`) bu alanı zaten okuyor. Bayt düzeninin oradaki çözücüyle birebir aynı olduğunu `apps/field/lib/features/gnss/protocol/` kodunu okuyarak doğrula (o klasöre dokunma).
- `docs/arayuzler.md`'deki ilgili bölümü güncelle.

## Kabul ölçütü

- `pnpm db:reset` ve `pnpm db:test` geçiyor. Yeni pgTAP testleri:
    - Yayımlanmamış oturumun değerlendirmesini sahip görmüyor, uzman görüyor; yayımlanınca sahip de görüyor.
    - Görünümlerin öncelik kuralı.
    - Depolama okuma ve yazma kuralları.
    - Kategori değerinde boş belirsizlik kabul ediliyor.
- `pnpm web:typegen` sonrası `pnpm web:lint`, `pnpm web:build` ve `pnpm web:test` geçiyor.
- `pio test -e native` ve `pio run -e esp32dev` geçiyor.
