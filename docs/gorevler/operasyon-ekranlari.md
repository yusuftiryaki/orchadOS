# Operasyon Ekranları v0.1: Sahip ve Parsel Kaydı, Ziyaret Planlama

- **Klasör:**
    - Web, sadece şunlar: `apps/web/src/app/operasyon/**`, `src/components/operations/**`, `src/lib/operations/**`, bunların testleri. `e2e/` altında sadece `operations-*` dosyaları. `src/lib/i18n/tr.ts`'de sadece kendi anahtar bloğun.
    - Şema: `supabase/migrations/20261021200xxx_*.sql` ve `supabase/tests/17_*.test.sql`. Migration ekledikten sonra `pnpm web:typegen` çalıştır.
    - Edge function gerekirse: `supabase/functions/**` ve `supabase/config.toml`.
    - `.github/workflows/deploy-db.yml`: fonksiyon dağıtımı için.
    - Seed'i değiştirme.
- **Aynı anda çalışan oturum:** Envanter onayı ekranlarını yazıyor (`/uzman`, `/portal`, `/ofis`, `20261021210xxx` migration'ları). Ortak bileşenleri değiştirme; gerekirse kendi klasörüne kopyala ve PR'da yaz.
- **Okunacaklar:**
    - `docs/gorevler/README.md` (ortak kurallar)
    - `docs/MVP.md` Modül 1 (kayıt)
    - `docs/kullanim-kilavuzu.md` bölüm 1 ve 3.1
    - `docs/veri-modeli.md`
    - `docs/teknik-mimari.md`, KVKK bölümü
    - `docs/deployment.md`
    - `supabase/migrations/` (özellikle `..._subject_layer`, `..._private_schema`, `..._access_control`)
    - `apps/web/README.md`

## Amaç

Kayıt ve ziyaret planlama şimdilik Supabase panelinden elle yapılıyor. Operasyon (`ops` rolü) bunları `/operasyon` bölümünden yapabilmeli: sahibi kaydet, parselini aç, kaba sınırını çiz, portal erişimini ver, envanter ve tarama ziyaretlerini planla, ziyaretlerin durumunu izle.

## Yapılacaklar

1. **Pano** (`/operasyon`):
    - Ziyaretlerin duruma göre sayıları: planlandı, tarandı, işlendi, incelemede, yayımlandı.
    - Yaklaşan ziyaretler (14 gün).
    - Geciken işler: tarihi geçmiş planlanmış ziyaretler, 3 günden uzun süre işlenmeyi bekleyenler.
    - Parsel listesi ve parsellerin yaşam döngüsü durumu.
2. **Sahip kaydı:**
    - Alanlar: ad soyad, telefon, isteğe bağlı e-posta, iletişim tercihi, KVKK onayı ve tarihi, onaylanan metin sürümü (`private.owner_profile`).
    - Kişisel veri `private` şemasında kalır. Loglara ve hata mesajlarına yazılmaz. Sadece `ops` görür ve düzenler.
3. **Parsel kaydı:**
    - Ad, il/ilçe/köy, tahmini alan (dönüm ve m²), sulu/kıraç, tahmini ağaç sayısı, kaba konum (`public.parcel`).
    - Tapu referansı, hisseli mi, rızai taksimle kullanılan bölüm, yetki dayanağı, giriş izni tarihi, erişim notu, sahada sınırı gösterecek kişi (`private.parcel_detail`).
    - **Kaba sınır:** Haritada çizilir, `boundary` sürüm 1 olarak `owner_declared` kaynağıyla kaydedilir.
    - Sıra yönü ve başlangıç köşesi bu aşamada boş kalabilir; envanterde belirlenir.
    - **Sınır notu:** "Fiili kullanım sınırıdır, mülkiyet iddiası değildir." Formda görünsün.
4. **Portal erişimi:**
    - Sahibe `owner`, hissedarlara `viewer` erişimi (`parcel_access`).
    - Hesap oluşturma için kural: **servis anahtarı Vercel'e konmaz** (`docs/deployment.md`).
    - Önerilen yol: Supabase'de çalışan bir Edge Function (`invite-user`).
        - Çağıranın JWT'sinden `ops` rolünü doğrular.
        - Kullanıcıyı servis rolüyle oluşturur ve kimliğini döndürür.
        - Servis anahtarı sadece Supabase'in kendi ortamında kalır.
    - Sahibe giriş bilgisi nasıl iletilir? E-posta davet bağlantısı ya da operasyonun WhatsApp'la ileteceği tek kullanımlık bir parola. Birini seç, gerekçesini yaz.
    - Telefonla (SMS) giriş sonraya kalıyor; seçtiğin yol buna geçişi zorlaştırmamalı.
    - Yerel Supabase'de edge runtime kapalı (`supabase/config.toml`). Gerekirse aç.
    - `deploy-db.yml`'a `supabase functions deploy` adımı ekle. Secret'lar eksikse atlanan bir adım olsun; mevcut guard'a bak.
    - Edge Function yolu çok karmaşık çıkarsa yedek yol: Operasyon hesabı Supabase panelinden açar, ekranda e-postayla mevcut kullanıcı bulunup bağlanır. Bu yolu ops'a özel, `security definer` bir fonksiyonla yap; e-posta dışında bilgi döndürmesin.
5. **Ziyaret planlama:**
    - Parsel için ziyaret aç: tür (`inventory`, `periodic_scan`, `verification`), tarih, sorumlu saha personeli (`lead_user_id`; kurumun `field_staff` üyelerinden), not.
    - Durum `planned`. Ziyaret saha uygulamasında personelin görev listesine düşer.
    - Taramadan önce tarih ve sorumlu değiştirilebilir; ziyaret iptal edilebilir (`cancelled`). Taranmış (`captured` ve sonrası) bir ziyaret buradan değiştirilemez.
    - Tarama ziyaretinde mevsim, tarihten gösterilir (`docs/metodoloji.md` bölüm 2).
    - Parsel yaşam döngüsü: İlk envanter ziyareti planlanınca parsel `registered` → `inventory_planned`. `inventory_done` geçişini envanter onayı (öbür oturum) yapar; burada dokunma.
    - Takvim ya da liste görünümü; parsele ve personele göre filtre.
6. **Yetki:**
    - Bütün yazma işlemleri kullanıcının kendi yetkisiyle yapılır. Mevcut kurallar `ops`'a izin veriyor mu, kontrol et.
    - Gerekirse kuralları daralt; genişletme. Örneğin saha personeli ziyaret planlayamamalı mı? Kararını yaz.
7. **Testler:**
    - Birim: Form doğrulamaları, mevsim, gecikme hesabı.
    - Entegrasyon (yerel Supabase):
        - Ops sahip ve parsel kaydediyor; sınır sürüm 1 oluşuyor.
        - Erişim veriliyor; yeni sahip sadece kendi parselini görüyor.
        - Ziyaret planlanıyor, değiştiriliyor, iptal ediliyor. Taranmış ziyaret değiştirilemiyor.
        - Sahip, saha personeli ve uzman bu işlemleri yapamıyor.
        - Kişisel veri sahibe sadece kendi kaydı olarak görünüyor.
    - Edge Function için en az bir test: yetkisiz çağrı reddediliyor.
    - Tarayıcı: Ops olarak sahip + parsel kaydı, sınır çizimi, ziyaret planlama.
    - pgTAP: Yeni fonksiyon ve kurallar için.
8. **README:**
    - `apps/web/README.md`'ye "Operasyon ekranları" bölümü.
    - `docs/kullanim-kilavuzu.md` bölüm 1 ve 3.1'deki durum işaretlerini güncellemek için öneriyi PR'a yaz; dosyaya dokunma.

## Kabul ölçütü

- `pnpm db:test`, `pnpm web:lint`, `pnpm web:build`, `pnpm web:test` ve `pnpm web:e2e` geçiyor.
- `pnpm web:typegen` sonrasında `git diff` boş.
- PR'da kısa bir kullanım tarifi: yeni sahip → parsel → sınır → erişim → envanter ziyareti planı.
