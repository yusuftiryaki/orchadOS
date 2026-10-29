# Yurt Dışı Aktarım Kaydı

28 Ekim 2026 · İç belge

> Dayanak: [kararlar.md](kararlar.md) [H02](kararlar.md#h02), [H03](kararlar.md#h03), [H27](kararlar.md#h27); takip işi T01. Her yurt dışı sağlayıcıyla Kişisel Verileri Koruma Kurulu'nun ilan ettiği standart sözleşme değiştirilmeden imzalanır ("veri sorumlusundan veri işleyene" modülü) ve imzadan itibaren 5 iş günü içinde Kurum'a bildirilir.

**Kural:** Bir sağlayıcının satırı tamamlanmadan (sözleşme imzalanmış, Kurum'a bildirilmiş, durum "tamam") o sağlayıcıya gerçek kişisel veri gönderilmez. Yapay zekâ sağlayıcısında bu kuralı ai-worker kapısı uygular: `ORCHADOS_AI_TRANSFER_SAFEGUARD` ortam değişkeni sağlayıcının standart sözleşme kaydının referansını (örneğin "Anthropic SCC 2026-11-15, Kurum bildirimi 2026-11-20") taşır; değişken boşsa gerçek veriyle yurt dışındaki sağlayıcı çağrılmaz.

| Sağlayıcı | Hizmet | Ülke/bölge | Aktarılan veri | Standart sözleşme modülü | İmza tarihi | Kurum'a bildirim tarihi | Durum |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Supabase Inc. | Veritabanı, dosya deposu, giriş | AB (Almanya); şirket ABD | KVKK Aydınlatma Metni'ndeki veriler | Veri sorumlusundan veri işleyene | — | — | bekliyor |
| Vercel Inc. | Site ve portal barındırma | AB; şirket ABD | IP adresi, istek ve oturum trafiği, loglar | Veri sorumlusundan veri işleyene | — | — | bekliyor |
| Cloudflare Inc. | Robot doğrulaması (Turnstile) | ABD ve küresel ağ | IP adresi, tarayıcı ve cihaz bilgisi | Veri sorumlusundan veri işleyene | — | — | bekliyor |
| Anthropic PBC | Yapay zekâ ön değerlendirmesi | ABD | Panorama kesitleri ve mozaikleri, ağaç kodu, mevsim, ölçek tanımları, saha cevapları | Veri sorumlusundan veri işleyene (API verisinin model eğitiminde kullanılmayacağı yazılır) | — | — | bekliyor |
| Bulut işleme sağlayıcısı (seçilmedi) | Görüntülerin işlenmesi | AB | Ham video, konum kayıtları, panoramalar | Veri sorumlusundan veri işleyene | — | — | bekliyor |
| E-posta/ofis sağlayıcısı (belirlenecek) | Kurumsal e-posta (kvkk@ dahil), ofis | Belirlenecek | Başvurular, yazışmalar | Veri sorumlusundan veri işleyene (yurt dışındaysa) | — | — | bekliyor |

Bir sağlayıcı imzalamazsa ne yapılacağı [kararlar.md H02](kararlar.md#h02)'dedir (Supabase ve Vercel için Türkiye'de barındırma ya da imzalayan sağlayıcı; Anthropic için AB'de sunan ve imzalayan bulut sağlayıcısı ya da yerel model; Cloudflare için kendi barındırdığımız doğrulama, T12).
