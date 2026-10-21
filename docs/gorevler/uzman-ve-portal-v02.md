# Uzman Paneli ve Portal v0.2: Toplu Onay, Kalite Örneklemi, Durum Skoru, Soru Bırakma

- **Klasör:** `apps/web/` içinde şunlar:
    - `src/app/uzman/**`, `src/components/expert/**`, `src/lib/expert/**`
    - `src/app/portal/**`, `src/components/portal/**`, `src/lib/portal/**`
    - Bunların testleri. `e2e/` altında `expert-*` ve `portal-*` dosyaları.
    - `tr.ts`'de sadece kendi blokların.
- **Şema:** `supabase/migrations/20261023130xxx_*.sql`, `supabase/tests/22_*.test.sql`, ardından `pnpm web:typegen`. Seed'e dokunma.
- **Aynı anda çalışan oturumlar:**
    - Bildirimler ve telefonla giriş: `src/app/giris/**`, `src/lib/notifications/**`, `supabase/functions/**`, `/operasyon`.
    - AI worker (`services/ai-worker/`), grid rotası (`apps/field/`), sınır köşeleri (`services/pipeline/`, `firmware/`).
    - Bunlara dokunma. Ortak bir şey gerekiyorsa PR'da yaz.
- **Okunacaklar:**
    - `docs/gorevler/README.md` (ortak kurallar)
    - `docs/MVP.md` Modül 4 (uzman incelemesi: zorunlu inceleme, toplu onay, %5 örneklem) ve Modül 5 (karne, soru bırakma)
    - `docs/metodoloji.md` bölüm 5, 6, 9
    - `apps/web/README.md`: uzman paneli ve sahip portalı
    - `supabase/migrations/20261020130000_expert_review_and_publication.sql`

## Amaç

1. AI ön değerlendirmesi geldiğinde (İP9, paralel yazılıyor) uzman her ağaca tek tek bakmak zorunda kalmasın:
    - Zorunlu incelemeye girmeyen ağaçlar toplu onaylanabilsin.
    - Bunların rastgele %5'i yine uzmana gösterilsin.
2. Sahip, karnede tek bir genel durum skoru görsün.
3. Sahip bir ağaca ya da bulguya soru bırakabilsin, uzman cevaplayabilsin.

## Yapılacaklar

1. **Zorunlu inceleme kuralları** (`docs/metodoloji.md` bölüm 6). Saf TypeScript, birim testli. Bir ağaç şu durumlarda zorunlu incelemeye girer:
    - AI güveni eşiğin altında (şimdilik %70)
    - AI sorunlu, kuru ya da yok önermiş
    - Önceki yayımlanmış ziyarete göre sınıfı değişmiş
    - Personelin evet/hayır cevabı AI önerisiyle çelişiyor
    - Personel "Sorun gördüm" demiş

   Kurallar ve eşik tek bir yapılandırmada olsun; ileride metodoloji sürümüne bağlanacak. Uzman listesinde yeni bir filtre: "Zorunlu inceleme". Her ağacın hangi kurala takıldığı görünsün.
2. **Toplu onay:**
    - Zorunlu incelemede olmayan, AI önerisi olan ve uzman kararı olmayan ağaçlar için "Kalanları toplu onayla" düğmesi.
    - Önce rastgele %5'lik bir **kalite örneklemi** ayrılır. Bu ağaçlar toplu onaya girmez; uzmanın önüne gelir. Örneklem tohumu ziyarete bağlıdır, sayfa yenilenince değişmez.
    - Toplu onaylanan her ağaç için `source = expert`, `auto_approved = true` olan bir değerlendirme yazılır. AI satırı değişmez; ölçümler AI değerleriyle kopyalanır.
    - Tek işlemde yapılır. Yeni bir veritabanı fonksiyonu ya da mevcut `save_expert_assessment`'ın toplu sürümü olabilir.
    - Sahip tarafında bu ağaçlar "Otomatik onay" rozetiyle görünür; portalda bu ayrım zaten var, kontrol et.
    - Ziyaret özetinde: uzmanın tek tek baktığı, toplu onaylanan ve örneklemde bakılan ağaç sayıları. Örneklemde uzmanın AI'dan farklı karar verdiği oran ("örneklem uyuşmazlığı") da görünsün.
    - `publish_session` toplu onaylı ağaçları uzman kararı sayar; davranışı doğrula.
3. **Genel durum skoru** (0–100):
    - Ağırlıklar `docs/metodoloji.md` bölüm 9'da: sağlıklı 100, dikkat 60, sorunlu 20, kuru 0, yok 0. Değerlendirilmemiş ağaçlar hesaba girmez.
    - Ağırlıklar tek bir yapılandırmada dursun; hesap saf TypeScript.
    - **Portal:**
        - Bahçelerim listesinde ve karnenin üstünde skor ve önceki ziyarete göre değişim (▲ ▼).
        - Skorun yanında kısa bir açıklama: "Ağaçların sınıflarına göre ağırlıklı ortalama".
        - "Denetim güveni" satırı: kapsanan ağaç oranı, uzmanın tek tek incelediği oran ve metodoloji sürümü.
4. **Soru bırakma:**
    - **Sahip ve hissedar:** Ağaç karnesinde ya da bulguda soru yazar.
    - **Uzman:** `/uzman`'da "Sorular" listesinde görür ve cevaplar.
    - Basit bir yorum dizisi. Silme yok; düzenleme sadece yazana ait ve kısa süreli olabilir, kararını yaz.
    - **Yetki:**
        - Sahip ve hissedar sadece kendi parselinin sorularını görür.
        - Uzman ve operasyon kurumun bütün sorularını görür.
        - Saha personeli görmez.
    - **Kişisel veri:** Soru metni sahibin yazdığı serbest metindir. LLM'e gönderilmez; AI worker'ın okuyacağı tablolara konmaz.
    - Bildirim (yeni soru, yeni cevap) bildirim oturumunun işi. Burada sadece bir olay kaydı ya da tetikleyici için yer bırak ve PR'da yaz.
5. **Testler:**
    - Birim: Zorunlu inceleme kuralları, örneklem seçimi (tekrarlanabilir ve yaklaşık %5), skor hesabı ve değişimi.
    - Entegrasyon (yerel Supabase):
        - Toplu onay doğru ağaçları onaylıyor; örneklemi ve zorunluları atlıyor.
        - Uzman dışındaki roller toplu onay yapamıyor.
        - Yayından sonra toplu onay reddediliyor.
        - Soru ve cevap yetkileri doğru çalışıyor.
    - Tarayıcı: Uzman toplu onaylar ve yayımlar; sahip skoru görür ve soru bırakır; uzman cevaplar.
    - pgTAP: Yeni fonksiyon ve tablolar için.
6. **README:** `apps/web/README.md`'de uzman ve portal bölümlerine ekler.

## Kabul ölçütü

- `pnpm db:test`, `pnpm web:lint`, `pnpm web:build`, `pnpm web:test` ve `pnpm web:e2e` geçiyor.
- `pnpm web:typegen` sonrasında `git diff` boş.
