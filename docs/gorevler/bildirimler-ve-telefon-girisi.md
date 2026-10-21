# Bildirimler ve Telefonla Giriş

- **Klasör:**
    - Web: `apps/web/src/app/giris/**`, `src/lib/notifications/**`, `src/app/operasyon/**` (sadece bildirim kayıtları ekranı için), `src/components/operations/**`. `e2e/` altında `notifications-*` dosyaları. `tr.ts`'de kendi blokların.
    - Supabase: `supabase/functions/**`, `supabase/config.toml` (auth ve fonksiyonlar), `supabase/migrations/20261023140xxx_*.sql`, `supabase/tests/23_*.test.sql`, ardından `pnpm web:typegen`. Seed'e dokunma.
    - `.github/workflows/deploy-db.yml`: gerekirse.
- **Aynı anda çalışan oturumlar:**
    - Uzman ve portal v0.2: `/uzman`, `/portal` ve soru bırakma. Soru ve cevap bildirimleri onların tablosuna bağlanacak; arayüzü PR açıklamasında birbirinize bırakın.
    - AI worker, grid rotası, sınır köşeleri.
    - Bunların klasörlerine dokunma.
- **Okunacaklar:**
    - `docs/gorevler/README.md` (ortak kurallar)
    - `docs/MVP.md` Modül 1 (portal daveti, telefonla giriş) ve Modül 5, bölüm 7 (bildirimler)
    - `docs/teknik-mimari.md`: KVKK bölümü
    - `docs/deployment.md`
    - `apps/web/README.md`: giriş ve operasyon ekranları
    - `supabase/functions/invite-user/index.ts`

## Amaç

1. Uzman bir ziyareti yayımlayınca sahip ve hissedarlara "Rapor hazır" bildirimi gitsin. Kritik bir bulgu (önem `high`) uzman onaylar onaylamaz, raporu beklemeden bildirilsin.
2. Sahip portala telefon numarası ve SMS koduyla girebilsin.

SMS ve WhatsApp sağlayıcısı henüz seçilmedi ve hesabı yok. Bu yüzden her şey bir **sağlayıcı arayüzü** arkasında olsun. Bu görevde iki sağlayıcı yazılır:
- **Kayıt sağlayıcısı:** Mesajı göndermez, sadece kaydeder. Geliştirme, test ve test projesi bununla çalışır.
- **Gerçek sağlayıcı iskeleti:** Bir tane seç, ör. Türkiye'de yaygın bir SMS sağlayıcısı ya da Twilio. Ortam değişkeni yoksa devreye girmez. Seçimini ve gerekçesini yaz.

## Yapılacaklar

1. **Bildirim kuyruğu:**
    - Bir tablo: alıcı (kullanıcı), kanal (`sms` / `whatsapp`), şablon kodu, şablon değişkenleri, durum (bekliyor / gönderildi / başarısız), deneme sayısı, hata, oluşma ve gönderilme zamanı.
    - Kişisel veri kuralları:
        - Telefon numarası bu tabloda tutulmaz; gönderim anında `private.owner_profile`'dan okunur.
        - Şablon değişkenleri sadece parsel adı, tarih ve link. Ad soyad ya da bulgu metni girmez.
    - **Tetikleyiciler:**
        - Ziyaret `published` olunca parselin sahip ve hissedarları için "rapor hazır".
        - Önemi `high` olan bulgu onaylanınca "kritik bulgu".
        - Aynı olay için çift bildirim oluşmaz.
    - Sahibin iletişim tercihi (`contact_preference`) kanalı belirler.
2. **Gönderici:**
    - Bir Edge Function kuyruğu işler: bekleyenleri alır, sağlayıcıya gönderir, durumu yazar. Hata olursa artan bekleme süresiyle yeniden dener.
    - Tetikleme yolu: bir cron (Supabase `pg_cron` ya da zamanlanmış çağrı) ya da tetikleyiciden çağrı. Ücretsiz katmanda çalışanı seç.
    - Şablonlar Türkçe ve sade. Örnek: "Örnek Bahçe 1 için 14 Ekim denetim raporunuz hazır: <link>".
    - **Link:** Portal adresi (`NEXT_PUBLIC_SITE_URL` ya da fonksiyon ortam değişkeni) + parsel sayfası.
3. **Telefonla giriş:**
    - Giriş sayfasındaki pasif telefon yöntemini (`login-methods.ts`) aç: numara → SMS kodu → giriş (`signInWithOtp` / `verifyOtp`).
    - SMS'i Supabase'in kendisi değil bizim sağlayıcımız göndersin: Supabase Auth'un "Send SMS Hook"u ile, hook'u da bir Edge Function karşılasın.
        - Yerelde ve testte kayıt sağlayıcısı kodu kaydeder.
        - Entegrasyon testi kodu oradan okuyup girişi tamamlar.
    - Dışarıdan üye olma kapalı kalmalı: sadece daveti yapılmış numaralar girebilir. Mevcut `invite-user` telefonla hesap açabiliyor; kontrol et.
    - **Kötüye kullanım:** Numara başına deneme sınırı. Kod ekranında yeniden gönderme süresi.
4. **Operasyon:** `/operasyon`'da "Bildirimler" listesi: son bildirimler, durumları, başarısızlar için "yeniden dene". Telefon numarası maskeli (`+90 5•• ••• •• 01`).
5. **Testler:**
    - Birim: Şablonlar, numara maskeleme, yeniden deneme hesabı.
    - Entegrasyon (yerel Supabase):
        - Yayında bildirim oluşuyor ve kayıt sağlayıcısı "gönderiyor".
        - Kritik bulgu bildirimi oluşuyor.
        - Çift bildirim oluşmuyor.
        - Sahip başkasının bildirimini göremiyor.
        - Telefonla giriş: kod kayıttan okunup giriş yapılıyor.
        - Davetsiz numara giremiyor.
    - Tarayıcı: Telefonla giriş akışı (kayıt sağlayıcısıyla).
    - pgTAP: Tablo, kurallar ve tetikleyiciler.
6. **Dokümanlar:**
    - `apps/web/README.md`: giriş ve bildirim bölümleri.
    - `docs/deployment.md`'ye eklenecek ortam değişkenleri ve sağlayıcı kurulumu için öneriyi PR'a yaz.

## Kabul ölçütü

- `pnpm db:test`, `pnpm web:lint`, `pnpm web:build`, `pnpm web:test` ve `pnpm web:e2e` geçiyor.
- `pnpm web:typegen` sonrasında `git diff` boş.
- Hiçbir testte gerçek SMS gönderilmiyor.
