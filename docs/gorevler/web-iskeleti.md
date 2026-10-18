# Web Uygulaması İskeleti (İP5, İP7, İP8'in temeli)

- **Klasörler:** `apps/web/`. Bu görev ayrıca kökte `pnpm-workspace.yaml` oluşturabilir ve kökteki `package.json`'a `web:*` betikleri ekleyebilir. Bu dalgada kök dosyalara dokunan tek görev bu. `supabase/` **değişmez**; şemada değişiklik gerekiyorsa PR açıklamasına yaz.
- **Okunacaklar:** `docs/gorevler/README.md` (ortak kurallar), `CLAUDE.md` (veritabanı komutları ve örnek kullanıcılar), `docs/MVP.md` (Roller, Modül 4 uzman incelemesi, Modül 5 portal), `docs/veri-modeli.md`, `supabase/migrations/` (özellikle erişim kuralları), `docs/teknik-mimari.md` (web bileşenleri)

## Amaç

Sahip portalı, uzman paneli ve ofis üçgenleme aracının üzerine kurulacağı tek, rol bazlı web uygulamasının iskeleti. Özellik geliştirmek değil; sağlam bir temel ve **veritabanı yetki kurallarının uçtan uca çalıştığının kanıtı**.

## Kararlar (bunlara uy)

- Next.js (App Router) ve TypeScript; paket yöneticisi pnpm.
- Supabase bağlantısı `@supabase/ssr` ile; sunucu tarafında oturum.
- Veritabanı tipleri `supabase gen types typescript --local` ile üretilip `apps/web/src/lib/database.types.ts` dosyasına yazılsın. Üretme komutu bir pnpm betiği olsun.
- Arayüz dili Türkçe. Metinler tek bir yerde toplansın; çok dil desteği gerekmez ama sonradan eklenebilir olsun.
- Harita için MapLibre GL. Geliştirmede API anahtarı gerektirmeyen bir altlık kullan ve README'de üretim için değiştirilmesi gerektiğini not et.
- Biçimlendirme ve lint ayarla (ESLint, Prettier). Stil yaklaşımını sen seç ve gerekçesini yaz.

## Yapılacaklar

1. **Proje kurulumu:**
    - `apps/web` içinde Next.js uygulaması.
    - Kökte pnpm workspace.
    - Kök betikleri: `web:dev`, `web:build`, `web:test`, `web:typegen`.
2. **Giriş:**
    - Geliştirme için e-posta + parola girişi; örnek kullanıcılar `CLAUDE.md`'de.
    - Telefon doğrulamasıyla giriş sonraya kalır, ama giriş bileşeni buna göre genişletilebilir olsun.
    - Çıkış.
3. **Rol bazlı yönlendirme:** Kullanıcının rolleri veritabanından okunur (`membership` ve `parcel_access`). Bölümler:
    - `/portal`: sahip, izleyici
    - `/uzman`: uzman
    - `/ofis`: saha personeli, operasyon (ileride üçgenleme aracı)
    - `/operasyon`: operasyon

    Yetkisiz erişim engellensin. Birden çok rolü olan kullanıcı bölümler arasında geçebilsin.
4. **Her bölümde ilk sayfa:**
    - Kullanıcının görebildiği parsellerin listesi, satır bazlı yetki kurallarıyla, istemci tarafında filtreleme yapmadan.
    - Parsel detay sayfası: harita üzerinde sınır, yerler ve ağaçlar. Ağaçlar duruma göre renklendirilsin; seed'de değerlendirme yoksa tek renk.
    - Ağaca tıklayınca kod ve özelliklerin göründüğü basit bir panel.
5. **Testler:**
    - Birim testleri (Vitest).
    - **Yerel Supabase'e karşı entegrasyon testleri** (`pnpm db:start` + `pnpm db:reset` sonrasında):
        - Örnek beş kullanıcının her biri giriş yapıp beklenen parselleri görüyor.
        - Sahip başka parseli göremiyor.
        - Yetkisiz rol bölüme giremiyor.
    - Uçtan uca tarayıcı testi (Playwright) kurulabiliyorsa ekle. Tarayıcı indirmesi ağ kısıtı yüzünden başarısız olursa, entegrasyon testlerini sunucu fonksiyonları ve supabase-js üzerinden yaz ve durumu PR'da belirt.
6. **README (Türkçe):** Kurulum, komutlar, klasör yapısı, rollerin bölümlere eşlenmesi, ortam değişkenleri (`.env.example`; gerçek anahtar yok).

## Kabul ölçütü

- `pnpm web:build` başarılı.
- `pnpm web:test` (birim + yerel Supabase'e karşı entegrasyon) geçiyor.
- `pnpm web:typegen` çalışıyor ve üretilen tipler commit'li.
- PR açıklamasında: ekran görüntüsü alınabildiyse ekle, alınamadıysa sayfaların kısa tarifi.
