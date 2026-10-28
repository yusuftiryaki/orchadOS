import type { LegalText } from "@/lib/legal/versions";

// Legal texts shown on the public site, mirrored whole from the drafts in
// docs/hukuk/ (the source of truth; `source` names the file). The blocks are
// what src/lib/legal/from-markdown.ts makes of the draft, without the drafting
// notes above its version line; legal.test.ts checks that they stay equal.
// When a text changes, update both and bump its version in
// src/lib/legal/versions.ts.
//
// Inline markup in `text`: **bold** and [label](/path) for links between the
// texts; [placeholders] in brackets are shown as they are.

export type LegalListItem = string | { text: string; children: LegalListItem[] };

export type LegalBlock =
  | { kind: "h2" | "h3" | "p"; text: string }
  | { kind: "ul" | "ol"; items: LegalListItem[] }
  | { kind: "table"; head: string[]; rows: string[][] };

export interface LegalDocument {
  title: string;
  description: string;
  source: string;
  blocks: LegalBlock[];
}

export const legalText: Record<LegalText, LegalDocument> = {
  kvkk_notice: {
    title: "Kişisel Verilerin İşlenmesine İlişkin Aydınlatma Metni",
    description: "6698 sayılı Kanun kapsamında kişisel verilerinizin nasıl işlendiği.",
    source: "docs/hukuk/kvkk-aydinlatma-metni.md",
    blocks: [
      {
        kind: "p",
        text: 'OBA Bilişim Teknolojileri LTD. [tam unvan: ticaret sicilindeki gibi] ("Şirket") olarak, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("Kanun") kapsamında veri sorumlusu sıfatıyla kişisel verilerinizi aşağıda açıklanan şekilde işliyoruz.',
      },
      { kind: "h2", text: "1. Veri sorumlusu" },
      {
        kind: "ul",
        items: [
          "**Unvan:** OBA Bilişim Teknolojileri LTD. [tam unvan: ticaret sicilindeki gibi]",
          "**Adres:** [Adres]",
          "**E-posta:** [kvkk@alanadi]",
          "**KEP:** [KEP adresi]",
          "**Telefon:** [Telefon]",
        ],
      },
      { kind: "h2", text: "2. Hangi kişisel verileri işliyoruz?" },
      {
        kind: "table",
        head: ["Kategori", "Veriler"],
        rows: [
          ["Kimlik", "Ad soyad"],
          [
            "İletişim",
            "Cep telefonu, e-posta (isteğe bağlı), iletişim tercihi (SMS / WhatsApp; WhatsApp seçilse de mesajlar şimdilik SMS olarak gönderilir)",
          ],
          [
            "Müşteri işlem",
            "Hizmet sözleşmesi ve paketi; parsel bilgileri (il, ilçe, köy, tahmini alan, sulu/kuru); tapu bilgisi (ada/parsel, hisseli olup olmadığı; yalnızca kayıt amaçlı); yetki ve giriş izni beyanı; bahçeye erişim notu; sahada sınırı gösteren kişinin adı ve telefonu",
          ],
          ["Konum", "Bahçenin konumu ve sizin gösterdiğiniz kullanım sınırı; ağaçların konumu"],
          [
            "Görsel kayıt",
            "Bahçenizin 360° panoramaları, ağaç ve yakın plan fotoğrafları. **Bu görüntülerde bahçede bulunan kişiler görünebilir**",
          ],
          ["Portal kullanımı", "Giriş kayıtları, portalda bıraktığınız sorular ve uzman cevapları"],
          [
            "İşlem güvenliği",
            "Giriş zamanı, IP adresi, giriş doğrulama kodlarının gönderim kaydı (7 gün)",
          ],
          [
            "Finans",
            "Fatura profili (ad soyad ya da unvan, adres; şirkette vergi dairesi ve VKN); ödeme ve iade kayıtları (tutar, tarih, yöntem, makbuz numarası, ödeme kuruluşunun işlem numarası, kartın yalnızca son dört hanesi ve kart tipi); havale bilgisi. Kart numarasının tamamı Şirket'e ulaşmaz. T.C. kimlik numarası yalnızca ödeme kuruluşu zorunlu tutarsa ödeme sırasında alınır ve ödeme kuruluşuna iletilir; Şirket'te yalnızca son dört hanesi saklanır",
          ],
          [
            "Kayıt güvenliği",
            "Kayıt denemelerinde IP adresinin, telefonun ve e-postanın anahtarlı tek yönlü özeti (2 gün); robot doğrulaması sonucu",
          ],
          [
            "Sizin verdiğiniz üçüncü kişi bilgileri",
            "Hissedarlarınızın ve sahada sınırı gösteren kişinin adı ve telefonu. Bu bilgileri sizden alırız; bu kişileri ilk iletişimde ayrıca bilgilendiririz",
          ],
        ],
      },
      {
        kind: "p",
        text: "Bahçenize ait ölçümler, ağaç değerlendirmeleri ve bulgular, size ait bir bahçeyle ilişkilendirildikleri sürece kişisel veri gibi korunur.",
      },
      { kind: "h2", text: "3. Hangi amaçlarla işliyoruz?" },
      {
        kind: "ol",
        items: [
          "Bahçe denetim hizmetinin verilmesi: kayıt, envanter, periyodik ziyaretler, uzman değerlendirmesi, rapor.",
          "Size ait portal hesabının açılması, girişin doğrulanması, raporların gösterilmesi.",
          "Hizmete ilişkin bildirimlerin gönderilmesi: rapor hazır, kritik bulgu, ziyaret tarihi, teklif, başvuru sonucu, ödeme, iade, ödeme hatırlatma, bahçe çıkarma ve erişim bildirimleri ile giriş kodları. Bu bildirimler tanıtım içermez.",
          "Sözleşmenin kurulması, ifası ve faturalandırma.",
          "Bilgi güvenliğinin sağlanması ve kötüye kullanımın önlenmesi.",
          "Hizmet kalitesinin ölçülmesi ve iyileştirilmesi; değerlendirme yöntemlerinin ve yapay zekâ ön değerlendirmesinin uzman kararlarıyla doğrulanması ve geliştirilmesi (yalnızca Şirket içinde; adınız, iletişim ve tapu bilgilerinizle ilişkilendirilmeden).",
          "Hukuki yükümlülüklerin yerine getirilmesi ve olası uyuşmazlıklarda hakların korunması.",
          "Onay vermeniz halinde tanıtım iletilerinin gönderilmesi. Bu onay, İleti Yönetim Sistemi (İYS) kaydımız tamamlandıktan sonra ayrıca ve isteğe bağlı olarak sorulur.",
        ],
      },
      { kind: "h2", text: "4. Hukuki sebepler (Kanun md. 5/2)" },
      {
        kind: "table",
        head: ["Amaç", "Hukuki sebep"],
        rows: [
          ["1–4", "Sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması (c)"],
          ["5, 6", "Temel hak ve özgürlüklerinize zarar vermemek kaydıyla meşru menfaatimiz (f)"],
          ["7", "Hukuki yükümlülük (ç); bir hakkın tesisi, kullanılması veya korunması (e)"],
          [
            "8",
            "Açık rızanız (md. 5/1) ve 6563 sayılı Kanun md. 6 uyarınca ticari elektronik ileti onayınız",
          ],
        ],
      },
      {
        kind: "p",
        text: "Bahçede bulunan diğer kişilerin görüntüleri meşru menfaate (f) dayanır (9. bölüm). Ödeme kuruluşuna aktarım sözleşmenin ifasına (c) dayanır. Meşru menfaate dayanan işlemlere Kanun md. 11 uyarınca itiraz edebilirsiniz. Açık rızaya dayanan tek işlem 8. amaçtır; isteğe bağlıdır ve hizmeti almanıza engel değildir ([Açık Rıza Metni](/acik-riza)).",
      },
      { kind: "h2", text: "5. Kimlere aktarıyoruz?" },
      { kind: "p", text: "**Yurt içi:**" },
      {
        kind: "ul",
        items: [
          "Hizmeti birlikte yürüttüğümüz uzman (ziraat mühendisi) ve saha personeli: Şirket çalışanı olarak ya da Şirket adına ve talimatıyla çalışan veri işleyen olarak; yalnızca görev için gerekli bilgiler.",
          "Davet ettiğiniz hissedarlar: Bahçe'nin raporlarını görür; fatura ve iletişim bilgilerinizi görmez.",
          "SMS hizmet sağlayıcısı: [Netgsm], Şirket adına veri işleyen olarak; telefon numarası ve mesaj metni (mesajda bahçe adı ve portal bağlantısı bulunabilir). İletişim tercihiniz WhatsApp olsa da mesajlar şimdilik SMS olarak gönderilir.",
          "Ödeme kuruluşu: [iyzico Ödeme Hizmetleri A.Ş.], kartla ödemede. Aktarılan: ad, soyad, telefon, e-posta, fatura adresi, IP adresi, sipariş tutarı ve kalemleri. T.C. kimlik numarası yalnızca ödeme kuruluşu zorunlu tutarsa aktarılır. Kart bilgilerini doğrudan ödeme kuruluşuna girersiniz. Ödeme kuruluşu, ödeme hizmetleri ve suç gelirlerinin aklanmasının önlenmesi mevzuatından doğan kendi yükümlülükleri için bu verileri bağımsız veri sorumlusu olarak işler; ayrıntılar ödeme kuruluşunun aydınlatma metnindedir.",
          "Bankalar: kart ödemesinde kartı veren banka (3D Secure doğrulaması, ödeme kuruluşu aracılığıyla); havale/EFT'de ödemenin geldiği ve iadenin gönderildiği bankalar. Aktarılan: ad soyad, tutar, açıklama (referans numarası), iadede IBAN.",
          "Mali müşavir. Kanunen yetkili kamu kurumları, talep halinde.",
        ],
      },
      {
        kind: "p",
        text: "**Yurt dışı:** Hizmetin altyapısı yurt dışında yerleşik sağlayıcılarla çalışır.",
      },
      {
        kind: "table",
        head: ["Sağlayıcı", "Ne için", "Verinin bulunduğu yer", "Aktarılan"],
        rows: [
          [
            "[Supabase Inc.]",
            "Veritabanı, dosya deposu, giriş",
            "Avrupa Birliği (Almanya); şirket merkezi ABD",
            "Bu metindeki veriler",
          ],
          [
            "[Vercel Inc.]",
            "Web sitesinin ve portalın barındırılması",
            "Avrupa Birliği; şirket merkezi ABD",
            "Site ve portal kullanımı sırasında geçen veriler; IP adresi ve istek kayıtları",
          ],
          [
            "[Bulut işleme sağlayıcısı: seçilince adı yazılır]",
            "Görüntülerin işlenmesi",
            "Avrupa Birliği",
            "Ham video, konum kayıtları ve panoramalar (ham veri en fazla 30 gün)",
          ],
          [
            "[Anthropic PBC]",
            "Yapay zekâ ön değerlendirmesi",
            "Amerika Birleşik Devletleri",
            "Yalnızca panorama kesitleri ve mozaikleri, ağaç kodu, mevsim, ölçek tanımları ve saha personelinin evet/hayır cevapları. Görüntülerde bahçede bulunan kişiler görünebilir. **Adınız, telefonunuz, tapu bilgileriniz, parsel adı, köy ve sorularınız gönderilmez.** Sonuçlar sağlayıcıda en fazla 29 gün tutulur",
          ],
          [
            "[Cloudflare Inc.]",
            "Kayıt ve demo sayfalarında robot doğrulaması",
            "ABD ve küresel ağ",
            "IP adresi, tarayıcı ve cihaz bilgisi",
          ],
        ],
      },
      {
        kind: "p",
        text: "Bu ülkeler için yeterlilik kararı bulunmamaktadır. Sunucuların Avrupa Birliği'nde olması aktarımı ortadan kaldırmaz. Yurt dışına aktarım, Kanun'un 9. maddesinin 4. fıkrası uyarınca, her sağlayıcıyla Kişisel Verileri Koruma Kurulu'nun ilan ettiği standart sözleşme imzalanarak ve sözleşme imzalanmasından itibaren beş iş günü içinde Kişisel Verileri Koruma Kurumu'na bildirilerek yapılır. Standart sözleşmesi bulunmayan bir sağlayıcıya kişisel veri aktarılmaz. Yapay zekâ ön değerlendirmesi başka bir sağlayıcı üzerinden yapılırsa bu tablo güncellenir.",
      },
      { kind: "h2", text: "6. Nasıl topluyoruz?" },
      {
        kind: "ul",
        items: [
          "Sizinle yapılan görüşmede ve sözleşmede, sözlü ya da yazılı olarak.",
          "Portalda.",
          "Bahçenizde, saha personelimizin kullandığı tarama ekipmanı (360° kamera, uydu konumlama) ve saha uygulamasıyla. Bu kayıtlar otomatik yolla toplanır.",
          "Hissedarlarınızın ve sahada sınırı gösterecek kişinin bilgilerini sizden alırız.",
        ],
      },
      { kind: "h2", text: "7. Ne kadar saklıyoruz?" },
      {
        kind: "table",
        head: ["Veri", "Süre"],
        rows: [
          [
            "Ham video ve konum (GNSS) kayıtları",
            "İşlenip kalite kontrolünden geçtikten sonra en fazla 30 gün",
          ],
          [
            "Panoramalar, panorama kesitleri ve raporda kullanılmayan diğer görüntüler",
            "Sözleşme süresince ve Bahçe'nin hizmetten çıkmasından ya da sözleşmenin sona ermesinden sonra 2 yıl",
          ],
          [
            "Raporlar (PDF ve rapor verisi, raporda gösterilen ağaç görüntüleri dahil), uzman değerlendirmeleri, portal soruları ve cevapları",
            "Sözleşme süresince ve sona ermesinden sonra 10 yıl",
          ],
          [
            "Kimlik, iletişim ve fatura profili bilgileri",
            "Sözleşme süresince ve sona ermesinden sonra 10 yıl",
          ],
          [
            "Fatura, ödeme ve iade kayıtları, makbuzlar",
            "İşlemin yapıldığı takvim yılının sonundan itibaren 10 yıl",
          ],
          [
            "Mesafeli sözleşme ve ön bilgilendirme metinleri ve onayları, aydınlatma teyidi ve rıza kayıtları",
            "Onay tarihinden itibaren 10 yıl",
          ],
          ["İşlem (denetim) kayıtları", "Kaydın oluşturulmasından itibaren 10 yıl"],
          [
            "Sınırı gösteren kişinin telefonu",
            "Sözleşme süresince; Bahçe'nin erişim süresinin sonunda silinir. Envanter kaydındaki adı ve rolü raporla birlikte saklanır",
          ],
          ["Tamamlanmamış kayıtlar (telefonu doğrulanmamış hesap)", "24 saat; sonra silinir"],
          ["Kayıt denemesi özetleri (IP, telefon ve e-posta özeti)", "2 gün"],
          [
            "Giriş doğrulama kodlarının gönderim kaydı",
            "7 gün (telefonla giriş denemesi kayıtları 1 gün)",
          ],
          ["Bildirim kayıtları", "12 ay"],
          [
            "Oturum kayıtları (IP adresi, tarayıcı bilgisi)",
            "Oturum sona erdikten sonra en fazla 30 gün",
          ],
          ["Sunucu ve altyapı kayıtları (IP adresi, istek zamanı)", "En fazla 30 gün"],
          ["Yapay zekâ sağlayıcısındaki sonuçlar", "En fazla 29 gün"],
          [
            "Portal erişimi",
            "Bahçe hizmetten çıkarıldıktan ya da sözleşme sona erdikten sonra 90 gün salt okunur (devirde erişim çıkış gününde kalkar); sonra kapanır. Erişimin kapanması verilerin silinmesi anlamına gelmez; veriler bu tablodaki süreler boyunca saklanır",
          ],
        ],
      },
      {
        kind: "p",
        text: "Süre dolunca veriler, en geç altı ayda bir yapılan periyodik imhayla silinir, yok edilir ya da anonim hale getirilir. Bahçeye ait ölçüm ve bulgular, konum ve sizinle bağlantısı çıkarılıp toplu istatistiğe dönüştürülerek anonim hale getirildikten sonra saklanabilir.",
      },
      { kind: "h2", text: "8. Haklarınız (Kanun md. 11)" },
      { kind: "p", text: "Şirket'e başvurarak:" },
      {
        kind: "ul",
        items: [
          "Kişisel verinizin işlenip işlenmediğini öğrenebilirsiniz.",
          "İşlenmişse buna ilişkin bilgi isteyebilirsiniz.",
          "İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenebilirsiniz.",
          "Yurt içinde ya da yurt dışında aktarıldığı üçüncü kişileri bilebilirsiniz.",
          "Eksik ya da yanlış işlenmişse düzeltilmesini isteyebilirsiniz.",
          "Kanun'un 7. maddesindeki şartlarla silinmesini ya da yok edilmesini isteyebilirsiniz.",
          "Düzeltme, silme ve yok etme işlemlerinin, verinin aktarıldığı üçüncü kişilere bildirilmesini isteyebilirsiniz.",
          "Münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonuç çıkmasına itiraz edebilirsiniz.",
          "Kanuna aykırı işleme nedeniyle zarara uğramışsanız zararın giderilmesini talep edebilirsiniz.",
        ],
      },
      {
        kind: "p",
        text: "**Not:** Raporlardaki sonuçlar yalnızca otomatik sistemlerle verilmez. Yapay zekâ önerileri, raporda yer almadan önce uzman tarafından incelenir ve onaylanır.",
      },
      {
        kind: "p",
        text: "**Başvuru:** Haklarınız için başvurunuzu, kimliğinizi doğrulayan bilgilerle şu yollarla yapabilirsiniz:",
      },
      {
        kind: "ul",
        items: [
          "yazılı olarak [adres]'e,",
          "kayıtlı elektronik posta ile [KEP]'e,",
          "güvenli elektronik ya da mobil imzayla,",
          "ya da sistemimizde kayıtlı e-posta adresinizden [kvkk@alanadi]'ye.",
        ],
      },
      {
        kind: "p",
        text: "E-postayla yapılan başvurularda kimliğinizi doğrulamak için kayıtlı telefonunuza bir kod gönderilir. Başvurunuz en geç 30 gün içinde ücretsiz sonuçlandırılır. Mevzuat gereği saklamak zorunda olduğumuz veriler (fatura, ödeme ve sözleşme kayıtları gibi) saklama süresi dolmadan silinmez; bu durumda gerekçesi size bildirilir ve bu veriler yalnızca o amaçla saklanır. Bahçede hizmeti süren başka bir sahip varsa onun hizmetine ait bahçe verileri korunur; sizin kişisel verileriniz silinir.",
      },
      { kind: "h2", text: "9. Bahçenizde bulunan diğer kişiler" },
      {
        kind: "p",
        text: "Tarama sırasında bahçenizde çalışan ya da bulunan kişiler (işçiler, bekçi, komşular, yoldan geçenler) görüntülere girebilir. Bu kişilerin görüntüleri bakımından veri sorumlusu Şirket'tir. Görüntüler yalnızca bahçe denetimi amacıyla, Kanun md. 5/2-f'deki meşru menfaatimize dayanılarak işlenir. Kişiler hedeflenerek çekilmez; kişilerin kimliği tespit edilmez, yüz tanıma yapılmaz ve kişiler hakkında değerlendirme yapılmaz. Görüntüleri yalnızca siz, davet ettiğiniz hissedarlar, uzman, saha personeli ve 5. bölümdeki hizmet sağlayıcılar görür. Yurt dışına aktarım 5. bölümdeki güvencelerle yapılır. Saklama süreleri 7. bölümdedir.",
      },
      { kind: "p", text: "Bu kişileri bilgilendirmek için:" },
      {
        kind: "ul",
        items: [
          "Ziyaret tarihi size önceden bildirilir. Bildirimdeki kısa bilgilendirmeyi bahçede çalışacak kişilere iletmenizi isteriz.",
          "Saha personelimiz tarama günü bahçe girişine bilgilendirme levhası koyar, tanıtım kartı taşır ve bahçede rastladığı kişilere kısa sözlü bilgi verir.",
          "Ayrıntılı bilgi [Bahçede bulunan kişiler için aydınlatma metni](/bahcede-bulunanlar) sayfasındadır.",
        ],
      },
      {
        kind: "p",
        text: "Görüntülerde yer aldığını düşünen kişi 8. bölümdeki yollarla başvurabilir ve görüntüsünün gizlenmesini isteyebilir.",
      },
    ],
  },
  explicit_consent: {
    title: "Açık Rıza ve Ticari Elektronik İleti Onayı Metni",
    description: "İsteğe bağlı tanıtım iletileri onayı; İYS kaydından sonra sorulur.",
    source: "docs/hukuk/acik-riza-metni.md",
    blocks: [
      {
        kind: "p",
        text: "Bu metin, açık rızanıza ve ticari elektronik ileti onayınıza dayanan tek işlemi anlatır: tanıtım iletilerinin gönderilmesi. Hizmetin verilmesi için gereken işlemler (görüntülerin işlenmesi ve hizmet sağlayıcılara aktarımı dahil) açık rızaya dayanmaz; [Aydınlatma Metni](/kvkk)'nde yazılı hukuki sebeplere ve güvencelere dayanır.",
      },
      {
        kind: "p",
        text: "Bu onay, Şirket'in İleti Yönetim Sistemi (İYS) kaydı ve entegrasyonu tamamlandıktan sonra kayıt formunda ve portalda sorulur. O tarihe kadar size tanıtım iletisi gönderilmez.",
      },
      { kind: "p", text: "**Tanıtım iletileri**" },
      {
        kind: "p",
        text: "☐ OBA Bilişim Teknolojileri LTD.'nin orchadOS hizmetine ilişkin yenilik, kampanya ve tanıtımlarını bana kısa mesajla (SMS) göndermesine ticari elektronik ileti onayı veriyorum ve bu amaçla adımın ve telefon numaramın işlenmesine açık rıza veriyorum. Onayım İleti Yönetim Sistemi'ne (İYS) kaydedilir.",
      },
      {
        kind: "ul",
        items: [
          "Onay vermemem hizmeti almama engel değildir.",
          "Onayımı istediğim zaman portaldan (Hesabım › İzinler), İYS üzerinden ya da iletilerdeki ret yoluyla ücretsiz geri alabilirim.",
          '"Rapor hazır", "kritik bulgu", ziyaret tarihi, teklif, ödeme, iade, hatırlatma ve erişim bildirimleri ile giriş kodları bu onaya bağlı değildir; hizmetin parçası olarak gönderilir ve tanıtım içermez.',
        ],
      },
    ],
  },
  privacy: {
    title: "Gizlilik ve Çerez Politikası",
    description: "Site, portal ve demo turunda gizlilik ve çerezler.",
    source: "docs/hukuk/gizlilik-cerez-politikasi-taslagi.md",
    blocks: [
      { kind: "h2", text: "1. Kapsam" },
      {
        kind: "p",
        text: "Bu politika orchadOS sitesini ([alanadi]) ve müşteri portalını kapsar. Veri sorumlusu OBA Bilişim Teknolojileri LTD.'dir [tam unvan].",
      },
      { kind: "h2", text: "2. Siteyi gezerken" },
      {
        kind: "ul",
        items: [
          "Sitenin herkese açık sayfalarında hesap açmadıkça sizden kişisel veri istenmez.",
          "Sunucu ve altyapı kayıtlarında, güvenlik amacıyla, IP adresi ve istek zamanı en fazla 30 gün tutulur.",
          "Kayıt formunda ve demo turunu başlatma sayfasında, kötüye kullanımı ve otomatik kayıtları önlemek için Cloudflare Inc.'in Turnstile hizmeti kullanılır. Bu hizmet doğrulama için IP adresinizi, tarayıcı ve cihaz bilgilerinizi işler. Hukuki sebep, bilgi güvenliğine ilişkin meşru menfaatimizdir (KVKK md. 5/2-f). Veriler ABD'de yerleşik sağlayıcıya, Kanun md. 9'a uygun standart sözleşmeyle aktarılır.",
          "Reklam ve izleme amaçlı üçüncü taraf araç (analitik, reklam pikseli) kullanılmaz.",
        ],
      },
      { kind: "h2", text: "3. Çerezler" },
      {
        kind: "p",
        text: "Yalnızca sitenin ve portalın çalışması ve güvenliği için kesinlikle gerekli çerezler kullanılır. Oturum çerezi talep ettiğiniz hizmetin sunulması (KVKK md. 5/2-c), robot doğrulaması çerezleri bilgi güvenliği (md. 5/2-f) için kullanılır. Bu çerezler için onayınız istenmez; bu nedenle çerez onay penceresi gösterilmez. Analitik, reklam ya da izleme çerezi kullanılmaz; ileride kullanılırsa önceden onayınız istenir.",
      },
      {
        kind: "table",
        head: ["Çerez", "Amaç", "Süre"],
        rows: [
          [
            "sb-…-auth-token",
            "Oturumunuzu açık tutar (giriş)",
            "Oturum yenilendikçe; çıkışta silinir",
          ],
          [
            "Turnstile çerezleri",
            "Robot doğrulaması (kayıt ve demo turu başlatma sayfaları)",
            "Kısa süreli",
          ],
        ],
      },
      {
        kind: "p",
        text: "Tarayıcınızdan çerezleri silebilir ya da engelleyebilirsiniz; bu durumda giriş yapamazsınız.",
      },
      { kind: "h2", text: "4. Hesap ve portal" },
      {
        kind: "ul",
        items: [
          "Kayıtta ad soyad, cep telefonu, e-posta, parola (yalnızca özeti saklanır) ve iletişim tercihi alınır.",
          "Telefon numaranız SMS koduyla doğrulanır. Kayıt denemelerinin kötüye kullanımını önlemek için IP adresinin, telefonun ve e-postanın anahtarlı tek yönlü özeti 2 gün tutulur.",
          "Ödemede kart bilgileriniz ödeme kuruluşuna ([iyzico]) doğrudan girilir; Şirket'e ulaşmaz.",
        ],
      },
      { kind: "h2", text: "5. Demo turu" },
      {
        kind: "ul",
        items: [
          "Demo turu, hesap açmadan ürünü denemeniz için ayrı bir ortamda (demo.[alanadi]) sunulur. Sizden ad, telefon ya da e-posta istenmez. Demo, oturum süresi (3 saat) dolunca silinen geçici bir hesapla açılır; hesabın e-posta adresi rastgeledir ve teslim edilemez. Demodaki kişiler kurgusal, görüntüler sentetiktir.",
          "**İşlenen veriler:** IP adresiniz, tarayıcı ve cihaz bilgileriniz, robot doğrulamasının sonucu.",
          "**Amaç ve hukuki sebep:** Demo oturumunun açılması ve sürdürülmesi (talep ettiğiniz hizmetin sunulması, KVKK md. 5/2-c); kötüye kullanımın önlenmesi ve bilgi güvenliği (meşru menfaatimiz, md. 5/2-f).",
          "**Süreler:** IP adresinizin takma adlandırılmış özeti (anahtarlı özet; IPv6'da /64 önekinin özeti) 48 saat tutulur. Bu özet anonim değildir; anahtarına sahip olan tarafından adresle eşleştirilebileceği için kişisel veri sayılır. Ham IP adresi ve tarayıcı bilgisi oturum kaydında, oturum süresinin bitiminden sonra en geç 20 dakika içinde hesapla birlikte silinir. Giriş sisteminin denetim kayıtlarındaki IP adresi en fazla 30 gün içinde silinir. Altyapı sağlayıcılarımızın sunucu kayıtlarında IP adresi en fazla 30 gün kalır.",
          "**Çerezler:** Yalnızca oturumu açık tutan zorunlu bir oturum çerezi ve robot doğrulaması çerezleri kullanılır; onayınız istenmez.",
          "**Aktarım:** Robot doğrulaması Cloudflare Inc. (ABD), barındırma Supabase Inc. ve Vercel Inc. (sunucular AB'de, şirketler ABD'de) tarafından sağlanır. Aktarım KVKK md. 9'a uygun standart sözleşmeyle yapılır.",
          "Demo turunda hiçbir veri yapay zekâ hizmetine gönderilmez ve analitik kullanılmaz.",
          "Haklarınız için 6. bölüme bakınız.",
        ],
      },
      { kind: "h2", text: "6. Haklarınız" },
      {
        kind: "p",
        text: "KVKK md. 11'deki haklarınız ve başvuru yolları [KVKK Aydınlatma Metni](/kvkk)'nin 8. bölümündedir. İsteğe bağlı açık rızalarınızı portalda Hesabım › İzinler'den değiştirebilirsiniz.",
      },
      { kind: "h2", text: "7. Değişiklikler" },
      {
        kind: "p",
        text: "Bu politika değişirse yeni sürüm bu sayfada yayımlanır; sürüm adı ve tarihi en üstte yazar.",
      },
    ],
  },
  distance_sales: {
    title: "Mesafeli Hizmet Sözleşmesi",
    description:
      "Portalda kurulan bahçe denetim hizmeti sözleşmesi: kapsam, ödeme, cayma hakkı, bahçe ekleme ve çıkarma, yenileme.",
    source: "docs/hukuk/hizmet-sozlesmesi-taslagi.md",
    blocks: [
      {
        kind: "p",
        text: "Bu sözleşme iki yolla kurulur: kâğıt üzerinde imzayla ya da portalda, teklifin elektronik ortamda onaylanmasıyla (mesafeli hizmet sözleşmesi, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği). Portalda kurulduğunda Sahip, onaydan önce [Ön Bilgilendirme Formu](/on-bilgilendirme)'nu okuduğunu ayrıca onaylar. Sitede \"Mesafeli hizmet sözleşmesi\" adıyla bu metin yayımlanır; ayrı bir sözleşme dosyası yoktur. Kâğıt üzerinde imza yalnızca Şirket'in işyerinde atılır; işyeri dışında sözleşme portalda kurulur.",
      },
      { kind: "h2", text: "Madde 1 – Taraflar" },
      {
        kind: "p",
        text: '**Hizmet veren:** OBA Bilişim Teknolojileri LTD. [tam unvan: ticaret sicilindeki gibi], [adres], [vergi dairesi/no], [KEP] ("Şirket")',
      },
      {
        kind: "p",
        text: '**Hizmet alan:** [Ad soyad], [T.C. kimlik no: yalnızca ödeme kuruluşu isterse], [adres], [telefon], [e-posta] ("Sahip"). Portalda kurulan sözleşmede bu bilgiler Sahip\'in hesabından ve fatura profilinden alınır.',
      },
      {
        kind: "p",
        text: '**Tacir Sahip:** Fatura profilinde şirket olarak (unvan ve vergi kimlik numarasıyla; tüzel kişi ya da ticari işletme adına) kayıtlı Sahip bu sözleşmede "tacir Sahip" sayılır. Diğer bütün Sahiplere tüketici hükümleri uygulanır. Bu sınıflandırma, tüketici sayılan Sahip\'in kanuni haklarını sınırlamaz.',
      },
      { kind: "h2", text: "Madde 2 – Konu" },
      {
        kind: "p",
        text: "Bu sözleşme, Sahip'in Ek-1'de listelenen bahçelerinin (her biri \"Bahçe\") Şirket tarafından bağımsız olarak, belirli aralıklarla denetlenmesini düzenler. Denetimin sonuçları uzman onaylı raporlar olarak Sahip'e sunulur. Tarafların hak ve yükümlülükleri bu sözleşmede belirtilmiştir.",
      },
      {
        kind: "p",
        text: "Üyelik dönemi içinde Madde 8D'ye göre eklenen bahçeler, ek teklifin Sahip tarafından onaylanmasıyla ve ek siparişin başladığı gün Ek-1'e girer; ayrıca bir imza gerekmez. Madde 12/3'e göre hizmetten çıkarılan bahçe Ek-1'de çıkış tarihiyle gösterilir. Ek-1 bunlar dışında değiştirilemez; geçmiş kayıtları silinmez. Bu sözleşmenin hükümleri, aksi yazılmadıkça ve sözleşmenin bütününe ilişkin hükümler (Madde 1, 9, 10, 13, 14, 15, 16) dışında, her Bahçe için ayrı ayrı uygulanır; bir Bahçe için yapılan fesih, cayma ya da yapılamayan ziyaret diğer bahçeleri etkilemez.",
      },
      { kind: "h2", text: "Madde 3 – Tanımlar" },
      {
        kind: "ul",
        items: [
          "**Envanter:** Bahçenin kullanım sınırının, ağaçlarının ve boş yerlerinin bir kez haritalanması ve kodlanması.",
          "**Periyodik ziyaret:** Bahçenin 360° kamera ve uydu konumlama ekipmanıyla taranması, seçilen ağaçlarda yakın plan çekimi.",
          "**Uzman:** Değerlendirmeyi yapan ve raporu imzalayan ziraat mühendisi.",
          "**Rapor:** Ziyaret sonuçlarının portalda ve PDF olarak sunulan, uzman imzalı özeti: ağaç ağaç sınıflar, bulgular ve öneriler.",
          "**Portal:** Sahip'in raporlara, haritaya, ağaç karnelerine ve görüntülere eriştiği web uygulaması.",
          "**Metodoloji:** Değerlendirmede kullanılan, sürümü raporda belirtilen ölçek ve kurallar.",
          "**Üyelik dönemi:** İlk siparişin (ya da yenilemenin) hizmet başlangıcından bitişine kadar geçen süre. Ek siparişler temel siparişle aynı gün biter; böylece aynı üyelik dönemindeki bütün bahçelerin hizmeti aynı gün biter. Sahip'in birden fazla üyelik dönemi olabilir (örneğin teklifte ayrı dönem yazıyorsa); her dönem kendi bitiş gününe göre yürür (Madde 12/2).",
          "**Ek sipariş:** Üyelik dönemi içinde yeni bir bahçe için verilen ve hizmeti üyelik döneminin bitiş gününde biten sipariş (Madde 8D).",
          "**Ziyaret hakkı:** Bir bahçe için siparişte yazan periyodik ziyaret sayısı. Tam yıllık siparişte paketteki yıllık ziyaret sayısıdır; ek siparişte Madde 8D/2'ye göre hesaplanır.",
          "**Çıkış günü:** Hizmetten çıkarılan bahçenin hizmette olmadığı ilk gün. Bahçenin son hizmet günü bir önceki gündür.",
        ],
      },
      { kind: "h2", text: "Madde 4 – Hizmetin kapsamı" },
      {
        kind: "ol",
        items: [
          "**Envanter:** Bir kez yapılır; tarihi taraflarca belirlenir.",
          "**Periyodik ziyaretler:** Yılda paketteki sayıda periyodik ziyaret yapılır; sayı teklifte yazar. Dört ziyaretli pakette kış, ilkbahar, yaz ve hasat pencerelerinde birer ziyaret yapılır. Ziyaret pencereleri Ek-2'dedir; kesin tarihler Şirket tarafından hava ve erişim koşullarına göre belirlenir ve Madde 8A/1'e göre önceden bildirilir.",
          "**Rapor:** Her ziyaretten sonra en geç 15 iş günü içinde portalda yayımlanır.",
          "**Kritik bulgu bildirimi:** Ağaç kaybı, hırsızlık izi, yangın riski gibi acil bir durum, uzman onayıyla raporu beklemeden bildirilir. Kritik bulgu bildirimi bekçilik ya da sürekli izleme hizmeti değildir; yalnızca ziyarette görülen bulgular için yapılır.",
          {
            text: "**Hizmetin kapsamında olmayanlar:**",
            children: [
              "Bahçede bakım, ilaçlama, budama gibi işlerin yapılması",
              "Hastalık teşhisi ve laboratuvar analizi",
              "Verim ya da gelir tahmini ve garantisi",
              "Mülkiyet ve sınır tespiti",
              "Bekçilik",
            ],
          },
        ],
      },
      { kind: "h2", text: "Madde 5 – Sahip'in yükümlülükleri" },
      {
        kind: "ol",
        items: [
          "Sahip, Bahçe'nin maliki, paydaşı (hisseli tapuda rızai taksimle kullandığı bölüm dahil), mirasçısı ya da malikin veya paydaşların izniyle Bahçe'yi kullanan kişi (vekil, kiracı, ortakçı) olduğunu ve Şirket personelinin Bahçe'ye girmesine izin vermeye yetkili olduğunu beyan eder; dayanağını başvuruda seçer. Şirket belge istemekle yükümlü değildir. Şüphe ya da itiraz halinde tapu kaydı, vekâletname, mirasçılık belgesi ya da kira sözleşmesi gibi dayanak belgesini görmek isteyebilir; görülen belgenin türü ve tarihi kaydedilir, kopyası saklanmaz. Beyanın gerçeğe aykırı olmasından doğan üçüncü kişi taleplerinden, Şirket'in kusuru bulunmadıkça Sahip sorumludur. Bir malik, paydaş ya da mirasçı itiraz ederse Madde 6/4 uygulanır.",
          "Şirket personelinin ziyaret pencerelerinde Bahçe'ye girmesine izin verir ve erişimi sağlar: kapı, anahtar, bekçi.",
          "Envanter ziyaretinde kullanım sınırını kendisi ya da yetkilendirdiği kişi aracılığıyla gösterir.",
          "Şirket'in bildirdiği ziyaret tarihini ve Şirket'in sağladığı kısa bilgilendirmeyi Bahçe'de çalışacak kişilere (işçi, yevmiyeci, bekçi) önceden iletir. Bu yükümlülük, Şirket'in Kanun md. 10'daki aydınlatma yükümlülüğünü ortadan kaldırmaz; Şirket ayrıca sahada bilgilendirme yapar (Madde 9/2).",
          "İletişim bilgilerindeki değişiklikleri bildirir.",
          "Sahip, sınırı gösterecek kişi ya da hissedar olarak bilgilerini Şirket'e verdiği kişileri, bilgilerinin hizmetin yürütülmesi amacıyla Şirket'e verildiği ve Şirket'in kendileriyle iletişime geçebileceği konusunda bilgilendirir. Erişim notuna bu amaçla gerekli olmayan kişisel bilgi yazmaz. Bu yükümlülük, Şirket'in bu kişileri ilk iletişimde bilgilendirme yükümlülüğünü ortadan kaldırmaz.",
        ],
      },
      { kind: "h2", text: "Madde 6 – Sınır ve konum bilgileri" },
      {
        kind: "ol",
        items: [
          "Haritada gösterilen sınır, Sahip'in ya da yetkilendirdiği kişinin gösterdiği **fiili kullanım sınırıdır**. Tapu sınırı, kadastro ölçümü, mülkiyet ya da kullanım hakkı tespiti değildir; resmi bir sınır belirlemez. Sınır ve mülkiyet uyuşmazlıklarında kanıt olarak sunulmak üzere hazırlanmamıştır. Bu ibare her raporda ve haritada yer alır.",
          "Sahip, gösterdiği ya da yetkilendirdiği kişiye gösterttiği sınırın fiilen kendi kullanımındaki alanı yansıttığını ve bu alana Şirket personelinin girmesine izin vermeye yetkili olduğunu beyan eder. Şirket bu beyanın doğruluğunu araştırmakla yükümlü değildir. Beyanın gerçeğe aykırı olmasından doğan üçüncü kişi taleplerinden, Şirket'in kusuru bulunmadıkça Sahip sorumludur.",
          "Envanterden sonra Sahip, sınırı ve ağaç listesini portalda inceler ve onaylar. Sahip sonradan bir hata fark ederse (örneğin komşu ağaçlarının envantere girmesi) portaldan bildirir. Hata eldeki verilerle ücretsiz düzeltilir; düzeltme için sahada ölçüm gerekiyorsa bu ölçüm sonraki periyodik ziyarette ücretsiz yapılır. Düzeltme sonucunda doğrulanan alan küçülürse kalan ziyaretlerin bedeli yeni alana göre yeniden hesaplanır ve fark iade edilir; alan büyürse o dönem için fark istenmez.",
          "Bahçe'nin sınırına ya da kullanımına üçüncü bir kişi itiraz ederse Şirket, uyuşmazlık konusu alanı uyuşmazlık çözülene kadar değerlendirme dışında bırakabilir; bu alan raporda \"değerlendirilmedi\" olarak gösterilir. İtiraz Bahçe'nin tamamını kapsıyorsa Şirket taramayı askıya alabilir. Askı ziyaret penceresinin sonuna kadar sürerse Şirket Bahçe'yi Madde 12/3'e göre hizmetten çıkarabilir; kullanılmayan ziyaretlerin bedeli iade edilir.",
          "Şirket, raporları ve haritayı sınır ve mülkiyet uyuşmazlıklarında taraflardan biri lehine kanıt ya da bilirkişi görüşü olarak düzenlemez; kanuni zorunluluklar saklıdır.",
        ],
      },
      { kind: "h2", text: "Madde 7 – Değerlendirmenin niteliği" },
      {
        kind: "ol",
        items: [
          "Raporlar, Bahçe'nin ziyaret tarihindeki **görünür durumunu** yansıtır. Ağaç sınıfları ve bulgular, görüntülere ve sahada yapılan gözlemlere dayanır.",
          "Değerlendirmelerde yapay zekâ ön değerlendirmesinden yararlanılabilir. Raporda yer alan her sonuç Uzman tarafından incelenir ve onaylanır.",
          "Değerlendirme hastalık teşhisi, laboratuvar analizi ya da verim garantisi değildir. Uzman önerilerini mesleki özenle verir; öneriler tavsiye niteliğindedir ve uygulanıp uygulanmayacağına Sahip karar verir.",
          'Görüntülerin alınamadığı ya da yetersiz kaldığı ağaçlar raporda "değerlendirilmedi" olarak belirtilir.',
          "Kullanılan metodoloji sürümü her raporda belirtilir.",
        ],
      },
      { kind: "h2", text: "Madde 8 – Ücret ve ödeme" },
      {
        kind: "ol",
        items: [
          "**Yıllık hizmet bedeli:** Teklifte yazan tutardır. Yıllık ziyaret sayısı, doğrulanan alan (dönüm) ve paketin dönüm ve ziyaret başı birim fiyatının çarpımıdır; bahçe başına en az ücret ve ilk yıl bir kez envanter ücreti eklenir. KDV ayrıca gösterilir. Teklif, geçerlilik süresi içinde değişmez. Teklifte her bahçe ayrı bir satırdır ve satırın tutarı ayrıca gösterilir. Üyelik dönemi içinde eklenen bahçenin bedeli Madde 8D'ye göre hesaplanır.",
          "**Ödeme:** Teklif onaylandıktan sonra peşin ve tek çekimdir: kartla (3D Secure, [ödeme kuruluşu: iyzico] üzerinden) ya da havale/EFT ile. Kart bilgileri Şirket'e ulaşmaz. Şirket, ödeme yöntemlerinin hiçbiri için toplam bedelin dışında ücret almaz; havale/EFT ile ödemede Sahip'in kendi bankasının alabileceği gönderim ücreti Sahip'e aittir. Hizmet, ödeme tamamlanmadan başlamaz. Ödeme siparişte yazan ödeme süresi içinde yapılmazsa Şirket ek süre vermeden siparişi iptal edebilir ya da ödeme süresini uzatabilir; uzatma Sahip'e bildirilir. Sahip de ödemeden önce siparişi bedelsiz iptal edebilir (Madde 8C/1). Sipariş iptal edilmedikçe süre geçtikten sonra yapılan ödeme kabul edilir ve sipariş etkinleşir; ek siparişte Madde 8D/5 ve 8D/6 saklıdır. Ödenmeyen sipariş için taraflar birbirinden bedel, faiz ya da tazminat istemez.",
          "**Belge:** Her ödeme için portalda bir makbuz verilir; makbuz fatura değildir. Fatura, ödemenin tamamlandığı gün ya da en geç 7 gün içinde, Sahip'in fatura profilindeki bilgilerle elektronik ortamda düzenlenir (e-Fatura mükellefi Sahip'e e-Fatura, diğerlerine e-Arşiv Fatura) ve portalda ve SMS bağlantısıyla iletilir. İadelerde vergi mevzuatına uygun düzeltme belgesi düzenlenir; her iadenin KDV payı ayrıca gösterilir.",
          '**Pilot dönemi:** [Şirket kararıyla doldurulur: "[başlangıç]–[bitiş] arasında kurulan sözleşmelerde ilk hizmet yılının bedeli ücretsizdir" ya da "… %[oran] indirimlidir"; envanter ücreti [alınmaz / …]]. Pilot sonunda ücretli döneme kendiliğinden geçilmez; devam için yenileme teklifi onaylanır ve ödenir. İndirim teklif satırında ayrıca gösterilir.',
          "**Hizmetin başlaması:** Hizmet yılı ödemenin tamamlandığı gün (teklifte daha ileri bir başlangıç günü yazıyorsa o gün) başlar ve bir yıl sürer. Bu süre üyelik dönemidir. Ek siparişin hizmeti Madde 8D'ye göre başlar ve üyelik döneminin bitiş gününde biter.",
        ],
      },
      { kind: "h2", text: "Madde 8A – Yapılamayan ziyaretler" },
      {
        kind: "ol",
        items: [
          "**Ziyaret tarihi:** Şirket her periyodik ziyaretin tarihini Sahip'e en az 3 gün önce SMS ya da telefonla bildirir. Sahip ziyaretten en geç 24 saat önce bir kez erteleme isteyebilir; ziyaret aynı pencere içinde yeniden planlanır.",
          "**Sahip'ten kaynaklanmayan nedenler:** Hava, Sahip'ten kaynaklanmayan erişim engelleri (yolun kapanması, sel, resmi yasak gibi), mücbir sebep ya da Şirket'ten kaynaklanan bir nedenle yapılamayan ziyaret aynı ziyaret penceresi içinde yeniden planlanır. Pencere içinde yapılamazsa o ziyaretin bedeli Sahip'e iade edilir. Ziyaret bedeli, Bahçe'nin teklif satırındaki tutardan envanter payı çıkarıldıktan sonra kalanın, o satırdaki ziyaret hakkına bölünmesiyle bulunur. Tam yıllık siparişte bu, yıllık bedelin (envanter ücreti hariç) paketteki yıllık ziyaret sayısına bölünmesidir. Şirket iadeyi Sahip'in talebini beklemeden başlatır; iade, ödemenin yapıldığı yöntemle ve pencerenin bitiminden sonra en geç 14 gün içinde yapılır. Sahip isterse, iade yerine ziyaret aynı üyelik dönemindeki bir sonraki pencereye aktarılır; aktarma Sahip'in portal ya da yazılı talebiyle yapılır ve dönemin son penceresinden sonraya aktarma yapılmaz.",
          "**Sahip'ten kaynaklanan nedenler:** Sahip'in Madde 5/2–3'teki yükümlülüklerini (erişimin sağlanması: kapı, anahtar, bekçi; sınırı gösterecek kişinin bulunması) bildirilen ziyaret gününde yerine getirmemesi nedeniyle ziyaret yapılamazsa Şirket durumu belgeler (zaman damgalı fotoğraf ve not), aynı gün Sahip'e bildirir ve aynı pencere içinde en az bir yeni tarih önerir. Önerilen tarihte de ziyaret aynı nedenle yapılamazsa ziyaret yapılmış sayılır ve iade yapılmaz. Pencere içinde yeni bir tarih önerilemiyorsa 2. fıkra uygulanır.",
          "Mücbir sebep halinde Madde 13 ve bu maddenin 2. fıkrası uygulanır.",
          "Bu madde uyarınca bir Bahçe için yapılmış iade, aynı Bahçe daha sonra hizmetten çıkarılırsa Madde 12/3'e göre hesaplanan iadeden düşülür. Bedeli bu maddeye göre iade edilmiş ziyaret, Madde 12/3'teki hesapta kullanılmamış ziyaret sayılır; düşme, aynı ziyaretin bedelinin iki kez iade edilmesini önler.",
          "Şirket, her ziyaret penceresinin ve hizmet döneminin sonunda yapılamayan ziyaretleri kendiliğinden tespit eder; Sahip'in talebini beklemeden bu maddeye göre iade eder ya da Sahip isterse aktarır.",
        ],
      },
      { kind: "h2", text: "Madde 8B – Cayma hakkı" },
      {
        kind: "ol",
        items: [
          "Sözleşme portalda kurulmuşsa Sahip, **14 gün** içinde hiçbir gerekçe göstermeden ve cezai şart ödemeden cayabilir. Kanuni cayma süresi sözleşmenin kurulduğu (teklifin onaylandığı) gün başlar; Şirket, Sahip lehine olarak süreyi ödemenin tamamlandığı (siparişin etkinleştiği) günden başlatır. Hizmetin başlangıcı teklifte daha ileri bir gün olsa bile (örneğin yenilemede) süre bu günden sayılır. Sürenin son günü ödeme gününden 14 gün sonraki gündür ve süreye dahildir; örneğin ödemesi 1 Mart'ta tamamlanan siparişte 15 Mart. Cayma süresi hizmet başlamadan dolmuşsa Sahip Bahçe'yi Madde 12/3'e göre hizmetten çıkarabilir; hiç ziyaret yapılmadığı için envanter payı dışındaki tutarın tamamı, envanter de yapılmadıysa satırın tamamı, ödenmiş ve başlamamış yenilemede satırın tamamı iade edilir. Ek siparişin cayma süresi Madde 8D/7'dedir.",
          "Cayma bildirimi portaldan, [e-posta] ya da [KEP] adresine ya da [Adres]'e yazılı olarak yapılır. Ek-7'deki örnek cayma formu kullanılabilir; açık bir yazılı beyan da yeterlidir. Bildirimde bir Bahçe belirtilmişse cayma yalnızca o Bahçe için kullanılmış olur. Süre içinde gönderilen bildirim yeterlidir. Şirket bildirimin alındığını gecikmeksizin SMS ile ve portalda teyit eder.",
          "Şirket, cayma bildiriminin kendisine ulaştığı günden itibaren en geç **14 gün** içinde tahsil ettiği tutarın tamamını, ödemenin yapıldığı yöntemle ve Sahip'e bir masraf yüklemeden iade eder; 4. fıkradaki kesintiler saklıdır.",
          "**Hizmete cayma süresi içinde başlanması:** Sahip, teklifi onaylarken ayrı ve işaretsiz bir kutuyu işaretleyerek hizmete (envanter ve periyodik ziyaretler) cayma süresi dolmadan başlanmasını talep edebilir. Bu talep yoksa Şirket cayma süresi bitmeden Bahçe'de envanter ve ziyaret yapmaz. Talep üzerine hizmete başlandığında Mesafeli Sözleşmeler Yönetmeliği md. 15/1-(h) uyarınca kanuni cayma hakkı sona erer. Şirket buna rağmen, cayma süresinin sonuna kadar Sahip'e aynı yollarla kullanılabilecek, sözleşmeden doğan bir cayma hakkı tanır; bu hak bütün bahçeler için ya da 5. fıkraya göre tek bir Bahçe için kullanılabilir. Bu hak kullanılırsa, envanter sayımı yapıldıysa envanterin payı ve yapılmış periyodik ziyaretlerin bedeli (Madde 8A/2'deki ziyaret bedeliyle) iadeden düşülür ve kalan tutar 3. fıkradaki gibi iade edilir. Düşülen tutar yapılmış hizmetin sözleşmedeki bedelidir, cezai şart değildir. Envanter payı Madde 12/3'teki gibi hesaplanır. Hizmete başlanmadan kullanılan caymada tahsil edilen tutarın tamamı iade edilir.",
          '**Tek bahçe için cayma:** Siparişte birden fazla Bahçe varsa Sahip cayma hakkını yalnızca bir Bahçe için de kullanabilir. Portalda Bahçe\'yi hizmetten çıkarırken "Cayma hakkımı kullanıyorum" seçeneğini **açıkça** seçer. Bu seçenek yalnızca cayma süresi içinde gösterilir; Bahçe aynı gün hizmetten çıkar ve o Bahçe\'nin satır tutarı 4. fıkradaki kesintilerle iade edilir. Madde 12/3\'teki zamanlama seçenekleri ("hemen", "30 gün sonra", "dönem sonunda") cayma bildirimi sayılmaz. Cayma süresi içinde başka bir zamanlama seçilirse portal, bu seçimin cayma bildirimi olmadığını ve cayma hakkının sürdüğünü gösterir.',
          "Sahip tacir Sahip ise (Madde 1), Şirket bu maddedeki cayma hakkını aynı koşullarla sözleşmeye dayanarak tanır.",
        ],
      },
      { kind: "h2", text: "Madde 8C – Ödeme sonrası iptal ve iade" },
      {
        kind: "ol",
        items: [
          "Ödemeden önce Sahip siparişi portaldan iptal edebilir; bir bedel doğmaz.",
          "Cayma süresinden sonra yapılan fesihte ve bahçe çıkarmada Madde 12/3 uygulanır.",
          "İade yöntemi ve süreleri [İptal ve İade Politikası](/iade)'nda yazılıdır.",
        ],
      },
      { kind: "h2", text: "Madde 8D – Dönem içinde bahçe ekleme" },
      {
        kind: "ol",
        items: [
          "**Ek sipariş:** Sahip üyelik dönemi içinde portaldan yeni bir bahçe için başvurabilir. Şirket alanı ve konumu doğrular ve **ek teklif** verir. Ek teklif üyeliğin paketiyle ve teklif günü yürürlükte olan yayımlı fiyat listesiyle hesaplanır. Ek siparişin hizmeti, ödemenin tamamlandığı gün (teklifte daha ileri bir başlangıç günü yazıyorsa o gün) başlar ve üyelik döneminin bitiş gününde biter. Eklenen bahçe Ek-1'e girer ve sonraki yenileme teklifine dahil edilir.",
          "**Ziyaret hakkı:** Paketteki yıllık ziyaret sayısı, kalan günün dönemin toplam gününe oranıyla çarpılır. Kalan gün, ek teklifte yazan başlangıç günü (teklif gününden önce olamaz) ile dönemin bitiş günü arasındaki gün sayısıdır (ikisi de dahil). Sonuç en yakın tam sayıya yuvarlanır, yarım yukarı yuvarlanır; en az 1, en çok yıllık ziyaret sayısıdır. Ziyaret hakkı ek teklifte yazılır ve sabittir; ödeme daha sonraki bir gün yapılsa da değişmez. Ek teklif hesabın adımlarını rakamla gösterir: kalan gün ve dönemin toplam günü, ham sonuç ve yuvarlanmış ziyaret hakkı (örneğin 2,35 → 2; 2,5 → 3), ziyaret tutarı, orantılı en az ücret ve hangisinin alındığı, envanter ücreti, KDV, toplam ve aynı bahçenin tam yıllık bedeli; ayrıca kullanılan fiyat listesinin adını ve dönemde kalan ziyaret pencerelerini yazar. Şirket ek teklifin başlangıç gününü, ziyaret hakkı dönemde kalan ziyaret pencerelerinin sayısını aşmayacak biçimde belirler. Sahip'ten teklifte yazan toplam dışında bir bedel istenmez.",
          "**Bedel:** Ziyaret tutarı, ziyaret hakkı × doğrulanan alan (dönüm) × paketin dönüm ve ziyaret başı birim fiyatıdır. Bahçe başına en az ücret aynı oranla (ziyaret hakkı ÷ yıllık ziyaret sayısı) orantılanır ve ikisinden büyük olanı alınır. Envanter ücreti, envanter tek seferlik bir iş olduğu için tam alınır. Daha önce hizmetten çıkarılıp, son yayımlanmış envanterinin tarihinden itibaren 24 ay içinde yeniden eklenen ve sınırı ile ağaç düzeni esaslı biçimde değişmemiş bahçeden envanter ücreti alınmaz; bu süre geçmişse ya da yeni envanter gerekiyorsa envanter ücreti ek teklifte gerekçesiyle ayrı satır olarak gösterilir. KDV ayrıca gösterilir.",
          {
            text: "**Örnek** (bilgi amaçlıdır; tutarlar lansman fiyat listesinin Standart paketinden alınmıştır, güncel fiyat ek teklifte yazar):",
            children: [
              "Üyelik dönemi 1 Kasım 2026–31 Ekim 2027 (365 gün). Paket yılda 4 ziyaret; birim fiyat 180,00 TL (dönüm·ziyaret), bahçe başına en az ücret 11.200,00 TL, envanter ücreti 6.000,00 TL (KDV hariç), KDV %20.",
              "15 dönümlük ek bahçenin hizmeti 1 Nisan 2027'de başlıyor. Kalan 214 gün: 4 × 214 ÷ 365 = 2,35 → **2 ziyaret**.",
              "Ziyaret tutarı 2 × 15 × 180,00 = 5.400,00 TL. Orantılı en az ücret 11.200,00 × 2 ÷ 4 = 5.600,00 TL; büyük olan 5.600,00 TL alınır. Yeni bahçe olduğu için envanter ücreti 6.000,00 TL eklenir. KDV dahil **13.920,00 TL**. Aynı bahçenin envanterle tam yıllık bedeli 20.640,00 TL olurdu.",
            ],
          },
          "**Son ek günü:** Ek teklif, dönemin bitişine (bitiş günü dahil) en az 30 gün kalan son güne kadar geçerlidir; örnekte 2 Ekim 2027. Ek teklif en geç bu gün onaylanır ve ödenir; bu günden sonra onaylanamaz ve kartla ödenemez. Daha sonra gelen bahçe, yenileme ödenip yeni dönem başlayınca yeni döneme tam yıl olarak eklenir.",
          "**Dönem kapanırsa:** Ödeme alındıktan sonra, ancak ek sipariş başlamadan önce üyelik dönemi sona ermiş ya da son ek günü geçmişse (örneğin geç kaydedilen bir havale ya da incelemede kalan bir kart ödemesi), ek sipariş başlamaz ve iptal edilir. Ödenen tutarın tamamı Madde 8B/3'teki gibi iade edilir. İptal Sahip'e SMS ile bildirilir; tutar en geç 14 gün içinde ödemenin yapıldığı yöntemle ve masrafsız iade edilir.",
          "**Ek siparişin niteliği, ödemesi ve cayma süresi:** Ek sipariş, bu sözleşmenin hükümlerine tabi; kendi teklifi, ön bilgilendirmesi, onayı, bedeli, ödemesi, makbuzu ve cayma süresi olan ayrı bir mesafeli sözleşmedir. Her ek teklif onayından önce Ön Bilgilendirme Formu o teklifin bilgileriyle gösterilir ve ayrıca onaylanır. Cayma süresi, Madde 8B/1'deki gibi ek siparişin ödemesinin tamamlandığı (ek siparişin etkinleştiği) günden itibaren 14 gündür; son gün dahildir. Ek siparişte cayma diğer siparişleri, diğer siparişlerde cayma ek siparişi etkilemez. Cayma Madde 8B'ye göre kullanılır.",
          "Ek sipariş, bu maddede yazılanlar dışında bu sözleşmenin hükümlerine tabidir.",
        ],
      },
      { kind: "h2", text: "Madde 9 – Kişisel veriler ve gizlilik" },
      {
        kind: "ol",
        items: [
          "Şirket, kişisel verileri Kişisel Verilerin Korunması Kanunu'na ve Ek-3'teki Aydınlatma Metni'ne uygun olarak işler.",
          "Görüntülerde Bahçe'de bulunan kişiler görünebilir. Bu görüntüler yalnızca hizmet amacıyla işlenir. Sahip, Sahip'in davet ettiği hissedarlar, Uzman, saha personeli ve Aydınlatma Metni'nde sayılan hizmet sağlayıcılar dışında kimseyle paylaşılmaz. Şirket görüntülerdeki kişilerin kimliğini tespit etmez. Tarama günü Bahçe girişine bilgilendirme levhası konur.",
          "Şirket, Sahip'e ait bilgileri ve raporları gizli tutar. Sahip'in yazılı izni olmadan üçüncü kişilere açıklamaz; kanuni zorunluluklar hariç.",
          "**Hissedarlar:** Sahip, portalda hissedarlarını izleyici olarak ekleyebilir. Hissedarlar Bahçe'nin raporlarını görür; Sahip'in fatura ve iletişim bilgilerini ve soru-cevaplarını görmez. Sahip, davet ettiği kişinin Bahçe'de hakkı bulunduğunu ve telefon numarasını Şirket'e vermeye yetkili olduğunu beyan eder. Şirket hissedarı ilk iletişimde Aydınlatma Metni hakkında bilgilendirir.",
          "Sahip, Madde 10/1 uyarınca paylaştığı görüntülerde tanınabilen kişiler bakımından kişisel verilerin korunmasına ilişkin mevzuata uymakla kendisi yükümlüdür.",
        ],
      },
      { kind: "h2", text: "Madde 10 – Fikri haklar ve verinin kullanımı" },
      {
        kind: "ol",
        items: [
          "Raporlar ve görüntüler, Sahip'in Bahçe'ye ilişkin kendi kullanımı için sunulur. Sahip bunları serbestçe kullanabilir ve paylaşabilir.",
          "Değerlendirme yöntemi, yazılım ve metodoloji Şirket'e aittir.",
          "Şirket, hizmetin ve değerlendirme yöntemlerinin geliştirilmesi (yapay zekâ ön değerlendirmesinin uzman kararlarıyla doğrulanması ve kalibrasyonu, metodoloji güncellemesi, kalite ölçümü dahil) amacıyla Bahçe'ye ait görüntüleri ve değerlendirmeleri yalnızca Şirket içinde, erişimi sınırlı olarak ve Sahip'in adı, iletişim ve tapu bilgileriyle ilişkilendirmeden kullanabilir (KVKK md. 5/2-f; Sahip itiraz edebilir). Bu veriler Şirket dışındaki kişilerle paylaşılmaz ve yayımlanmaz; yurt dışındaki hizmet sağlayıcıların kullanımı Aydınlatma Metni'ndeki güvencelere tabidir. Görüntülerin ya da Bahçe verilerinin Şirket dışına verilmesi, yayımlanması ya da tanıtımda (örneğin demo vitrininde) kullanılması Sahip'in ayrı yazılı açık rızasına bağlıdır. Konum ve kişi bağlantısı çıkarılarak tamamen anonim hale getirilmiş toplu istatistikler bu sınırlamaya tabi değildir.",
        ],
      },
      { kind: "h2", text: "Madde 11 – Sorumluluk" },
      {
        kind: "ol",
        items: [
          "Şirket hizmeti özenle ve metodolojiye uygun olarak yürütür; kusuruyla neden olduğu zarardan kanuna göre sorumludur.",
          "Şirket'in edimi, Bahçe'nin ziyaret tarihlerindeki görünür durumunun değerlendirilmesi ve raporlanmasıdır. Şirket, kendi kusurundan kaynaklanmayan şu sonuçlardan sorumlu değildir: Bahçe'deki ürün kaybı, hırsızlık, hastalık ve zararlıların kendisi ve sonuçları; Sahip'in önerileri uygulayıp uygulamamasının sonuçları; ziyaret aralarında oluşan ve ziyarette görülemeyen değişiklikler. Ziyaretler ve kritik bulgu bildirimi, Bahçe'deki her riskin tespit edileceğini garanti etmez.",
          "**Sahip tacir Sahip ise (Madde 1): Şirket'in hafif kusurundan doğan sorumluluğu, zararın doğduğu üyelik döneminde ilgili Bahçe için ödenen hizmet bedeliyle sınırlıdır ve dolaylı zararları (kâr kaybı, ürün değeri kaybı) kapsamaz. Bu sınırlama kast ve ağır kusurda, ölüm ve bedensel zararlarda uygulanmaz.**",
          "Tüketici Sahip bakımından kanunun emredici hükümleri saklıdır.",
        ],
      },
      { kind: "h2", text: "Madde 12 – Süre ve fesih" },
      {
        kind: "ol",
        items: [
          "Sözleşme, kurulduğu anda (portalda teklifin onaylanmasıyla, kâğıtta imzayla) yürürlüğe girer. Hizmet yılı Madde 8/5'e göre başlar ve 1 yıl sürer; bu süre bir yılı aşmaz. Ek siparişler bu sürenin sonunda biter (Madde 8D).",
          {
            text: "**Yenileme:** Hizmet yılı bitmeden en az 45 gün önce Şirket, Sahip'e portalda yenileme teklifi gönderir. Yeni dönemin fiyatı o gün yayımlı fiyat listesine göre hesaplanır.",
            children: [
              "Yenileme teklifi, o gün hizmette olan **bütün bahçeleri**, ek siparişle eklenenler dahil, tek teklifte kapsar. Hizmetten çıkmakta olan bahçe yenilemeye girmez. Sahip'in birden fazla üyelik dönemi varsa her dönemin yenileme teklifi ayrı verilir; Şirket, yenileme zamanında bahçeleri ek teklifle tek döneme toplamayı önerebilir.",
              "Sözleşme **kendiliğinden uzamaz ve kart otomatik olarak çekilmez.** Bu kural kâğıt üzerinde kurulan sözleşmeler için de geçerlidir. Sahip yenileme teklifini onaylayıp ödediğinde yeni hizmet yılı, önceki yılın bitişinin ertesi günü başlar.",
              "Yenileme, ayrı bir mesafeli sözleşmedir; onaydan önce Ön Bilgilendirme Formu o teklifin bilgileriyle gösterilir ve onaylanır, yeni bir cayma süresi başlar (Madde 8B/1).",
              "Sahip yenileme teklifini onaylamazsa hizmet yılın sonunda biter ve 4. fıkra uygulanır.",
            ],
          },
          {
            text: '**Fesih ve bahçe bazında çıkarma:** Sahip sözleşmeyi bütün bahçeler için ya da yalnızca bir Bahçe için dilediği zaman feshedebilir; fesih, Sahip\'in seçtiği çıkış gününde hüküm doğurur. Şirket ise yalnızca aşağıda sayılan sebeplerle feshedebilir. Bahçe bazında fesih "bahçe çıkarma"dır.',
            children: [
              {
                text: "**Talep:** Sahip portalda Bahçe'nin sayfasından ya da Hesabım › Bahçelerim'den talepte bulunur; nedenini ve zamanını **açıkça** seçer (varsayılan seçenek yoktur):",
                children: [
                  "**hemen:** çıkış günü talep gününün ertesi günüdür;",
                  "**30 gün sonra:** çıkış günü, talep gününden 30 gün sonrası ile Bahçe'nin hizmet döneminin bitişinin ertesi gününden hangisi önce geliyorsa odur;",
                  "**dönem sonunda:** çıkış günü, Bahçe'nin hizmet döneminin bitişinin ertesi günüdür;",
                  "**cayma hakkıyla bugün:** yalnızca cayma süresi içinde ve Madde 8B/5'e göre.",
                ],
              },
              "**Kendiliğinden hüküm:** Talep, Şirket'in onayını beklemeden çıkış gününde hüküm doğurur. Şirket çıkış tarihini teyit eder; tarih yalnızca Sahip'le anlaşarak değiştirilebilir ve Sahip'e SMS ile bildirilir. Sahip, çıkış gününe kadar talebini portaldan geri alabilir.",
              "**Şirket'in çıkarması:** Şirket bir Bahçe'yi yalnızca şu haklı sebeplerle hizmetten çıkarabilir: Bahçe'nin hizmet bölgesi dışında kalması; Sahip'in Madde 5'teki yükümlülüklerini esaslı biçimde ya da tekrar tekrar ihlal etmesi (örneğin iki ziyaret penceresi boyunca erişimin sağlanamaması); Sahip'in yetkisinin bulunmaması ya da Madde 6/4'teki üçüncü kişi itirazı; personelin güvenliğini tehdit eden bir durum; Bahçe'nin devri (satış); mükerrer kayıt; Şirket'in bölgede hizmeti bütünüyle sona erdirmesi. Şirket çıkarmayı en az 30 gün önceden Sahip'e SMS ile bildirir; güvenlik tehdidi, mükerrer kayıt, yetkisizlik ve üçüncü kişi itirazı hallerinde bildirim süresi aranmaz. Bahçe Sahip'le anlaşarak da hizmetten çıkarılabilir; bu durumda Sahip'in onayı yazılı olarak kaydedilir. Şirket'in çıkarmasında kullanılmayan bütün ziyaretlerin bedeli iade edilir; bildirim süresi içinde Şirket ziyaret yapmazsa o ziyaretler kullanılmamış sayılır. Bahçe'nin devrinde (satış) Madde 12/4'teki erişim süresi uygulanmaz.",
              "**Ödeme bekleyen sipariş:** Bahçe, ödemesi beklenen bir siparişte de yer alıyorsa (örneğin onaylanmış ama ödenmemiş bir yenileme), o sipariş iptal edilmeden ya da düzeltilmeden çıkarma talebi alınmaz. Portal, aynı işlemde bekleyen siparişi iptal etme seçeneği sunar.",
              "**Çıkış gününde:** Bahçe'nin bütün planlı ziyaretleri iptal edilir ve Bahçe pasif olur. Çıkış gününden önce yapılmış ziyaretlerin raporları yayımlanır. Bahçe'nin verileri çıkışla silinmez; 4. fıkradaki gibi saklanır.",
              {
                text: "**İade hesabı:** Bahçe'nin teklif satırı esas alınır ve tutarlar KDV dahildir.",
                children: [
                  "Envanter payı = satır tutarı × envanter ücreti ÷ satırın KDV ve indirim öncesi tabanı.",
                  "Ziyaret bedeli = (satır tutarı − envanter payı) ÷ satırdaki ziyaret hakkı (Madde 8A/2); kuruşa aşağı yuvarlanır.",
                  "İade = satır tutarı − (envanter yapıldıysa) envanter payı − kullanılmış ziyaret sayısı × ziyaret bedeli; böylece yuvarlamadan kalan kuruş farkı Sahip lehine iadeye girer. Hiç ziyaret yapılmadıysa satır tutarının envanter payı dışındaki tamamı, envanter de yapılmadıysa satırın tamamı iade edilir.",
                  "Bu Bahçe'nin satırı için daha önce yapılmış ya da başlatılmış ziyaret ve hizmet bedeli iadeleri, Madde 8A iadeleri dahil, sonuçtan düşülür. Madde 8A'ya göre bedeli iade edilmiş ziyaret bu hesapta kullanılmamış ziyaret sayılır. Fazla ödemenin iadesi gibi Şirket kaynaklı iadeler düşülmez. Sonuç sıfırdan küçükse iade yapılmaz.",
                  "Her iadenin KDV payı ayrıca gösterilir.",
                ],
              },
              "**Kullanılmış sayılan ziyaret:** Bahçe'nin hizmet başlangıcı ile çıkış gününden önceki gün arasında yapılmış periyodik ziyaretlerdir. Şirket'in kendi gerektirdiği yeniden taramalar (görüntü kalitesi ya da kapsama nedeniyle işleme hattının ya da Uzman'ın istediği ek ziyaretler) sayılmaz. Aynı gün yapılmış iki tarama bir ziyaret sayılır. Ziyaret hakkından fazlası sayılmaz. Madde 8A/3'e göre yapılmış sayılan ziyaret de kullanılmış sayılır. Raporu yayımlanamayan (örneğin veri kaybı nedeniyle) ziyaret kullanılmış sayılmaz; bu durumda fark Şirket tarafından ayrıca iade edilir.",
              "**Dönemi biten satır:** Hizmet dönemi çıkış gününden önce bitmiş bir satır bu iadeye girmez; o dönemde yapılamayan ziyaretlerin bedeli Madde 8A'ya göre, Sahip'in talebi beklenmeden iade edilir. \"Dönem sonunda\" seçeneğinde de aynı kural uygulanır.",
              "**Ödenmiş yenileme:** Bahçe'nin henüz başlamamış, ödenmiş bir yenileme satırı varsa o satırın tutarının tamamı iade edilir.",
              "**Mükerrer kayıt:** Aynı bahçe Şirket'in hatasıyla iki kez kaydedilmişse fazla kaydın satır tutarının tamamı iade edilir; yalnızca yapılmış ziyaretler düşülür.",
              {
                text: "**Örnekler** (bilgi amaçlıdır):",
                children: [
                  "Satır tutarı 17.280,00 TL (KDV dahil, envanter ücreti yok; örneğin 20 dönümlük bir bahçenin Standart paketle yenileme yılı), ziyaret hakkı 4, yapılmış ziyaret 1. Ziyaret bedeli 4.320,00 TL; iade 17.280,00 − 1 × 4.320,00 = **12.960,00 TL** (KDV payı 2.160,00 TL).",
                  "Aynı satırda 1 ziyaret yapılmış, 1 ziyaret yapılamamış ve Madde 8A'ya göre 4.320,00 TL daha önce iade edilmiş. Hesap 17.280,00 − 1 × 4.320,00 = 12.960,00 TL; önceki iade 4.320,00 TL düşülür ve iade **8.640,00 TL** olur (KDV payı 1.440,00 TL). Toplam iade 12.960,00 TL'dir, yani yapılmamış üç ziyaretin bedeli.",
                ],
              },
              "**İade yöntemi:** İade hesabı çıkış gününde yapılır; iade, çıkış gününden itibaren en geç 14 gün içinde ödemenin yapıldığı yöntemle ödenir ([İptal ve İade Politikası](/iade)). İadenin bir bahçeye ayrılamayan kısmı varsa Şirket iadeyi elle inceler; süre değişmez.",
              "**Son bahçe:** Sahip'in son Bahçe'si hizmetten çıktığında sözleşme bütünüyle sona erer.",
            ],
          },
          {
            text: "**Sözleşme bir Bahçe için sona erdiğinde** (3. fıkraya göre çıkarma, son Bahçe'nin çıkmasıyla sona erme, süresinin dolması ve yenilenmemesi ya da Şirket'in feshi dahil):",
            children: [
              "Sahip ve davet ettiği hissedarlar, çıkış gününden itibaren 90 gün boyunca Bahçe'nin raporlarını portalda **salt okunur** olarak görür ve indirebilir. Bu sürede soru sorulamaz ve yeni hissedar eklenemez. Erişim süresi içinde yenileme teklifi onaylanıp ödenirse erişim yeniden tam açılır.",
              "Erişim süresi en az 14 gün ise, erişimin bitmesinden 7 gün önce Sahip'e SMS ile hatırlatma gönderilir.",
              "Süre sonunda şu erişimler kaldırılır: Sahip'in kendi erişimi, Sahip'in davet ettiği hissedarların erişimi ve Bahçe'de başka bir sahip kalmıyorsa bütün hissedarların erişimi.",
              "Bahçe'de hizmet alan başka bir sahip varsa onun erişimi kendi sözleşmesi süresince sürer; çıkan Sahip'in soruları, cevapları ve kendisine ait bilgileri ona açılmaz. Şirket, kendi sözleşmesi sürmeyen kişilerin erişimini ya da yazılı bir gerekçeyle (devir, uyuşmazlık, mükerrer kayıt) bütün erişimleri kaldırabilir.",
              "Bahçe'nin devrinde (satış) erişim süresi uygulanmaz ve erişim çıkış gününde kaldırılır. Daha kısa bir erişim süresi yalnızca devirde, mükerrer kayıtta ya da yazılı bir gerekçeyle uygulanır. Devirde Şirket, çıkış gününden önce Sahip'e raporlarını indirebileceğini SMS ile bildirir; sonrasında raporların bir kopyası Sahip'in talebi üzerine verilir. Bahçe'yi devralan kişi, önceki Sahip'in raporlarına ve verilerine erişemez; önceki Sahip'in yazılı izni saklıdır.",
              "Erişim süresinin bitmesi verilerin silinmesi değildir; veriler Aydınlatma Metni §7'deki süreler boyunca saklanır ve sürenin sonunda silinir ya da anonim hale getirilir.",
            ],
          },
        ],
      },
      { kind: "h2", text: "Madde 13 – Mücbir sebep" },
      {
        kind: "p",
        text: "Doğal afet, salgın, olağanüstü hava koşulları, resmi yasaklar ve erişimin engellenmesi gibi tarafların kontrolü dışındaki hallerde yükümlülükler, engel süresince askıya alınır. Mücbir sebep nedeniyle ziyaret penceresi içinde yapılamayan ziyaret için Madde 8A/2 uygulanır.",
      },
      { kind: "h2", text: "Madde 14 – Tebligat ve iletişim" },
      {
        kind: "p",
        text: "Taraflar, Madde 1'deki adreslerini tebligat adresi olarak kabul eder. Hizmete ilişkin bildirimler SMS, e-posta ya da portal üzerinden yapılır; iletişim tercihi WhatsApp olan Sahip'e de bildirimler şimdilik SMS olarak gönderilir. Hizmete ilişkin bildirimler tanıtım içermez.",
      },
      { kind: "h2", text: "Madde 15 – Uyuşmazlıklar" },
      {
        kind: "ol",
        items: [
          "Tüketici Sahip, uyuşmazlıklarda Ticaret Bakanlığı'nca her yıl ilan edilen parasal sınırlar içinde yerleşim yerindeki ya da tüketici işleminin yapıldığı yerdeki tüketici hakem heyetine başvurabilir. Bu sınırların üzerindeki uyuşmazlıklarda tüketici mahkemesinde dava açılmadan önce arabulucuya başvurulması zorunludur; dava, Sahip'in yerleşim yerindeki ya da Şirket'in yerleşim yerindeki tüketici mahkemesinde açılabilir.",
          "Tacir Sahip ile bu sözleşmeden doğan uyuşmazlıklarda Gaziantep mahkemeleri ve icra daireleri yetkilidir; dava şartı arabuluculuğa ilişkin hükümler saklıdır.",
        ],
      },
      { kind: "h2", text: "Madde 16 – Yürürlük" },
      {
        kind: "p",
        text: "Bu sözleşme 16 maddeden ve eklerden oluşur. Kâğıt üzerinde [Tarih]'te iki nüsha olarak imzalanmıştır; portalda kurulduğunda teklifin onaylandığı anda kurulur ve yürürlüğe girer. Onaylanan sözleşme ve Ön Bilgilendirme Formu, Sahip'e özgü bilgiler ve teklif satırlarıyla birlikte PDF olarak Sahip'in portalında \"Sözleşmelerim\" bölümünde değiştirilmeden saklanır ve indirilebilir; bağlantısı onaydan sonra Sahip'e SMS ile gönderilir. Şirket bu kayıtları onay tarihinden itibaren 10 yıl saklar ve portal erişimi sona ermiş olsa bile Sahip'in talebi üzerine bir kopyasını verir.",
      },
      { kind: "table", head: ["Şirket", "Sahip"], rows: [["[Ad, imza]", "[Ad, imza]"]] },
      { kind: "p", text: "**Ekler**" },
      {
        kind: "ul",
        items: [
          "**Ek-1:** Bahçe listesi. Her bahçe için: il, ilçe, köy; tapu referansı (varsa); kaba konum; sınırı gösterecek kişi; erişim notu; hizmet başlangıcı ve siparişi. Ek siparişle eklenen bahçeler eklendikleri tarih ve sipariş numarasıyla, hizmetten çıkarılan bahçeler çıkış tarihiyle gösterilir. Portalda güncel liste ve geçmişi Hesabım › Bahçelerim'dedir; her siparişin sözleşme kopyasında o tarihteki bahçe satırları yer alır.",
          "**Ek-2:** Ziyaret pencereleri. Kış: Aralık–Şubat · İlkbahar: Nisan–Mayıs · Yaz: Haziran–Temmuz · Hasat: Ağustos–Ekim.",
          "**Ek-3:** Kişisel verilerin işlenmesine ilişkin aydınlatma metni.",
          "**Ek-4:** Açık rıza ve ticari elektronik ileti onayı metni (isteğe bağlı; İYS kaydından sonra sorulur).",
          "**Ek-5:** Ön bilgilendirme formu (yalnızca portalda kurulan sözleşmede).",
          "**Ek-6:** İptal ve iade politikası.",
          "**Ek-7:** Örnek cayma formu. (Mesafeli Sözleşmeler Yönetmeliği ekindeki formun uyarlamasıdır; kullanılması zorunlu değildir.) Kime: OBA Bilişim Teknolojileri LTD., [Adres], [E-posta], [KEP]. Bu formla aşağıdaki hizmetin sunulmasına ilişkin sözleşmeden cayma hakkımı kullandığımı beyan ederim. Sipariş numarası ve ödeme tarihi: … Cayma hakkına konu hizmet (bütün bahçeler ya da bahçenin adı): … Hizmetin bedeli: … Adı soyadı: … Adresi: … İmzası (yalnızca kâğıt üzerinde gönderilirse): … Tarih: …",
        ],
      },
    ],
  },
  pre_information: {
    title: "Ön Bilgilendirme Formu",
    description: "Mesafeli hizmet sözleşmesinden önce okunacak ön bilgilendirme formu.",
    source: "docs/hukuk/on-bilgilendirme-formu-taslagi.md",
    blocks: [
      {
        kind: "p",
        text: "Bu form her teklifin (ilk, ek ve yenileme) onayından önce o teklifin bilgileriyle gösterilir ve ayrıca onaylanır.",
      },
      { kind: "h2", text: "1. Hizmet veren" },
      {
        kind: "ul",
        items: [
          "**Unvan:** OBA Bilişim Teknolojileri LTD. [tam unvan: ticaret sicilindeki gibi]",
          "**Adres:** [Adres]",
          "**Telefon:** [Telefon] · **E-posta:** [E-posta] · **KEP:** [KEP adresi]",
          "**MERSİS no:** [MERSİS] · **Vergi dairesi / no:** [ ]",
        ],
      },
      { kind: "h2", text: "2. Hizmetin temel nitelikleri" },
      {
        kind: "ul",
        items: [
          "Antep fıstığı bahçelerinin bağımsız denetimi: her bahçe için bir kez envanter (kullanım sınırı, ağaç haritası ve kodlama) ve paketteki sayıda periyodik ziyaret.",
          "Her ziyarette bahçe 360° kamera ve uydu konumlamayla taranır; ziraat mühendisi değerlendirir ve raporu imzalar. Raporlar portalda ve PDF olarak sunulur.",
          "Yapay zekâ yalnızca ön değerlendirme yapar ve **hastalık teşhisi koymaz.**",
          "Haritadaki sınır Sahip'in gösterdiği fiili kullanım sınırıdır; **tapu ya da mülkiyet sınırı iddiası taşımaz.** Sınırı siz gösterirsiniz ve envanterden sonra portalda onaylarsınız; sınırın doğruluğu sizin beyanınıza dayanır ve resmi ölçüm değildir.",
          "**Kapsam dışı:** bahçe bakımı, ilaçlama, budama; hastalık teşhisi ve laboratuvar analizi; verim ya da gelir tahmini ve garantisi; mülkiyet ve sınır tespiti; bekçilik.",
        ],
      },
      { kind: "h2", text: "3. Fiyat" },
      {
        kind: "ul",
        items: [
          "Toplam bedel, vergiler dahil olarak teklifte ve sipariş özetinde gösterilir: yıllık ziyaret sayısı × doğrulanan alan × dönüm ve ziyaret başı birim fiyat, bahçe başına en az ücret, ilk yıl envanter ücreti, varsa indirim, KDV.",
          "Teklif, üzerinde yazan son geçerlilik tarihine kadar değişmez.",
          {
            text: "**Üyelik dönemi içinde eklenen bahçe (ek teklif):** Hizmeti üyeliğinizin bitiş gününde biter ve fiyatı kalan döneme göre orantılanır. Teklif günü yürürlükte olan yayımlı fiyat listesi ve üyeliğinizin paketi kullanılır.",
            children: [
              "Ziyaret hakkı = yıllık ziyaret sayısı × kalan gün ÷ dönemin toplam günü; yarım yukarı yuvarlanır, en az 1 ziyarettir. Kalan gün, ek teklifte yazan başlangıç gününden dönemin bitişine kadar sayılır. Ziyaret hakkı teklifte sabitlenir; ödeme daha sonra yapılsa da değişmez.",
              "Ziyaret tutarı ziyaret hakkıyla hesaplanır. Bahçe başına en az ücret aynı oranla orantılanır. Envanter ücreti, envanter tek seferlik bir iş olduğu için tam alınır. Daha önce hizmetten çıkarılıp, son yayımlanmış envanterinin tarihinden itibaren 24 ay içinde yeniden eklenen ve sınırı ile ağaç düzeni esaslı biçimde değişmemiş bahçeden envanter ücreti alınmaz; bu süre geçmişse ya da yeni envanter gerekiyorsa envanter ücreti ek teklifte gerekçesiyle ayrı satır olarak gösterilir.",
              'Ek teklif hizmet dönemini (başlangıç ve üyeliğinizle ortak bitiş günü), ziyaret hakkını (ör. "2/4 ziyaret"), bahçe bazında envanteri ve son geçerlilik gününü gösterir. Son geçerlilik günü, dönemin bitişine en az 30 gün kalan son günü geçmez; ek teklif en geç o gün onaylanır ve ödenir.',
              "Ek teklif hesabı rakamla gösterir (kalan gün, ziyaret hakkı ve yuvarlama, ziyaret tutarı, orantılı en az ücret, envanter, KDV, toplam) ve dönemde kalan ziyaret pencerelerini yazar. Yuvarlamada 2,5 ve üstü yukarı, altı aşağı yuvarlanır. Bağlayıcı olan teklifteki toplamdır.",
              "Örnek (lansman fiyat listesi, Standart paket): 1 Kasım 2026–31 Ekim 2027 döneminde, yılda 4 ziyaretli pakette 1 Nisan 2027'de başlayan 15 dönümlük bahçe için 2 ziyaret ve envanter ücretiyle birlikte KDV dahil 13.920,00 TL; envanterle tam yıl 20.640,00 TL olurdu.",
            ],
          },
          "Teklifte yazan toplam bedel dışında Şirket'e ödeyeceğiniz başka bir ücret yoktur. Kartla ödemede ek ücret alınmaz. Havale ya da EFT ile ödemede kendi bankanızın alabileceği gönderim ücreti size aittir.",
        ],
      },
      { kind: "h2", text: "4. Ödeme ve ifa" },
      {
        kind: "ul",
        items: [
          "Teklifi onaylamak ödeme yükümlülüğü doğurur. Ödeme süresi içinde ödenmeyen siparişi Şirket iptal edebilir ya da süreyi uzatabilir; ödenmeyen sipariş için sizden bir bedel istenmez.",
          "Ödeme peşin ve tek çekimdir: kartla 3D Secure ile ([iyzico Ödeme Hizmetleri A.Ş.] üzerinden) ya da havale/EFT ile. Kart bilgileri Şirket'e ulaşmaz.",
          "Fatura ödemeden sonra elektronik olarak düzenlenir ve portalda sunulur.",
          "Hizmet yılı ödemenin tamamlandığı gün başlar. Ek siparişin hizmeti ödemenin tamamlandığı gün (teklifte daha ileri bir başlangıç günü yazıyorsa o gün) başlar ve üyelik döneminin bitiş gününde biter. Ödeme son ek gününden sonra ulaşır ya da dönem bu arada sona ererse ek sipariş başlamaz ve ödenen tutar iade edilir. Envanter ziyaretinin tarihi Sahip'le birlikte belirlenir; hizmete cayma süresi içinde başlanmasını istemediyseniz (5. bölüm) envanter cayma süresinden sonra yapılır. Periyodik ziyaretler sözleşmenin Ek-2'sindeki pencerelerde yapılır.",
          "Rapor her ziyaretten sonra en geç 15 iş günü içinde portalda yayımlanır.",
        ],
      },
      { kind: "h2", text: "5. Cayma hakkı" },
      {
        kind: "ul",
        items: [
          "Sahip, ödemenin tamamlandığı (siparişin onaylanıp etkinleştiği) günden itibaren **14 gün** içinde gerekçe göstermeden ve cezai şart ödemeden cayabilir; son gün dahildir. Kanuni cayma süresi sözleşmenin kurulduğu (teklifin onaylandığı) gün başlar; Şirket, Sahip lehine olarak süreyi ödemenin tamamlandığı günden başlatır. Hizmetin başlangıcı teklifte daha ileri bir gün olsa bile (örneğin yenilemede) süre ödeme gününden sayılır. Ek siparişte süre, ek siparişin ödemesinin tamamlandığı günden sayılır.",
          "Cayma bildirimi portaldan, [e-posta] ya da [KEP] adresine ya da [Adres]'e yazılı olarak yapılır. Aşağıdaki örnek cayma formu kullanılabilir; açık bir yazılı beyan da yeterlidir. Bildirimde bir bahçe belirtilmişse cayma yalnızca o bahçe için kullanılmış olur. Süre içinde gönderilen bildirim yeterlidir. Şirket bildirimin alındığını gecikmeksizin SMS ile ve portalda teyit eder.",
          'Cayma tek bir bahçe için de kullanılabilir: portalda bahçeyi hizmetten çıkarırken "Cayma hakkımı kullanıyorum" seçeneği **açıkça** seçilir. Bu seçenek yalnızca cayma süresi içinde gösterilir. "30 gün sonra" ya da "dönem sonunda" seçimi cayma bildirimi sayılmaz.',
          "Ödenen tutar, bildirimin ulaşmasından itibaren en geç **14 gün** içinde, ödemenin yapıldığı yöntemle iade edilir.",
          "**Hizmete cayma süresi içinde başlanması:** Teklifi onaylarken ayrı bir kutuyu işaretleyerek hizmete cayma süresi dolmadan başlanmasını isteyebilirsiniz. İstemezseniz envanter cayma süresinden sonra yapılır. Onayınızla hizmete başlandığında kanuni cayma hakkınız sona erer (Yönetmelik md. 15/1-(h)). Şirket'in tanıdığı cayma hakkı ise cayma süresinin sonuna kadar sürer; bu hakkı kullanırsanız yapılmış envanterin payı ve yapılmış ziyaretlerin bedeli iadeden düşülür.",
          "Cayma süresinden sonra bahçe bazında fesih ve iade: [İptal ve İade Politikası](/iade), 5. bölüm.",
        ],
      },
      { kind: "h2", text: "6. Şikâyet ve itiraz" },
      {
        kind: "ul",
        items: [
          "Şikâyetler [E-posta] ve [Telefon] üzerinden iletilir.",
          "Tüketici, Ticaret Bakanlığı'nca ilan edilen parasal sınırlar içinde yerleşim yerindeki ya da işlemin yapıldığı yerdeki tüketici hakem heyetine başvurabilir. Sınırların üzerindeki uyuşmazlıklarda tüketici mahkemesinde dava açmadan önce arabulucuya başvurmak zorunludur.",
        ],
      },
      { kind: "h2", text: "7. Kişisel veriler" },
      {
        kind: "p",
        text: "Kişisel veriler [KVKK Aydınlatma Metni](/kvkk)'ne göre işlenir. Ödeme bilgileri ödeme kuruluşuyla paylaşılır.",
      },
      { kind: "h2", text: "8. Örnek cayma formu" },
      {
        kind: "p",
        text: "(Mesafeli Sözleşmeler Yönetmeliği ekindeki formun uyarlamasıdır; kullanılması zorunlu değildir.)",
      },
      {
        kind: "ul",
        items: [
          "**Kime:** OBA Bilişim Teknolojileri LTD., [Adres], [E-posta], [KEP]",
          "Bu formla aşağıdaki hizmetin sunulmasına ilişkin sözleşmeden cayma hakkımı kullandığımı beyan ederim.",
          "**Sipariş numarası ve ödeme tarihi:** …",
          "**Cayma hakkına konu hizmet (bütün bahçeler ya da bahçenin adı):** …",
          "**Hizmetin bedeli:** …",
          "**Adı soyadı:** …",
          "**Adresi:** …",
          "**İmzası (yalnızca kâğıt üzerinde gönderilirse):** …",
          "**Tarih:** …",
        ],
      },
      {
        kind: "p",
        text: "Bu formun ve sözleşmenin size özgü kopyası onaydan sonra portalınızda (Hesabım › Sözleşmelerim) saklanır ve bağlantısı SMS ile gönderilir.",
      },
      {
        kind: "p",
        text: "Bu formu okudum ve sözleşme kurulmadan önce bilgilendirildiğimi teyit ederim.",
      },
    ],
  },
  refund_policy: {
    title: "İptal ve İade Politikası",
    description: "İptal, cayma, yapılamayan ziyaret, bahçe çıkarma ve iade kuralları.",
    source: "docs/hukuk/iptal-iade-politikasi-taslagi.md",
    blocks: [
      { kind: "h2", text: "1. Ödemeden önce" },
      {
        kind: "ul",
        items: [
          "Başvurunuzu ya da onaylamadığınız teklifi istediğiniz zaman geri çekebilirsiniz.",
          "Onayladığınız ama henüz ödemediğiniz siparişi portaldan iptal edebilirsiniz. Bir bedel doğmaz.",
          "Ödeme süresi içinde ödemezseniz siparişinizi iptal edebilir ya da ödeme sürenizi uzatabiliriz; iptal edilmedikçe geç gelen ödemeniz kabul edilir. Ödenmeyen sipariş için sizden bir bedel istenmez.",
          "Üyeliğinize eklenen bir bahçenin teklifi (ek teklif) en geç son ek gününde onaylanır ve ödenir; son ek günü teklifte yazar. Ödemeniz bu günden sonra ulaşır ya da üyelik döneminiz bu arada sona ererse ek sipariş başlamaz, iptal edilir ve ödediğiniz tutarın tamamı iade edilir. İptal size SMS ile bildirilir ve tutar en geç 14 gün içinde iade edilir.",
        ],
      },
      { kind: "h2", text: "2. Cayma hakkı (14 gün)" },
      {
        kind: "ul",
        items: [
          "Ödemenin tamamlandığı (siparişinizin onaylanıp etkinleştiği) günden itibaren 14 gün içinde gerekçe göstermeden cayabilirsiniz. Kanuni süre sözleşmenin kurulduğu (teklifi onayladığınız) gün başlar; biz süreyi sizin lehinize ödeme gününden başlatırız. Hizmetin başlangıcı daha ileri bir gün olsa bile (örneğin yenilemede) süre ödeme gününden sayılır. Son gün dahildir: ödemesi 1 Mart'ta tamamlanan siparişte 15 Mart.",
          "Üyeliğinize sonradan eklenen bahçenin siparişi (ek sipariş) ayrı bir sözleşmedir; onun için de 14 gün, o siparişin ödemesinin tamamlandığı günden sayılır.",
          "Bildirimi portaldan, [e-posta] ya da [KEP] adresine ya da [Adres]'e yazarak yaparsınız. [Ön Bilgilendirme Formu](/on-bilgilendirme)'ndaki örnek cayma formunu kullanabilirsiniz; açık bir yazılı beyan da yeterlidir. Bildiriminizin alındığını SMS ile ve portalda teyit ederiz. Tek bir bahçe için cayma, bahçeyi hizmetten çıkarırken \"Cayma hakkımı kullanıyorum\" seçeneğiyle ya da bildirimde bahçeyi belirterek yapılır (5. bölüm).",
          "Ödediğiniz tutar en geç 14 gün içinde iade edilir.",
          "Teklifi onaylarken ayrı bir kutuyu işaretleyerek hizmete cayma süresi dolmadan başlanmasını isteyebilirsiniz. İstemezseniz envanter cayma süresinden sonra yapılır ve caymada ödediğiniz tutarın tamamı iade edilir. Onayınızla hizmete başlandığında kanuni cayma hakkınız sona erer (Mesafeli Sözleşmeler Yönetmeliği md. 15/1-(h)); biz yine de cayma süresinin sonuna kadar cayma hakkı tanırız. Bu hakkı kullanırsanız envanter sayımı yapıldıysa envanterin payı ve yapılmış periyodik ziyaretlerin bedeli iadeden düşülür.",
        ],
      },
      { kind: "h2", text: "3. Yapılamayan ziyaret" },
      {
        kind: "ul",
        items: [
          "Her ziyaretin tarihi size en az 3 gün önce SMS ya da telefonla bildirilir. Ziyaretten en geç 24 saat önce bir kez erteleme isteyebilirsiniz; ziyaret aynı pencerede yeniden planlanır.",
          "Hava, sizden kaynaklanmayan erişim engeli, mücbir sebep ya da bizden kaynaklanan bir nedenle yapılamayan ziyaret aynı pencere içinde yeniden planlanır.",
          "Pencere içinde yapılamazsa o ziyaretin bedeli pencerenin bitiminden sonra en geç 14 gün içinde iade edilir ya da isterseniz aynı dönemdeki sonraki pencereye aktarılır. Ziyaret bedeli: bahçenin teklif satırındaki tutar (envanter payı hariç) ÷ satırdaki ziyaret hakkı. Tam yıllık siparişte bu, yıllık bedelin (envanter hariç) yıllık ziyaret sayısına bölünmesidir.",
          "Yapılamayan ziyaretleri biz tespit eder, sizin talebinizi beklemeden iade ederiz.",
          "Sizden kaynaklanan nedenle (kapı, anahtar ya da sınırı gösterecek kişi yok) yapılamayan ziyaret, size önceden bildirilmiş ve en az bir kez yeniden denenmiş olmasına rağmen yapılamadıysa iade edilmez.",
          "Bu yolla iade edilen ziyaret, bahçeyi daha sonra hizmetten çıkarırsanız orada kullanılmamış sayılır ve iadesi oradaki iadeden düşülür; bir ziyaret iki kez iade edilmez.",
        ],
      },
      { kind: "h2", text: "4. Fesih" },
      {
        kind: "ul",
        items: [
          'Sözleşmeyi bütün bahçeleriniz için ya da yalnızca bir bahçe için dilediğiniz zaman feshedebilirsiniz; çıkış gününü siz seçersiniz. Tek bir bahçeyi bırakmak "bahçe çıkarma"dır; nasıl yapıldığı 5. bölümdedir.',
          "Kullanılmayan ziyaretlerin bedeli iade edilir; yapılmış envanterin ücreti iade edilmez.",
          "Son bahçeniz hizmetten çıkınca üyeliğiniz sona erer.",
        ],
      },
      { kind: "h2", text: "5. Bahçe çıkarma" },
      { kind: "p", text: "**Nasıl istenir?**" },
      {
        kind: "ul",
        items: [
          'Portalda bahçenin sayfasında ya da Hesabım › Bahçelerim\'de "Bahçeyi hizmetten çıkar"a basın. Nedeni ve zamanı seçin (önceden seçili bir seçenek yoktur), isterseniz not yazın, onay kutusunu işaretleyin.',
          'Her seçenek kendi çıkış tarihiyle, tahmini iadesiyle ve raporlara erişimin bittiği tarihle gösterilir. Tahmini iade bir üst sınırdır ("en fazla"); çıkışa kadar yapılan ziyaretler düşülür.',
          "Talebiniz bir numara alır (C-…) ve çıkış gününde kendiliğinden işler. Çıkış gününe kadar portaldan geri alabilirsiniz.",
          "Bahçe ödemesi beklenen bir siparişte de yer alıyorsa (örneğin onayladığınız ama ödemediğiniz yenileme), önce o siparişi iptal etmeniz ya da düzeltmeniz gerekir. Portal aynı işlemde bekleyen siparişi iptal etme seçeneği sunar.",
        ],
      },
      { kind: "p", text: "**Zaman seçenekleri**" },
      {
        kind: "table",
        head: ["Seçenek", "Çıkış günü", "İade"],
        rows: [
          ["Hemen", "Talebin ertesi günü", "Kullanılmayan ziyaretler (aşağıda)"],
          [
            "30 gün sonra",
            "Talepten 30 gün sonra; hizmet döneminiz daha önce bitiyorsa dönem sonunun ertesi günü",
            'Kullanılmayan ziyaretler (aşağıda). Çıkış günü dönem sonunun ertesi gününe denk gelirse "Dönem sonunda" satırındaki gibi',
          ],
          [
            "Dönem sonunda",
            "Hizmet döneminin bitişinin ertesi günü",
            "Bu dönem için çıkarma iadesi yoktur, çünkü bahçe dönemin sonuna kadar hizmette kalır. Dönem içinde yapılamayan ziyaretler 3. bölüme göre, talebiniz beklenmeden iade edilir. Ödenmiş bir yenileme varsa yenilemenin tamamı iade edilir",
          ],
          [
            "Cayma hakkımı kullanıyorum",
            "Bugün. Yalnızca cayma süresi içinde gösterilir ve açıkça seçilir",
            "Bahçe için ödediğiniz tutar; envanter sayımı yapıldıysa envanterin payı ve yapılmış ziyaretlerin bedeli düşülür (2. bölüm)",
          ],
        ],
      },
      {
        kind: "p",
        text: "Ekibimiz çıkış tarihini teyit eder. Tarih yalnızca sizinle anlaşarak değiştirilir; değişiklik size SMS ile bildirilir. Cayma süresi içinde başka bir seçenek seçerseniz portal, bunun cayma bildirimi olmadığını ve cayma hakkınızın sürdüğünü gösterir.",
      },
      {
        kind: "p",
        text: "**Bahçeyi bizim çıkarmamız** yalnızca şu sebeplerle olur: bahçenin hizmet bölgesi dışında kalması, yükümlülüklerinizin esaslı ya da tekrarlanan ihlali (örneğin iki pencere boyunca erişim sağlanamaması), yetkisizlik ya da üçüncü kişi itirazı, personel güvenliğini tehdit eden durum, devir, mükerrer kayıt ya da hizmeti bölgede bütünüyle sona erdirmemiz. En az 30 gün önce SMS ile bildiririz; güvenlik tehdidi, mükerrer kayıt, yetkisizlik ve itiraz hallerinde bu süre aranmaz. Kullanılmayan bütün ziyaretlerin bedelini iade ederiz.",
      },
      { kind: "p", text: "**İade hesabı**" },
      {
        kind: "ul",
        items: [
          "Bahçenin teklifteki satır tutarı esas alınır (KDV dahil).",
          "Ziyaret bedeli = (satır tutarı − envanter payı) ÷ satırdaki ziyaret hakkı; kuruşa aşağı yuvarlanır.",
          "İade = satır tutarı − (envanter yapıldıysa) envanter payı − kullanılmış ziyaret × ziyaret bedeli. Yuvarlamadan kalan kuruş farkı size kalır. Envanter yapılmadıysa envanter payı da iade edilir.",
          "**Kullanılmış sayılan ziyaret:** çıkış gününden önce yapılmış periyodik ziyaretler. Bizim gerektirdiğimiz yeniden taramalar (görüntü kalitesi ya da kapsama için yapılan ek ziyaretler) sayılmaz. Aynı gün yapılmış iki tarama bir ziyaret sayılır. Önceden bildirilip yeniden denendiği halde sizden kaynaklanan nedenle yapılamayan ziyaret (3. bölüm) kullanılmış sayılır. Raporu yayımlanamayan ziyaret (örneğin veri kaybı) kullanılmış sayılmaz; fark ayrıca iade edilir.",
          "**Önceki iadeler düşülür:** Bu bahçe için daha önce yapılmış ziyaret ve hizmet bedeli iadeleri, yapılamayan ziyaret iadeleri (3. bölüm) dahil, hesaptan düşülür; bu ziyaretler kullanılmamış sayılır. Fazla ödemenin iadesi gibi bizden kaynaklanan iadeler düşülmez.",
          "Hizmet dönemi çıkış gününden önce bitmiş bir siparişin, çıkış dönem sonuna denk geldiğinde içinde bulunduğunuz dönemin siparişi dahil, kullanılmayan ve yapılamayan ziyaretleri bu iadeye girmez; yapılamayan ziyaretleri biz tespit eder, 3. bölüme göre talebinizi beklemeden iade ederiz.",
          "Ödenmiş ama henüz başlamamış yenilemenin bu bahçeye düşen tutarı tamamen iade edilir.",
          "Her iadede KDV payı ayrıca gösterilir.",
        ],
      },
      { kind: "p", text: "**Örnekler** (KDV dahil, envanter ücreti yok):" },
      {
        kind: "ul",
        items: [
          "17.280,00 TL'lik bahçe, 4 ziyaret hakkı, 1 ziyaret yapılmış: ziyaret bedeli 4.320,00 TL, iade 17.280,00 − 4.320,00 = **12.960,00 TL** (KDV payı 2.160,00 TL).",
          "Aynı bahçede 1 ziyaret yapılmış, 1 ziyaret yapılamamış ve 4.320,00 TL daha önce iade edilmiş: hesap 12.960,00 TL, önceki iade düşülür, iade **8.640,00 TL**. Toplamda yapılmamış üç ziyaretin bedeli, 12.960,00 TL iade edilmiş olur.",
        ],
      },
      {
        kind: "p",
        text: "**İade nasıl ödenir?** İade hesabı çıkış gününde yapılır. İade, 6. bölümdeki gibi ödemenin yapıldığı yöntemle, çıkış gününden itibaren en geç 14 gün içinde ödenir. Tutarın bir kısmı birden fazla bahçeye ayrılamıyorsa (örneğin bahçe ayrımı olmadan yapılmış bir önceki iade) iadeyi ekibimiz elle inceler; bu durumda da süre aynıdır.",
      },
      { kind: "p", text: "**Hizmet bittikten sonra**" },
      {
        kind: "ul",
        items: [
          "Bu kurallar hizmetin bir bahçe için bittiği bütün hallerde geçerlidir: bahçe çıkarma, son bahçenin çıkması, üyeliğin süresi dolup yenilenmemesi ya da bizim feshimiz.",
          "Bahçenin planlı ziyaretleri iptal edilir. Çıkıştan önce yapılmış ziyaretlerin raporları yayımlanır.",
          "90 gün boyunca siz ve davet ettiğiniz hissedarlar raporları **salt okunur** görür ve indirebilirsiniz. Bu sürede soru sorulamaz, hissedar eklenemez. Bu süre içinde yenileme teklifini onaylayıp öderseniz erişiminiz yeniden tam açılır.",
          "Süre sonunda sizin ve davet ettiğiniz hissedarların erişimi kalkar. Bahçede başka bir sahip yoksa bütün hissedarların erişimi kalkar. Bahçede hizmeti süren başka bir sahip varsa onun erişimi sürer; sizin sorularınız, cevaplarınız ve size ait bilgiler ona açılmaz.",
          "Bahçe satıldıysa (devir) erişim çıkış gününde kalkar. Çıkıştan önce raporlarınızı indirebileceğinizi SMS ile bildiririz; sonrasında talep ederseniz raporlarınızın bir kopyasını veririz. Bahçeyi devralan kişi sizin raporlarınızı ve verilerinizi göremez.",
          "Erişimin kapanması verilerinizin silinmesi demek değildir. Veriler [KVKK Aydınlatma Metni](/kvkk)'nin 7. bölümündeki süreler boyunca saklanır, sonra silinir ya da anonim hale getirilir.",
          "Bahçeyi yeniden eklemek isterseniz yeni bir ek teklif alırsınız. Son yayımlanmış envanterin tarihinden itibaren 24 ay içinde yeniden eklenen ve sınırı ile ağaç düzeni esaslı biçimde değişmemiş bahçeden envanter ücreti alınmaz; bu süre geçmişse ya da yeni envanter gerekiyorsa envanter ücreti teklifte gerekçesiyle ayrı satır olarak gösterilir.",
        ],
      },
      { kind: "p", text: "**Size gelecek SMS'ler**" },
      {
        kind: "ul",
        items: [
          "Çıkış tarihi teyit edildiğinde ya da bahçe çıkarmayı biz başlattığımızda.",
          "Çıkış tarihi değiştiğinde.",
          "Çıkarma biz tarafından iptal edildiğinde.",
          "Bahçe hizmetten çıkarıldığında.",
          "Raporlara erişim bitmeden 7 gün önce (erişim süresi en az 14 gün ise).",
          "İade yapıldığında (6. bölüm).",
        ],
      },
      {
        kind: "p",
        text: "Bahçe çıkarma SMS'lerinde tarih, tutar ve neden yazmaz; ayrıntılar portaldadır.",
      },
      { kind: "h2", text: "6. İade nasıl yapılır?" },
      {
        kind: "table",
        head: ["Ödeme yöntemi", "İade yöntemi", "Süre"],
        rows: [
          [
            "Kart, aynı gün ve tam tutar",
            "Ödeme iptal edilir; karttan çekim hiç yansımaz ya da geri alınır",
            "Bankanıza göre birkaç gün",
          ],
          [
            "Kart, diğer durumlar",
            "Aynı karta iade",
            "Şirket iadeyi en geç 14 gün içinde başlatır; hesabınıza yansıması bankanıza göre değişir",
          ],
          ["Havale / EFT", "Ödemenin geldiği hesaba havale", "En geç 14 gün"],
        ],
      },
      {
        kind: "ul",
        items: [
          "Bütün iadeler tutarın tamamıyla ve size masraf yüklenmeden yapılır; havale ile iadede gönderim ücretini Şirket öder ve iade tutarının tamamı hesabınıza ulaşır.",
          "İade yapılınca size SMS ile bildirim gelir; portalda ödeme geçmişinizde görünür.",
          "İadeler kalem kalem yapılır; kısmi iade mümkündür.",
        ],
      },
      { kind: "h2", text: "7. İletişim" },
      { kind: "p", text: "[E-posta] · [Telefon]" },
    ],
  },
  field_notice: {
    title: "Bahçede Bulunan Kişiler İçin Aydınlatma Metni",
    description:
      "Denetim taraması yapılan bahçelerde görüntüsü alınabilecek işçi, bekçi, komşu ve yoldan geçenler için.",
    source: "docs/hukuk/bahcede-bulunanlar-aydinlatma-metni.md",
    blocks: [
      {
        kind: "p",
        text: 'OBA Bilişim Teknolojileri LTD. [tam unvan: ticaret sicilindeki gibi] ("Şirket") olarak, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("Kanun") kapsamında veri sorumlusu sıfatıyla, denetim taraması yaptığımız bahçelerde görüntüsü alınabilecek kişileri bu metinle bilgilendiriyoruz.',
      },
      { kind: "h2", text: "1. Bu metin kimin için?" },
      {
        kind: "p",
        text: "Bu metin, Şirket'in denetim taraması yaptığı bahçelerde çalışan ya da bulunan kişiler içindir: bahçe işçileri ve yevmiyeciler, bekçiler, komşular ve yoldan geçenler. Bahçe sahibinin kendi verileri [KVKK Aydınlatma Metni](/kvkk)'nde anlatılır.",
      },
      { kind: "h2", text: "2. Veri sorumlusu" },
      {
        kind: "ul",
        items: [
          "**Unvan:** OBA Bilişim Teknolojileri LTD. [tam unvan: ticaret sicilindeki gibi]",
          "**Adres:** [Adres]",
          "**E-posta:** [kvkk@alanadi]",
          "**KEP:** [KEP adresi]",
          "**Telefon:** [Telefon]",
        ],
      },
      { kind: "h2", text: "3. Hangi verileri işliyoruz?" },
      {
        kind: "ul",
        items: [
          "Tarama sırasında çekilen 360° panoramalarda ve fotoğraflarda görüntünüz. Görüntünüz tanınabilir olabilir.",
          "Görüntünün çekildiği yer ve zaman.",
        ],
      },
      { kind: "h2", text: "4. Amaç ve hukuki sebep" },
      {
        kind: "ul",
        items: [
          "Görüntüler yalnızca bahçe denetimi, yani ağaçların durumunun değerlendirilmesi ve raporlanması amacıyla çekilir ve işlenir.",
          "Hukuki sebep, Kanun md. 5/2-f'deki meşru menfaatimizdir. Bu nedenle sizden açık rıza istenmez.",
          "Kişiler hedeflenerek çekilmez. Kimliğiniz tespit edilmez, yüz tanıma yapılmaz ve hakkınızda bir değerlendirme yapılmaz.",
        ],
      },
      { kind: "h2", text: "5. Kimler görür, kimlere aktarılır?" },
      {
        kind: "ul",
        items: [
          "Bahçe sahibi, sahibin davet ettiği hissedarlar, uzman (ziraat mühendisi) ve saha personelimiz.",
          "Altyapı ve görüntü işleme sağlayıcılarımız (sunucular Avrupa Birliği'nde) ile yapay zekâ ön değerlendirme sağlayıcımız (Amerika Birleşik Devletleri).",
          "Yurt dışına aktarım, Kanun md. 9 uyarınca standart sözleşme imzalanarak ve Kişisel Verileri Koruma Kurumu'na bildirilerek yapılır. Sağlayıcıların adları [KVKK Aydınlatma Metni](/kvkk)'nin 5. bölümündedir.",
        ],
      },
      { kind: "h2", text: "6. Ne kadar saklıyoruz?" },
      {
        kind: "ul",
        items: [
          "**Ham video:** en fazla 30 gün.",
          "**Panoramalar:** hizmet bittikten sonra 2 yıl.",
          "**Raporda yer alan görüntüler:** raporla birlikte 10 yıl.",
        ],
      },
      {
        kind: "p",
        text: "Süre dolunca görüntüler silinir, yok edilir ya da anonim hale getirilir.",
      },
      { kind: "h2", text: "7. Nasıl topluyoruz?" },
      {
        kind: "p",
        text: "Görüntüler, saha personelimizin kullandığı tarama ekipmanıyla (360° kamera, uydu konumlama) otomatik yolla toplanır. Tarama günü bahçe girişine bilgilendirme levhası konur; personelimiz tanıtım kartı taşır ve bahçede rastladığı kişilere kısa sözlü bilgi verir. Kadraja yakınsanız personelimiz geçmenizi bekler; itiraz ederseniz o bölüm daha sonra taranır.",
      },
      { kind: "h2", text: "8. Haklarınız ve başvuru" },
      {
        kind: "ul",
        items: [
          "Kanun md. 11'deki haklarınızı kullanabilirsiniz: verinizin işlenip işlenmediğini öğrenme, bilgi isteme, aktarıldığı kişileri bilme, düzeltme, silme ya da yok etme isteme, itiraz etme ve zararın giderilmesini talep etme.",
          "Görüntünüzün gizlenmesini isteyebilirsiniz. Bu durumda göründüğünüz kare ya da panorama gizlenir.",
          "Başvuru yolları [KVKK Aydınlatma Metni](/kvkk)'nin 8. bölümündekiyle aynıdır: yazılı olarak [Adres]'e, kayıtlı elektronik posta ile [KEP adresi]'ne, güvenli elektronik ya da mobil imzayla ya da [kvkk@alanadi] adresine.",
          "Başvurunuz en geç 30 gün içinde ücretsiz sonuçlandırılır.",
        ],
      },
    ],
  },
};
