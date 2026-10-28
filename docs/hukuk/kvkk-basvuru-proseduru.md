# KVKK Başvuru Prosedürü

28 Ekim 2026 · İç belge

> Kanun md. 11 başvurularının nasıl alınıp sonuçlandırılacağını anlatır. Dayanak: [kararlar.md](kararlar.md) [H26](kararlar.md#h26) (ayrıca H01, H22, H25). Silme ve takma ad işlevleri yazılımda yokken başvurular bu prosedürle elle karşılanır; betikler T11'dir.

## 1. Başvuru kanalları ve alan kişi

| Kanal | Nereye | Kim alır |
| --- | --- | --- |
| Yazılı (ıslak imzalı) | [Adres] | Şirket yetkilisi |
| Kayıtlı elektronik posta | [KEP adresi] | Şirket yetkilisi |
| Güvenli elektronik ya da mobil imza | [kvkk@alanadi] | Şirket yetkilisi |
| Sistemde kayıtlı e-posta adresinden | [kvkk@alanadi] | Şirket yetkilisi |
| Portaldan rıza geri alma | Hesabım › İzinler | Kendiliğinden işler |
| Portaldan KVKK başvurusu (T11; anahtar `kvkk_request_form_enabled` açıkken) | Hesabım › İzinler › KVKK başvurusu | Operasyon (`/operasyon/kvkk`), Şirket yetkilisine iletir |

Başka bir kanaldan (telefon, SMS, saha) gelen talep geri çevrilmez: kişiye yukarıdaki yollar söylenir ve talep deftere "yönlendirildi" olarak yazılır. Rıza geri alma e-postayla istenirse elle yapılır.

## 2. Kimlik doğrulama

Cevap vermeden ve veri açıklamadan önce kimlik doğrulanır.

- **Kayıtlı e-postadan gelen başvuru:** E-posta doğrulanmadığı için kayıtlı telefona SMS kodu gönderilir ve kişi kodu bildirir, ya da teyit kişinin portal oturumundan alınır.
- **Yazılı başvuru:** Islak imza ile ad soyad, T.C. kimlik numarası (yalnızca doğrulama için; kopyası saklanmaz) ve adres.
- **KEP ya da güvenli elektronik imza:** Kanalın kendisi yeterlidir.
- **Portal formu:** Başvuru kişinin kendi portal oturumundan geldiği için kimliği doğrulanmış sayılır; başka bir kişi adına yapılan talep bu yolla alınmaz.
- **Görüntülerdeki üçüncü kişi** (bahçe işçisi, komşu): kimlik ile görüntüdeki kişinin eşleşmesi için bahçe, tarih ve yer bilgisi istenir; gerekirse kişiyle görüntü üzerinden görüşülür.

Doğrulanamayan başvuruya veri açıklanmaz; kişiye doğrulama yolu bildirilir.

## 3. Başvuru defteri

Her başvuru deftere yazılır (ofis paylaşımlı tablosu; kişisel veri içerdiği için erişimi kısıtlıdır). Alanlar:

| Alan | Açıklama |
| --- | --- |
| No | Sıra numarası (K-yyyy-nnn) |
| Geliş tarihi | Başvurunun Şirket'e ulaştığı gün |
| Kanal | 1. bölümdeki kanallardan biri |
| Başvuran | Ad soyad; sahip, hissedar, saha kişisi ya da üçüncü kişi |
| Doğrulama yöntemi | SMS kodu, portal oturumu, ıslak imza, KEP, e-imza |
| Talep | md. 11'deki hak ya da haklar |
| Değerlendirme | 4. bölümdeki karar ağacına göre |
| Karar | Kabul, kısmi ret, ret ve gerekçesi |
| Uygulanan işlem | Silme, takma ad, gizleme, bilgi verme; denetim kaydı numarası |
| Cevap tarihi | Cevabın gönderildiği gün |

## 4. 30 gün sayacı

- Süre başvurunun Şirket'e ulaştığı gün başlar. Cevap en geç 30. gün gönderilir; hedef 15 gündür.
- Kimlik doğrulama beklenirken süre durmaz. Doğrulama yapılamazsa bu durum süre içinde kişiye yazılır.
- Başvuru ücretsizdir. İşlem ayrıca bir maliyet gerektirse de pilotta ücret alınmaz.

## 5. Karar ağacı

Silme talebi aşağıdaki sırayla ayrıştırılır:

1. **Saklama yükümlülüğü olan veriler** (fatura, ödeme ve iade, mesafeli sözleşme ve ön bilgilendirme onayları, makbuz): silinmez. Erişimleri yalnızca ispat ve mali denetim amacıyla sınırlanır; talep bu kısım için gerekçeyle reddedilir.
2. **Ekleme-yalnız denetim ve rıza kayıtları:** hakların korunması için saklanır. Gerekirse kimliği belirleyen alanlar, kayda geçirilen kontrollü bir istisnayla takma ada çevrilir.
3. **Sözleşme sürerken:** hizmet için gerekli veriler silinemez; silmenin fesihle mümkün olduğu bildirilir.
4. **Sözleşme bitmişse ve saklama gerekçesi yoksa:** veri silinir ya da anonim hale getirilir. Bu, KVKK'nın üstün geldiği "veri silinmez" istisnasıdır.
5. **Parselde sözleşmesi süren başka sahip ya da hissedar varsa:** yalnızca talep edenin kişisel verileri (adı, telefonu, hesabı, soruları, kendi siparişlerinin kişisel bağlantıları) silinir. Diğer sahibin hizmetine ait bahçe verileri korunur.
6. **Hissedarın talebi:** hesabı ve davet bağlantısı silinir.
7. **Görüntülerdeki üçüncü kişiler:** göründükleri kare ya da panorama gizlenir (H01). Operasyon ziyaret sayfasındaki "Görüntü gizleme (KVKK itirazı)" bölümünden yapar (T20): neden ve başvuru numarası not olarak yazılır, kayıt denetim kaydına girer. Gizlenen görüntü sahiplere, hissedarlara, demo ziyaretçilerine ve uzmana gösterilmez; dosya silinmez, gizleme kaldırılabilir.

Bilgi isteme, düzeltme ve itiraz talepleri doğrudan karşılanır. Meşru menfaate dayanan işleme itirazda (örneğin Şirket içi geliştirme, H31) itiraz kabul edilirse o kişinin verisi bu kullanımdan çıkarılır.

## 6. Cevap şablonları

**Kabul:** "Sayın [ad soyad], [tarih] tarihli başvurunuz (K-…) sonuçlandırılmıştır. Talebiniz doğrultusunda [yapılan işlem] yapılmıştır. Bilgilerinize sunarız. OBA Bilişim Teknolojileri LTD."

**Kısmi ret:** "Sayın [ad soyad], [tarih] tarihli başvurunuz (K-…) sonuçlandırılmıştır. [Silinen ya da düzeltilen veriler] için talebiniz yerine getirilmiştir. [Saklanan veriler] ise [mevzuat: örneğin Vergi Usul Kanunu md. 253] gereği saklama süresi dolana kadar silinemez; bu veriler yalnızca bu amaçla ve erişimi sınırlı olarak saklanır. Bu karara karşı Kişisel Verileri Koruma Kurulu'na şikâyet hakkınız vardır. OBA Bilişim Teknolojileri LTD."

**Ret:** "Sayın [ad soyad], [tarih] tarihli başvurunuz (K-…) [gerekçe] nedeniyle reddedilmiştir. Bu karara karşı cevabın tebliğinden itibaren 30 gün içinde ve her halde başvuru tarihinden itibaren 60 gün içinde Kişisel Verileri Koruma Kurulu'na şikâyet hakkınız vardır. OBA Bilişim Teknolojileri LTD."

## 7. Elle silme ve takma ad adımları

1. Karar deftere yazılır ve ikinci bir kişi (Şirket yetkilisi ya da geliştirici) kontrol eder.
2. Gözden geçirilmiş betik çalıştırılır (T11, [scripts/kvkk/README.md](../../scripts/kvkk/README.md)): `owner_profile`, `parcel_detail` iletişim bilgileri, sorular ve hissedar davetleri için silme; ekleme-yalnız tablolarda (saha olayları, sınırı gösteren kişi kaydı, görüntü gizleme ve sınır itirazı notları, denetim kaydı) takma ada çevirme. Sözleşme belgeleri, sınır beyanı ve portal KVKK başvuruları saklama süresince kalır. Betik varsayılan olarak kuru çalışır ve değişmeden geri alınır; değişiklik yalnızca `--apply` ile kalıcı olur. Takma ad anahtarı `KVKK_PSEUDONYM_KEY` ortam değişkeninden okunur (parola yöneticisinde saklanır). Barındırılan veritabanında `--hosted` (adres `KVKK_DB_URL` ortam değişkeninde) ve terminalde onay gerekir. Sıra:
   1. Envanter (deftere yazılır; serbest metinli saha notları elle okunur):
      `scripts/kvkk/run.sh inventory --subject <kullanıcı uuid> --request K-yyyy-nnn`
   2. Kuru çalıştırma ve ikinci kişinin kontrolü (sayılar ve envanterin "review" satırları birlikte okunur; kişiye bağlı olmayan eşleşmeler adaş olabilir, betik onları değiştirmez):
      `scripts/kvkk/run.sh pseudonymize --subject <kullanıcı uuid> --request K-yyyy-nnn --include-notes`
      `scripts/kvkk/run.sh erase --subject <kullanıcı uuid> --request K-yyyy-nnn`
   3. Uygulama, önce takma ad, sonra silme:
      `scripts/kvkk/run.sh pseudonymize --subject <kullanıcı uuid> --request K-yyyy-nnn --include-notes --apply`
      `scripts/kvkk/run.sh erase --subject <kullanıcı uuid> --request K-yyyy-nnn --apply`
   4. Hesabı olmayan kişi (sınırı gösteren kişi, sahadaki iletişim kişisi): aynı komutlar `--subject` yerine `--person-name "<ad soyad>" --parcel <parsel uuid>` ile. Ad tam yazılır (en az iki sözcük); tek sözcük ya da parselde hesabı olan birinin adı verilirse betik durur, kişi elle belirlenir.
   5. Auth hesabı Admin API ya da panelden silinir; faturalama kaydı ya da aydınlatma teyidi varsa silinmez, kapatılır ve iletişim bilgileri kaldırılır (README, "Auth hesabı"; envanterin `auth.users` satırı hangisi olduğunu yazar).

   Betik, saklama yükümlülüğü olan kayıtlara (fatura, ödeme, iade, sipariş, teklif, onay ve rıza kayıtları) dokunmaz (5. bölüm, 1. madde). Kişinin süren bir sözleşmesi varsa durur (3. madde); yalnızca deftere gerekçesi yazılmış bir istisnada `--force-active --reason "<gerekçe>"` ile çalıştırılır. Betikte olmayan bir veri için işlem geliştirici eliyle, aynı kurallarla yapılır ve betiğe eklenir.
3. İşlem denetim kaydına (`audit_event`) yazılır: betik her `--apply`'da `kvkk.pseudonymized` ya da `kvkk.erased` kaydını başvuru numarasıyla kendisi yazar; kayıt numarası deftere işlenir.
4. Yedeklerdeki kopyalar yedek saklama süresi sonunda kendiliğinden silinir; yedekten geri yükleme yapılırsa işlem yeniden uygulanır.
5. Kişiye cevap gönderilir ve cevap tarihi deftere yazılır. Başvuru portaldan geldiyse `/operasyon/kvkk`'da durumu "Cevaplandı" ya da "Reddedildi" yapılır (sayaç orada da görünür; süresi geçen başvuru kırmızı işaretlenir).
