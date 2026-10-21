# Envanter Onayı: Doğrulama Listesi, Uzman Onayı, Sahibin Sınır Onayı

- **Klasör:** `apps/web/` içinde şunlar:
    - `src/app/ofis/**`, `src/components/office/**`, `src/lib/office/**`
    - `src/app/uzman/**`, `src/components/expert/**`, `src/lib/expert/**`
    - `src/app/portal/**`, `src/components/portal/**`, `src/lib/portal/**`
    - Bunların testleri. `e2e/` altında sadece `inventory-*` dosyaları.
    - `tr.ts`'de sadece kendi anahtar blokların.
- **Şema:** `supabase/migrations/20261021210xxx_*.sql` ve `supabase/tests/18_*.test.sql`, ardından `pnpm web:typegen`. Seed'i değiştirme.
- **Sözleşme:** `docs/arayuzler.md`'ye doğrulama listesinin bölümü eklenir.
- **Aynı anda çalışan oturumlar:**
    - Operasyon ekranları (`/operasyon`, `20261021200xxx`). Ortak bileşenleri değiştirme.
    - Saha uygulamasında senkronizasyon (`apps/field/`). Saha uygulamasına dokunma; onun tarafı (doğrulama turu ekranı) sonraki iş.
- **Okunacaklar:**
    - `docs/gorevler/README.md` (ortak kurallar)
    - `docs/MVP.md` Modül 2: adım 6–10, çıktılar, kabul kriteri
    - `docs/metodoloji.md` bölüm 3 (ağaç özellikleri)
    - `docs/kullanim-kilavuzu.md` bölüm 2
    - `docs/veri-modeli.md`
    - `supabase/migrations/` (özellikle `..._subject_layer`, `approve_boundary`, `..._inventory_chain`, `..._expert_review_and_publication`)
    - `apps/web/README.md`

## Amaç

Envanterde ofis üçgenlemesi bitince üç adım kalıyor ve hiçbiri yazılımda yok:
1. Doğrulama listesindeki ağaçlara sahada bakılması
2. Uzmanın kodlamayı ve ağaç özelliklerini onaylayıp envanteri imzalaması
3. Sahibin sınırı onaylaması

Bu görev, saha uygulaması hariç bunları kurar. Sonunda parsel `inventory_done` olur ve periyodik ziyaretlere hazırdır.

## Yapılacaklar

1. **Doğrulama listesi veritabanında:**
    - Ofis aracındaki doğrulama listesi şu an sadece CSV.
    - Listeyi bir `verification` ziyaretine bağlı kalemler olarak kaydet. Her kalemde:
        - Yer ya da ağaç
        - Neden: yüksek belirsizlik, boş yer, emin değilim, çok gövdeli, fidan olabilir
        - Not ve durum: açık / bakıldı / kapatıldı
        - Sahada bakılınca sonuç: ağaç var / yok, yakın plan bağlantısı
    - Tablo yapısını sen belirle; önce `docs/veri-modeli.md`'ye kısa bir bölüm yaz.
    - Ofis aracında "Doğrulama turu oluştur": `verification` türünde `planned` bir ziyaret açar ve kalemleri ekler.
    - Kalemler saha uygulamasının sonraki sürümünde personele görev olarak inecek. Saha uygulamasının okuyacağı ve yazacağı alanları `docs/arayuzler.md`'de bir bölümle tanımla.
    - Saha uygulaması gelene kadar ofisteki kişi kalemleri elle kapatabilsin: bakıldı, sonuç ve not. Pilotta doğrulama telefonla da yapılabilir.
2. **Ofiste ağaç özellikleri ve altyapı:**
    - Üçgenleme ve kayıttan sonra ağaç özellikleri işaretlenir: yaş sınıfı, aşı durumu, belirsiz. Toplu seçim olsun, ör. bir sıradaki bütün ağaçlar "verimli".
    - Altyapı noktaları ve çizgileri haritada eklenir (`zone`): kuyu, havuz, sulama hattı, çit, kapı, kulübe.
    - **Saha sınırı:** Sahada köşe işaretleme gelene kadar ofiste, panorama konumları ve yörünge üstünde sınır çizilebilsin. Kayıt `boundary` yeni sürüm olarak `field_survey` kaynağıyla yapılır; köşe belirsizliği girilir.
3. **Uzman envanter onayı** (`/uzman`):
    - Kuyruğa envanter ziyaretleri de girsin: yerleri kaydedilmiş, onaylanmamış olanlar. Tarama ziyaretlerinden ayrı bir sekme ya da işaret.
    - **Ekran:**
        - Kodlu harita: yerler, boş yerler, ara ağaçlar
        - Ağaç özellikleri tablosu; uzman düzeltebilir
        - Doğrulama kalemlerinin durumu
        - Kodlama denetimleri: yinelenen kod, sıra içinde atlanan pozisyon, aşırı yakın iki ağaç
        - Örnek kontrol için panorama
        - Envanter özeti: yer, ağaç, boş yer, ara ağaç sayısı; aşısız ağaç sayısı; yaş dağılımı
    - **Veritabanı fonksiyonu** `approve_inventory(p_session_id uuid)`:
        - Sadece `expert` çağırabilir.
        - Parselde yer olmalı ve açık doğrulama kalemi kalmamalı; yoksa hata verir ve eksikleri bildirir.
        - Envanter ziyaretini `publish_session` ile aynı kurallarla yayımlar: kimin yayımladığını ve ne zaman yayımladığını kaydeder. `publish_session`'ın "her aktif ağacın uzman değerlendirmesi" şartı envanterde aranmaz.
        - Parseli `inventory_done` yapar.
    - **Yayından sonra:** Ağaç özellikleri değiştirilebilir kalır. Örneğin cinsiyet ilkbaharda belirlenir. Ama yer kodları ve konumları donar; mevcut numaralandırma dondurma kuralına bak.
4. **Sahibin sınır onayı** (`/portal`):
    - Parsel karnesinde sınır kartı: son sınır sürümü haritada, alanı (m² ve dönüm), kaynağı. Varsa sahibin beyan ettiği ilk sınır da soluk olarak.
    - Onaylanmamış saha sınırı varsa "Sınırı onaylıyorum" düğmesi. Mevcut `approve_boundary` fonksiyonunu kullan.
    - Onay metni sınır notunu içerir: "Bu sınır, gösterdiğiniz fiili kullanım sınırıdır; tapu ya da mülkiyet sınırı değildir."
    - Onaylandıysa kim onayladı ve ne zaman, görünsün.
    - Hissedar (`viewer`) onaylayamaz; mevcut kuralı kontrol et.
    - Envanter onaylandıysa karnede envanter özeti görünsün.
5. **Testler:**
    - Birim:
        - Kodlama denetimleri: yinelenen kod, atlanan pozisyon, yakın ağaçlar
        - Envanter özeti
        - Alan hesabı
    - Entegrasyon (yerel Supabase):
        - Doğrulama turu oluşturuluyor, kalemler kapatılıyor.
        - `approve_inventory` açık kalem varken reddediyor, kapanınca parseli `inventory_done` yapıyor.
        - Uzman dışındaki roller onaylayamıyor.
        - Sahip sınırı onaylıyor; hissedar onaylayamıyor.
        - Onaydan sonra yer kodları değişmiyor, ağaç özellikleri değişebiliyor.
    - Tarayıcı:
        - Ofiste doğrulama turu oluşturma
        - Uzman olarak envanter onayı
        - Sahip olarak sınır onayı
    - pgTAP: Yeni tablo, fonksiyon ve kurallar için.
6. **README:**
    - `apps/web/README.md`'de ofis, uzman ve portal bölümlerine ekler.
    - `docs/kullanim-kilavuzu.md` bölüm 2.3 ve 2.4'teki durum işaretleri için öneriyi PR'a yaz; dosyaya dokunma.

## Kabul ölçütü

- `pnpm db:test`, `pnpm web:lint`, `pnpm web:build`, `pnpm web:test` ve `pnpm web:e2e` geçiyor.
- `pnpm web:typegen` sonrasında `git diff` boş.
- PR'da kısa bir tarif. Örnek akış: geliştirme parselinde üçgenleme → kayıt → özellikler → doğrulama turu → kalemleri kapatma → uzman onayı → sahip sınır onayı.
