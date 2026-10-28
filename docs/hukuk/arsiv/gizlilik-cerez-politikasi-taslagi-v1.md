# Gizlilik ve Çerez Politikası

> **Arşiv:** `gizlilik-v1-taslak` sürümüdür ve değiştirilmez. Yerini [güncel sürüm](../gizlilik-cerez-politikasi-taslagi.md) aldı. Bu sürümle verilmiş onaylar (`consent_record.text_version = 'gizlilik-v1-taslak'`) bu metne bakar.

> **Taslak:** Avukat incelemesi için. Hukuki görüş değildir. Köşeli parantezler doldurulacak. Sitenin ve portalın ziyaretçilere yönelik özetidir; kişisel verilerin ayrıntısı [KVKK Aydınlatma Metni](kvkk-aydinlatma-metni-v1.md)'ndedir.

**Sürüm:** gizlilik-v1-taslak · [Tarih]

## 1. Kapsam

Bu politika orchadOS sitesini ([alanadi]) ve müşteri portalını kapsar. Veri sorumlusu OBA Bilişim Teknolojileri LTD.'dir [tam unvan].

## 2. Siteyi gezerken

- Sitenin herkese açık sayfalarında hesap açmadıkça sizden kişisel veri istenmez.
- Sunucu kayıtlarında, güvenlik amacıyla, IP adresi ve istek zamanı tutulur ([X] gün).
- Kayıt formunda robot doğrulaması için [Cloudflare Turnstile] kullanılır. Bu hizmet, doğrulama için tarayıcı ve cihaz bilgisi işler [avukat: yurt dışı aktarım; README soru 2].
- Reklam ve izleme amaçlı üçüncü taraf araç (analitik, reklam pikseli) kullanılmaz.

## 3. Çerezler

Yalnızca zorunlu çerezler kullanılır. Bu nedenle çerez onay penceresi gösterilmez [avukat: zorunlu çerezlerde onay gerekmediği teyidi].

| Çerez | Amaç | Süre |
| --- | --- | --- |
| `sb-…-auth-token` | Oturumunuzu açık tutar (giriş) | Oturum yenilendikçe; çıkışta silinir |
| Turnstile çerezleri | Robot doğrulaması (yalnızca kayıt sayfasında) | Kısa süreli |

Tarayıcınızdan çerezleri silebilir ya da engelleyebilirsiniz; bu durumda giriş yapamazsınız.

## 4. Hesap ve portal

- Kayıtta ad soyad, cep telefonu, e-posta, parola (yalnızca özeti saklanır) ve iletişim tercihi alınır.
- Telefon numaranız SMS koduyla doğrulanır. Kayıt denemelerinin kötüye kullanımını önlemek için IP adresinin ve telefonun tek yönlü özeti tutulur.
- Ödemede kart bilgileriniz ödeme kuruluşuna ([iyzico]) doğrudan girilir; Şirket'e ulaşmaz.

## Demo turu

> Bu bölüm kaynak taslakta yoktu; v1 sürümünde `/gizlilik` sayfasında 5. bölümden önce bu metinle gösterildi (`apps/web/src/lib/i18n/messages/demo.ts`, `privacy`). Aynen buraya kopyalandı.

- Demo turunda sizden kişisel veri (ad, telefon, e-posta) istenmez. Demo, birkaç saat sonra silinen geçici bir hesapla açılır; hesabın e-posta adresi rastgeledir ve teslim edilemez.
- Kötüye kullanımı önlemek için IP adresinizin takma adlandırılmış bir özeti (IPv6'da /64 önekinin özeti) 48 saat tutulur. Bu özet, anahtarına sahip olan tarafından adresle eşleştirilebileceği için kişisel veri sayılır.
- Ham IP adresi ve tarayıcı bilgisi, oturum kaydında hesap silinene kadar, altyapı loglarında ise sağlayıcının saklama süresi boyunca ([X] gün) kalır.
- Robot doğrulaması için [Cloudflare Turnstile], barındırma için [Supabase] (AB bölgesi) ve [Vercel] kullanılır; bu hizmetler verinin yurt dışına aktarılmasını içerir.
- Demoda yalnızca zorunlu oturum çerezleri kullanılır.

## 5. Haklarınız

KVKK md. 11'deki haklarınız ve başvuru yolları [KVKK Aydınlatma Metni](kvkk-aydinlatma-metni-v1.md)'nin 8. bölümündedir. İsteğe bağlı açık rızalarınızı portalda Hesabım › İzinler'den değiştirebilirsiniz.

## 6. Değişiklikler

Bu politika değişirse yeni sürüm bu sayfada yayımlanır; sürüm adı ve tarihi en üstte yazar.
