import type { LegalText } from "@/lib/legal/versions";

// Legal texts shown on the public site, copied from the drafts in
// docs/hukuk/ (the source of truth; `source` names the file). Drafting notes
// for the lawyer stay in docs/. When a text changes, update both and bump its
// version in src/lib/legal/versions.ts.
//
// Inline markup in `text`: **bold** and [label](/path) for links between the
// texts; [placeholders] in brackets are shown as they are.

export type LegalListItem = string | { text: string; children: string[] };

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
          ["İletişim", "Cep telefonu, e-posta (isteğe bağlı), iletişim tercihi (SMS / WhatsApp)"],
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
            "Fatura profili (ad soyad ya da unvan, adres; şirkette vergi dairesi ve VKN); ödeme ve iade kayıtları (tutar, tarih, yöntem, makbuz numarası, ödeme kuruluşunun işlem numarası, kartın yalnızca son dört hanesi ve kart tipi); havale bilgisi. Kart numarasının tamamı Şirket'e ulaşmaz. TCKN yalnızca ödeme kuruluşu isterse alınır",
          ],
          [
            "Kayıt güvenliği",
            "Kayıt denemelerinde IP adresinin ve telefonun tek yönlü özeti; robot doğrulaması sonucu",
          ],
        ],
      },
      {
        kind: "p",
        text: "Bahçenize ait ölçümler, ağaç değerlendirmeleri ve bulgular kişisel veri değildir. Ancak size ait bir bahçeyle ilişkilendirildikleri için aynı özenle korunur.",
      },
      { kind: "h2", text: "3. Hangi amaçlarla işliyoruz?" },
      {
        kind: "ol",
        items: [
          "Bahçe denetim hizmetinin verilmesi: kayıt, envanter, periyodik ziyaretler, uzman değerlendirmesi, rapor.",
          "Size ait portal hesabının açılması, girişin doğrulanması, raporların gösterilmesi.",
          '"Rapor hazır" ve "kritik bulgu" gibi hizmete ilişkin bildirimlerin gönderilmesi.',
          "Sözleşmenin kurulması, ifası ve faturalandırma.",
          "Bilgi güvenliğinin sağlanması ve kötüye kullanımın önlenmesi.",
          "Hizmet kalitesinin ölçülmesi ve iyileştirilmesi.",
          "Hukuki yükümlülüklerin yerine getirilmesi ve olası uyuşmazlıklarda hakların korunması.",
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
        ],
      },
      {
        kind: "p",
        text: "Açık rızanıza dayanan işlemler ayrı bir metinle, isteğe bağlı olarak sorulur ([Açık Rıza Metni](/acik-riza)). Rıza vermemeniz hizmeti almanıza engel değildir.",
      },
      { kind: "h2", text: "5. Kimlere aktarıyoruz?" },
      { kind: "p", text: "**Yurt içi:**" },
      {
        kind: "ul",
        items: [
          "Hizmeti birlikte yürüttüğümüz uzman (ziraat mühendisi) ve saha personeli. Yalnızca görev için gerekli bilgiler.",
          "SMS hizmet sağlayıcısı: [Netgsm], yalnızca telefon numarası ve mesaj metni.",
          "Ödeme kuruluşu: [iyzico Ödeme Hizmetleri A.Ş.], kartla ödemede. Aktarılan: ad, soyad, telefon, e-posta, fatura adresi, IP adresi, sipariş tutarı ve kalemleri. T.C. kimlik numarası yalnızca ödeme kuruluşu zorunlu tutarsa aktarılır. Kart bilgilerini doğrudan ödeme kuruluşuna girersiniz.",
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
            "Avrupa Birliği (Almanya)",
            "Bu metindeki veriler",
          ],
          [
            "[Vercel Inc.]",
            "Web portalının barındırılması",
            "Avrupa Birliği",
            "Portal kullanımı sırasında geçen veriler",
          ],
          [
            "[Bulut işlem sağlayıcısı]",
            "Görüntülerin işlenmesi",
            "Avrupa Birliği",
            "Görsel kayıtlar (geçici, en fazla 30 gün)",
          ],
          [
            "[Anthropic PBC]",
            "Yapay zekâ ön değerlendirmesi",
            "Amerika Birleşik Devletleri",
            "Yalnızca ağaç görüntüleri ve ağaç kodu. **Adınız, telefonunuz, parsel adı ve köy gönderilmez**",
          ],
        ],
      },
      {
        kind: "p",
        text: "Yurt dışına aktarım, Kanun'un 9. maddesine uygun şekilde yapılır: [standart sözleşme ve Kurul'a bildirim / yeterlilik kararı / diğer güvenceler; avukat belirleyecek].",
      },
      { kind: "h2", text: "6. Nasıl topluyoruz?" },
      {
        kind: "ul",
        items: [
          "Sizinle yapılan görüşmede ve sözleşmede, sözlü ya da yazılı olarak.",
          "Portalda.",
          "Bahçenizde, saha personelimizin kullandığı tarama ekipmanı (360° kamera, uydu konumlama) ve saha uygulamasıyla. Bu kayıtlar otomatik yolla toplanır.",
        ],
      },
      { kind: "h2", text: "7. Ne kadar saklıyoruz?" },
      {
        kind: "table",
        head: ["Veri", "Süre"],
        rows: [
          [
            "Ham video ve konum kayıtları",
            "İşlenip kalite kontrolünden geçtikten sonra en fazla 30 gün",
          ],
          [
            "Panoramalar, ağaç görüntüleri, raporlar",
            "Sözleşme süresince ve sona ermesinden sonra [X] yıl",
          ],
          [
            "Kimlik, iletişim, sözleşme ve fatura bilgileri",
            "Sözleşme süresince ve ilgili mevzuattaki süreler boyunca (ör. vergi mevzuatı için [10] yıl)",
          ],
          [
            "Ödeme ve iade kayıtları, makbuzlar, mesafeli sözleşme ve ön bilgilendirme onayları",
            "İşlem tarihinden itibaren [10] yıl (vergi ve ticaret mevzuatı; mesafeli sözleşmelerde Yönetmelik'teki saklama yükümlülüğü)",
          ],
          ["Tamamlanmamış kayıtlar (telefonu doğrulanmamış hesap)", "24 saat; sonra silinir"],
          ["Kayıt denemesi özetleri (IP ve telefon özeti)", "[30] gün"],
          ["Giriş doğrulama kodlarının kaydı", "7 gün"],
          ["Bildirim kayıtları", "[X] ay"],
        ],
      },
      { kind: "p", text: "Süre dolunca veriler silinir, yok edilir ya da anonim hale getirilir." },
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
        text: "**Başvuru:** Yukarıdaki haklar için başvurunuzu, kimliğinizi doğrulayan bilgilerle yapabilirsiniz:",
      },
      {
        kind: "ul",
        items: [
          "yazılı olarak [adres]'e,",
          "kayıtlı elektronik posta ile [KEP]'e,",
          "ya da sistemimizde kayıtlı e-posta adresinizden [kvkk@alanadi]'ye.",
        ],
      },
      { kind: "p", text: "Başvurunuz en geç 30 gün içinde ücretsiz sonuçlandırılır." },
      { kind: "h2", text: "9. Bahçenizde bulunan diğer kişiler" },
      {
        kind: "p",
        text: "Tarama sırasında bahçenizde çalışan ya da bulunan kişiler görüntülere girebilir. Bu kişilerin, bahçenizde denetim taraması yapıldığından haberdar olmaları için [bilgilendirme yöntemi: sizin aracılığınızla bilgilendirme / bahçe girişine bilgilendirme levhası; avukat belirleyecek] yapılır.",
      },
    ],
  },
  explicit_consent: {
    title: "Açık Rıza Metni",
    description: "İsteğe bağlı açık rızalar: hizmetin geliştirilmesi ve tanıtım iletileri.",
    source: "docs/hukuk/acik-riza-metni.md (2. ve 3. maddeler; 1. madde İP12'de sorulmaz)",
    blocks: [
      {
        kind: "p",
        text: "[Kişisel Verilerin İşlenmesine İlişkin Aydınlatma Metni](/kvkk)'ni okudum. Aşağıdaki işlemler için, her birini ayrı ayrı işaretleyerek açık rızamı veriyorum. Rıza vermemem hizmeti almama engel değildir. Rızamı istediğim zaman portaldan ya da [kvkk@alanadi] adresine yazarak geri alabilirim.",
      },
      { kind: "h2", text: "1. Hizmetin geliştirilmesi" },
      {
        kind: "p",
        text: "☐ Bahçemin görüntülerinin ve uzman değerlendirmelerinin, kimliğimle ilişkilendirilmeden, ağaç değerlendirme yöntemlerinin ve modellerinin geliştirilmesinde kullanılmasına rıza veriyorum.",
      },
      { kind: "h2", text: "2. Tanıtım ve bilgilendirme mesajları" },
      {
        kind: "p",
        text: "☐ Hizmetle ilgili yeniliklerin ve kampanyaların bana SMS / WhatsApp ile gönderilmesine rıza veriyorum. Ticari elektronik ileti onayı ayrıca İYS'ye kaydedilir.",
      },
      {
        kind: "p",
        text: '"Rapor hazır" ve "kritik bulgu" gibi hizmete ilişkin bildirimler bu maddeye bağlı değildir; hizmetin parçası olarak gönderilir.',
      },
      {
        kind: "p",
        text: "Rızalarınızı kayıt sırasında verebilir, sonra portalda Hesabım › İzinler'den değiştirebilirsiniz.",
      },
    ],
  },
  privacy: {
    title: "Gizlilik ve Çerez Politikası",
    description: "Site ve portalda gizlilik ve çerezler.",
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
          "Sunucu kayıtlarında, güvenlik amacıyla, IP adresi ve istek zamanı tutulur ([X] gün).",
          "Kayıt formunda robot doğrulaması için [Cloudflare Turnstile] kullanılır. Bu hizmet, doğrulama için tarayıcı ve cihaz bilgisi işler.",
          "Reklam ve izleme amaçlı üçüncü taraf araç (analitik, reklam pikseli) kullanılmaz.",
        ],
      },
      { kind: "h2", text: "3. Çerezler" },
      {
        kind: "p",
        text: "Yalnızca zorunlu çerezler kullanılır. Bu nedenle çerez onay penceresi gösterilmez.",
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
          ["Turnstile çerezleri", "Robot doğrulaması (yalnızca kayıt sayfasında)", "Kısa süreli"],
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
          "Telefon numaranız SMS koduyla doğrulanır. Kayıt denemelerinin kötüye kullanımını önlemek için IP adresinin ve telefonun tek yönlü özeti tutulur.",
          "Ödemede kart bilgileriniz ödeme kuruluşuna ([iyzico]) doğrudan girilir; Şirket'e ulaşmaz.",
        ],
      },
      { kind: "h2", text: "5. Haklarınız" },
      {
        kind: "p",
        text: "KVKK md. 11'deki haklarınız ve başvuru yolları [KVKK Aydınlatma Metni](/kvkk)'nin 8. bölümündedir. İsteğe bağlı açık rızalarınızı portalda Hesabım › İzinler'den değiştirebilirsiniz.",
      },
      { kind: "h2", text: "6. Değişiklikler" },
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
        text: 'Bu sözleşme iki yolla kurulur: kâğıt üzerinde imzayla ya da portalda, teklifin elektronik ortamda onaylanmasıyla (mesafeli hizmet sözleşmesi, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği). Portalda kurulduğunda Sahip, onaydan önce [Ön Bilgilendirme Formu](/on-bilgilendirme)\'nu okuduğunu ayrıca onaylar. Sitede "Mesafeli hizmet sözleşmesi" adıyla bu metin yayımlanır; ayrı bir sözleşme dosyası yoktur.',
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
      { kind: "h2", text: "Madde 2 – Konu" },
      {
        kind: "p",
        text: "Bu sözleşme, Sahip'in Ek-1'de listelenen bahçelerinin (her biri \"Bahçe\") Şirket tarafından bağımsız olarak, belirli aralıklarla denetlenmesini düzenler. Denetimin sonuçları uzman onaylı raporlar olarak Sahip'e sunulur. Tarafların hak ve yükümlülükleri bu sözleşmede belirtilmiştir.",
      },
      {
        kind: "p",
        text: "Üyelik dönemi içinde Madde 8D'ye göre eklenen bahçeler, ek siparişin başladığı gün Ek-1'e girer. Madde 12/3'e göre hizmetten çıkarılan bahçe, Ek-1'de çıkış tarihiyle gösterilir. Bu sözleşmenin her hükmü, aksi yazılmadıkça her Bahçe için ayrı ayrı uygulanır.",
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
          "**Periyodik ziyaretler:** Yılda [4] ziyaret (kış, ilkbahar, yaz, hasat). Ziyaret pencereleri Ek-2'dedir; kesin tarihler Şirket tarafından hava ve erişim koşullarına göre belirlenir.",
          "**Rapor:** Her ziyaretten sonra [X] iş günü içinde portalda yayımlanır.",
          "**Kritik bulgu bildirimi:** Ağaç kaybı, hırsızlık izi, yangın riski gibi acil bir durum, uzman onayıyla raporu beklemeden bildirilir.",
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
          "Bahçe üzerinde tasarruf yetkisi bulunduğunu, ya da tapu sahibi tarafından yetkilendirildiğini beyan eder ve belgesini sunar: tapu, vekâletname, mirasçılık belgesi, hissedarların muvafakati.",
          "Şirket personelinin ziyaret pencerelerinde Bahçe'ye girmesine izin verir ve erişimi sağlar: kapı, anahtar, bekçi.",
          "Envanter ziyaretinde kullanım sınırını kendisi ya da yetkilendirdiği kişi aracılığıyla gösterir.",
          "Bahçede çalışan kişileri tarama yapılacağı konusunda bilgilendirir.",
          "İletişim bilgilerindeki değişiklikleri bildirir.",
        ],
      },
      { kind: "h2", text: "Madde 6 – Sınır ve konum bilgileri" },
      {
        kind: "p",
        text: "Haritada gösterilen sınır, Sahip'in ya da yetkilendirdiği kişinin gösterdiği **fiili kullanım sınırıdır**.",
      },
      {
        kind: "ul",
        items: [
          "Tapu sınırı, mülkiyet ya da kullanım hakkı iddiası taşımaz.",
          "Sınır ve mülkiyet uyuşmazlıklarında kanıt olarak sunulmak üzere hazırlanmamıştır.",
        ],
      },
      { kind: "p", text: "Bu ibare her raporda yer alır." },
      { kind: "h2", text: "Madde 7 – Değerlendirmenin niteliği" },
      {
        kind: "ol",
        items: [
          "Raporlar, Bahçe'nin ziyaret tarihindeki **görünür durumunu** yansıtır. Ağaç sınıfları ve bulgular, görüntülere ve sahada yapılan gözlemlere dayanır.",
          "Değerlendirmelerde yapay zekâ ön değerlendirmesinden yararlanılabilir. Raporda yer alan her sonuç Uzman tarafından incelenir ve onaylanır.",
          "Değerlendirme teşhis değildir. Uzman'ın önerileri tavsiye niteliğindedir; uygulanması Sahip'in kararıdır.",
          'Görüntülerin alınamadığı ya da yetersiz kaldığı ağaçlar raporda "değerlendirilmedi" olarak belirtilir.',
          "Kullanılan metodoloji sürümü her raporda belirtilir.",
        ],
      },
      { kind: "h2", text: "Madde 8 – Ücret ve ödeme" },
      {
        kind: "ol",
        items: [
          "**Yıllık hizmet bedeli:** Teklifte yazan tutardır. Yıllık ziyaret sayısı, doğrulanan alan (dönüm) ve paketin dönüm ve ziyaret başı birim fiyatının çarpımıdır; bahçe başına en az ücret ve ilk yıl bir kez envanter ücreti eklenir. KDV ayrıca gösterilir. Teklif, geçerlilik süresi içinde değişmez. Teklifte her bahçe ayrı bir satırdır ve satırın tutarı ayrıca gösterilir. Üyelik dönemi içinde eklenen bahçenin bedeli Madde 8D'ye göre hesaplanır.",
          "**Ödeme:** Teklif onaylandıktan sonra peşin ve tek çekimdir: kartla (3D Secure, [ödeme kuruluşu: iyzico] üzerinden) ya da havale/EFT ile. Kart bilgileri Şirket'e ulaşmaz. Ödeme sipariş ödeme süresi içinde yapılmazsa sipariş kendiliğinden düşer.",
          "**Belge:** Her ödeme için portalda bir makbuz verilir. Makbuz fatura değildir; fatura [ ] düzenlenir.",
          "**Pilot dönemi:** [Ücretsiz / indirimli; süresi ve şartları].",
          "**Hizmetin başlaması:** Hizmet yılı ödemenin tamamlandığı gün (teklifte daha ileri bir başlangıç günü yazıyorsa o gün) başlar ve bir yıl sürer. Bu süre üyelik dönemidir. Ek siparişin hizmeti Madde 8D'ye göre başlar ve üyelik döneminin bitiş gününde biter.",
        ],
      },
      { kind: "h2", text: "Madde 8A – Yapılamayan ziyaretler" },
      {
        kind: "ol",
        items: [
          "Hava, erişim ya da Şirket'ten kaynaklanan bir nedenle yapılamayan ziyaret, aynı ziyaret penceresi içinde yeniden planlanır.",
          "Pencere içinde yapılamazsa, o ziyaretin bedeli Sahip'e iade edilir. Ziyaret bedeli, Bahçe'nin teklif satırındaki tutardan envanter payı çıkarıldıktan sonra kalanın, o satırdaki ziyaret hakkına bölünmesiyle bulunur. Tam yıllık siparişte bu, yıllık bedelin (envanter ücreti hariç) paketteki yıllık ziyaret sayısına bölünmesidir. İade, ödemenin yapıldığı yöntemle ve pencerenin bitiminden sonra en geç [14] gün içinde yapılır. Sahip isterse iade yerine ziyaret bir sonraki pencereye aktarılır.",
          "Sahip'ten kaynaklanan nedenlerle (erişim sağlanmaması, sınırı gösterecek kişinin bulunmaması) yapılamayan ziyaret için iade yapılmaz.",
          "Mücbir sebep halinde Madde 13 uygulanır.",
          "Bu madde uyarınca bir Bahçe için yapılmış iade, aynı Bahçe daha sonra hizmetten çıkarılırsa Madde 12/3'e göre hesaplanan iadeden düşülür. Böylece bir ziyaretin bedeli iki kez iade edilmez.",
        ],
      },
      { kind: "h2", text: "Madde 8B – Cayma hakkı" },
      {
        kind: "ol",
        items: [
          "Sözleşme portalda kurulmuşsa Sahip, ödemenin tamamlandığı (siparişin onaylanıp etkinleştiği) günden itibaren, hizmetin başlangıcı teklifte daha ileri bir gün olsa bile (örneğin yenilemede), **14 gün** içinde hiçbir gerekçe göstermeden ve cezai şart ödemeden cayabilir. Sürenin son günü, ödeme gününden 14 gün sonraki gündür ve süreye dahildir; örneğin ödemesi 1 Mart'ta tamamlanan siparişte 15 Mart. Ek siparişin cayma süresi Madde 8D/7'dedir.",
          "Cayma bildirimi portaldan, [e-posta] adresine ya da [KEP] adresine yazılı olarak yapılır. Süre içinde gönderilen bildirim yeterlidir.",
          "Şirket, cayma bildiriminin kendisine ulaştığı günden itibaren en geç **14 gün** içinde tahsil ettiği tutarın tamamını, ödemenin yapıldığı yöntemle ve Sahip'e bir masraf yüklemeden iade eder; 4. fıkradaki kesintiler saklıdır.",
          "**Hizmete cayma süresi içinde başlanması:** Sahip, teklifi onaylayarak hizmete (envanter ve periyodik ziyaretler) cayma süresi dolmadan başlanmasını açıkça talep eder ve cayma halinde yapılmış envanterin ve yapılmış periyodik ziyaretlerin bedelinin iade edilmeyeceğini kabul eder. Bu nedenle caymada, envanter sayımı yapıldıysa envanterin payı ve yapılmış periyodik ziyaretlerin bedeli (Madde 8A/2'deki ziyaret bedeliyle) iadeden düşülür. Envanter payı, Madde 12/3'teki gibi hesaplanır.",
          '**Tek bahçe için cayma:** Siparişte birden fazla Bahçe varsa Sahip cayma hakkını yalnızca bir Bahçe için de kullanabilir. Portalda Bahçe\'yi hizmetten çıkarırken "Cayma hakkımı kullanıyorum" seçeneğini **açıkça** seçer. Bu seçenek yalnızca cayma süresi içinde gösterilir; Bahçe aynı gün hizmetten çıkar ve o Bahçe\'nin satır tutarı 4. fıkradaki kesintilerle iade edilir. Madde 12/3\'teki zamanlama seçenekleri ("30 gün sonra", "dönem sonunda") cayma bildirimi sayılmaz.',
          "Sahip tüketici değilse (tacir ya da şirket) bu madde uygulanmaz.",
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
          "**Ziyaret hakkı:** Paketteki yıllık ziyaret sayısı, kalan günün dönemin toplam gününe oranıyla çarpılır. Kalan gün, ek teklifte yazan başlangıç günü (teklif gününden önce olamaz) ile dönemin bitiş günü arasındaki gün sayısıdır (ikisi de dahil). Sonuç en yakın tam sayıya yuvarlanır, yarım yukarı yuvarlanır; en az 1, en çok yıllık ziyaret sayısıdır. Ziyaret hakkı ek teklifte yazılır ve sabittir; ödeme daha sonraki bir gün yapılsa da değişmez.",
          "**Bedel:** Ziyaret tutarı, ziyaret hakkı × doğrulanan alan (dönüm) × paketin dönüm ve ziyaret başı birim fiyatıdır. Bahçe başına en az ücret aynı oranla (ziyaret hakkı ÷ yıllık ziyaret sayısı) orantılanır ve ikisinden büyük olanı alınır. Envanter ücreti, envanter tek seferlik bir iş olduğu için tam alınır; daha önce hizmetten çıkarılıp yeniden eklenen ve yayımlanmış envanteri bulunan bahçeden alınmaz. KDV ayrıca gösterilir.",
          {
            text: "**Örnek** (bilgi amaçlıdır; tutarlar deneme fiyat listesinden alınmıştır, gerçek fiyat değildir):",
            children: [
              "Üyelik dönemi 1 Kasım 2026–31 Ekim 2027 (365 gün). Paket yılda 4 ziyaret; birim fiyat 125,00 TL (dönüm·ziyaret), bahçe başına en az ücret 5.000,00 TL, envanter ücreti 0, KDV %20.",
              "15 dönümlük ek bahçenin hizmeti 1 Nisan 2027'de başlıyor. Kalan 214 gün: 4 × 214 ÷ 365 = 2,35 → **2 ziyaret**.",
              "Ziyaret tutarı 2 × 15 × 125,00 = 3.750,00 TL. Orantılı en az ücret 5.000,00 × 2 ÷ 4 = 2.500,00 TL; büyük olan 3.750,00 TL alınır. KDV dahil **4.500,00 TL**. Aynı bahçenin tam yıllık bedeli 9.000,00 TL olurdu.",
            ],
          },
          "**Son ek günü:** Ek teklif, dönemin bitişine (bitiş günü dahil) en az [30] gün kalan son güne kadar geçerlidir; örnekte 2 Ekim 2027. Ek teklif en geç bu gün onaylanır ve ödenir; bu günden sonra onaylanamaz ve kartla ödenemez. Daha sonra gelen bahçe, yenileme ödenip yeni dönem başlayınca yeni döneme tam yıl olarak eklenir.",
          "**Dönem kapanırsa:** Ödeme alındıktan sonra, ancak ek sipariş başlamadan önce üyelik dönemi sona ermiş ya da son ek günü geçmişse (örneğin geç kaydedilen bir havale ya da incelemede kalan bir kart ödemesi), ek sipariş başlamaz ve iptal edilir. Ödenen tutarın tamamı Madde 8B/3'teki gibi iade edilir.",
          "**Ek siparişin ödemesi ve cayma süresi:** Ek siparişin kendi ödemesi ve makbuzu vardır. Ek sipariş için cayma süresi, ek siparişin ödemesinin tamamlandığı (ek siparişin onaylanıp etkinleştiği) günden itibaren 14 gündür; teklifte daha ileri bir hizmet başlangıcı yazsa bile bu günden sayılır. Son gün dahildir. Cayma Madde 8B'ye göre kullanılır.",
          "Ek sipariş, bu maddede yazılanlar dışında bu sözleşmenin hükümlerine tabidir.",
        ],
      },
      { kind: "h2", text: "Madde 9 – Kişisel veriler ve gizlilik" },
      {
        kind: "ol",
        items: [
          "Şirket, kişisel verileri Kişisel Verilerin Korunması Kanunu'na ve Ek-3'teki Aydınlatma Metni'ne uygun olarak işler.",
          "Görüntülerde Bahçe'de bulunan kişiler görünebilir. Bu görüntüler yalnızca hizmet amacıyla işlenir ve Sahip dışındaki üçüncü kişilerle paylaşılmaz; Aydınlatma Metni'nde sayılan hizmet sağlayıcılar hariç.",
          "Şirket, Sahip'e ait bilgileri ve raporları gizli tutar. Sahip'in yazılı izni olmadan üçüncü kişilere açıklamaz; kanuni zorunluluklar hariç.",
          "**Hissedarlar:** Sahip, portalda hissedarlarını izleyici olarak ekleyebilir. Bu durumda hissedarlar aynı raporları görür.",
        ],
      },
      { kind: "h2", text: "Madde 10 – Fikri haklar ve verinin kullanımı" },
      {
        kind: "ol",
        items: [
          "Raporlar ve görüntüler, Sahip'in Bahçe'ye ilişkin kendi kullanımı için sunulur. Sahip bunları serbestçe kullanabilir ve paylaşabilir.",
          "Değerlendirme yöntemi, yazılım ve metodoloji Şirket'e aittir.",
          "Şirket, Bahçe'ye ait verileri yalnızca kimliksizleştirilmiş ve toplu halde, hizmetin ve yöntemlerin geliştirilmesi için kullanabilir. Kimlikle ilişkilendirilebilir kullanım, Sahip'in ayrı açık rızasına bağlıdır.",
        ],
      },
      { kind: "h2", text: "Madde 11 – Sorumluluk" },
      {
        kind: "ol",
        items: [
          "Şirket hizmeti özenle, metodolojiye uygun olarak yürütür.",
          "Şirket'in sorumluluğu, kast ve ağır kusur halleri hariç, ilgili dönemde ödenen hizmet bedeliyle sınırlıdır.",
          {
            text: "Şirket şunlardan sorumlu değildir:",
            children: [
              "Bahçe'deki ürün kaybı, hırsızlık, hastalık ve zararlıların sonuçları",
              "Sahip'in önerileri uygulayıp uygulamamasının sonuçları",
              "Ziyaret aralarında oluşan değişiklikler",
            ],
          },
        ],
      },
      { kind: "h2", text: "Madde 12 – Süre ve fesih" },
      {
        kind: "ol",
        items: [
          "Sözleşme kurulduğu tarihten (portalda: ödemenin tamamlandığı günden) itibaren [1] yıl süreyle geçerlidir. Ek siparişler bu sürenin sonunda biter (Madde 8D).",
          {
            text: "**Yenileme:** Hizmet yılı bitmeden en az [45] gün önce Şirket, Sahip'e portalda yenileme teklifi gönderir. Yeni dönemin fiyatı o gün yayımlı fiyat listesine göre hesaplanır.",
            children: [
              "Yenileme teklifi, o gün hizmette olan **bütün bahçeleri**, ek siparişle eklenenler dahil, tek teklifte kapsar. Hizmetten çıkmakta olan bahçe yenilemeye girmez. Sahip'in birden fazla üyelik dönemi varsa her dönemin yenileme teklifi ayrı verilir; Şirket, yenileme zamanında bahçeleri ek teklifle tek döneme toplamayı önerebilir.",
              "Sözleşme **kendiliğinden uzamaz ve kart otomatik olarak çekilmez.** Sahip yenileme teklifini onaylayıp ödediğinde yeni hizmet yılı, önceki yılın bitişinin ertesi günü başlar.",
              "Sahip yenileme teklifini onaylamazsa hizmet yılın sonunda biter ve 4. fıkra uygulanır.",
            ],
          },
          {
            text: '**Fesih ve bahçe bazında çıkarma:** Taraflardan her biri sözleşmeyi bütün bahçeler için ya da yalnızca bir Bahçe için [30] gün önceden yazılı bildirimle feshedebilir. Bahçe bazında fesih "bahçe çıkarma"dır.',
            children: [
              "**Talep:** Sahip portalda Bahçe'nin sayfasından ya da Hesabım › Bahçelerim'den talepte bulunur; nedenini ve zamanını **açıkça** seçer. **30 gün sonra:** çıkış günü, talep gününden [30] gün sonrası ile Bahçe'nin hizmet döneminin bitişinin ertesi gününden hangisi önce geliyorsa odur. **Dönem sonunda:** çıkış günü, Bahçe'nin hizmet döneminin bitişinin ertesi günüdür. **Cayma hakkıyla bugün:** yalnızca cayma süresi içinde ve Madde 8B/5'e göre.",
              "**Kendiliğinden hüküm:** Talep, Şirket'in onayını beklemeden çıkış gününde hüküm doğurur. Şirket çıkış tarihini teyit eder; tarih yalnızca Sahip'le anlaşarak değiştirilebilir ve Sahip'e SMS ile bildirilir. Sahip, çıkış gününe kadar talebini portaldan geri alabilir.",
              "**Şirket'in çıkarması:** Şirket de bir Bahçe'yi aynı bildirim süresiyle ya da Sahip'le anlaşarak hizmetten çıkarabilir; Sahip'e SMS ile bildirilir. Bahçe'nin devrinde (satış) Madde 12/4'teki erişim süresi uygulanmaz.",
              "**Ödeme bekleyen sipariş:** Bahçe, ödemesi beklenen bir siparişte de yer alıyorsa (örneğin onaylanmış ama ödenmemiş bir yenileme), o sipariş iptal edilmeden ya da düzeltilmeden çıkarma talebi alınmaz.",
              "**Çıkış gününde:** Bahçe'nin bütün planlı ziyaretleri iptal edilir ve Bahçe pasif olur. Çıkış gününden önce yapılmış ziyaretlerin raporları yayımlanır. Bahçe'nin verileri silinmez (Madde 12/4).",
              "**İade hesabı:** Bahçe'nin teklif satırı esas alınır ve tutarlar KDV dahildir. Envanter payı = satır tutarı × envanter ücreti ÷ satırın KDV ve indirim öncesi tabanı. Ziyaret bedeli = (satır tutarı − envanter payı) ÷ satırdaki ziyaret hakkı (Madde 8A/2). İade = kullanılmayan ziyaret sayısı × ziyaret bedeli; envanter yapılmadıysa envanter payı da eklenir. Hiç ziyaret yapılmadıysa satır tutarının envanter payı dışındaki tamamı iade edilir. Bu Bahçe'nin satırı için daha önce yapılmış ya da başlatılmış bütün iadeler, Madde 8A iadeleri dahil, sonuçtan düşülür. Sonuç sıfırdan küçükse iade yapılmaz. Her iadenin KDV payı ayrıca gösterilir.",
              "**Kullanılmış sayılan ziyaret:** Bahçe'nin hizmet başlangıcı ile çıkış gününden önceki gün arasında yapılmış periyodik ziyaretlerdir. Şirket'in kendi gerektirdiği yeniden taramalar (görüntü kalitesi ya da kapsama nedeniyle işleme hattının ya da Uzman'ın istediği ek ziyaretler) sayılmaz. Aynı gün yapılmış iki tarama bir ziyaret sayılır. Ziyaret hakkından fazlası sayılmaz.",
              "**Dönemi biten satır:** Hizmet dönemi çıkış gününden önce bitmiş bir satır bu iadeye girmez; o dönemde yapılamayan ziyaretler yalnızca Madde 8A'ya göre iade edilir.",
              "**Ödenmiş yenileme:** Bahçe'nin henüz başlamamış, ödenmiş bir yenileme satırı varsa o satırın tutarının tamamı iade edilir.",
              "**Mükerrer kayıt:** Aynı bahçe Şirket'in hatasıyla iki kez kaydedilmişse fazla kaydın satır tutarının tamamı iade edilir; yalnızca yapılmış ziyaretler düşülür.",
              "**Örnek 1** (bilgi amaçlıdır): Satır tutarı 12.000,00 TL (KDV dahil, envanter ücreti yok), ziyaret hakkı 4, yapılmış ziyaret 1. Ziyaret bedeli 3.000,00 TL; iade 3 × 3.000,00 = **9.000,00 TL** (KDV payı 1.500,00 TL).",
              "**Örnek 2:** Aynı satırda 1 ziyaret yapılmış, 1 ziyaret yapılamamış ve Madde 8A'ya göre 3.000,00 TL daha önce iade edilmiş. Hesap 3 × 3.000,00 = 9.000,00 TL; önceki iade 3.000,00 TL düşülür ve iade **6.000,00 TL** olur (KDV payı 1.000,00 TL). Toplam iade 9.000,00 TL'dir, yani yapılmamış üç ziyaretin bedeli.",
              "**İade yöntemi:** İade, çıkış gününden itibaren en geç [14] gün içinde ödemenin yapıldığı yöntemle yapılır ([İptal ve İade Politikası](/iade)).",
              "**Son bahçe:** Sahip'in son Bahçe'si hizmetten çıktığında sözleşme bütünüyle sona erer.",
            ],
          },
          {
            text: "**Bir Bahçe 3. fıkraya göre hizmetten çıkarıldığında** (son Bahçe'nin çıkmasıyla sözleşmenin sona ermesi dahil):",
            children: [
              "Sahip ve davet ettiği hissedarlar, çıkış gününden (sözleşmenin sona erdiği günden) itibaren [90] gün boyunca Bahçe'nin raporlarını portalda **salt okunur** olarak görür ve indirebilir. Bu sürede soru sorulamaz ve yeni hissedar eklenemez. Bahçe'nin verileri silinmez.",
              "Erişim süresi en az 14 gün ise, erişimin bitmesinden 7 gün önce Sahip'e SMS ile hatırlatma gönderilir.",
              "Süre sonunda şu erişimler kaldırılır: Sahip'in kendi erişimi, Sahip'in davet ettiği hissedarların erişimi ve Bahçe'de başka bir sahip kalmıyorsa bütün hissedarların erişimi. Bahçe'de hizmet alan başka bir sahip varsa onun erişimi sürer; Şirket bütün erişimleri kaldırmaya karar verebilir.",
              "Bahçe'nin devrinde (satış) erişim süresi uygulanmaz ve erişim çıkış gününde kaldırılır. Daha kısa bir erişim süresi yalnızca devirde, mükerrer kayıtta ya da yazılı bir gerekçeyle uygulanır.",
              "Sonrasında veriler, Aydınlatma Metni'ndeki sürelere göre silinir ya da anonim hale getirilir.",
            ],
          },
        ],
      },
      { kind: "h2", text: "Madde 13 – Mücbir sebep" },
      {
        kind: "p",
        text: "Doğal afet, salgın, olağanüstü hava koşulları, resmi yasaklar ve erişimin engellenmesi gibi tarafların kontrolü dışındaki hallerde yükümlülükler, engel süresince askıya alınır.",
      },
      { kind: "h2", text: "Madde 14 – Tebligat ve iletişim" },
      {
        kind: "p",
        text: "Taraflar, Madde 1'deki adreslerini tebligat adresi olarak kabul eder. Hizmete ilişkin bildirimler SMS, WhatsApp, e-posta ya da portal üzerinden yapılabilir.",
      },
      { kind: "h2", text: "Madde 15 – Uyuşmazlıklar" },
      {
        kind: "p",
        text: "Bu sözleşmeden doğan uyuşmazlıklarda [Gaziantep] mahkemeleri ve icra daireleri yetkilidir. Tüketici işlemi sayılması halinde Sahip, Ticaret Bakanlığı'nca her yıl ilan edilen parasal sınırlar içinde yerleşim yerindeki ya da işlemin yapıldığı yerdeki tüketici hakem heyetine, sınırların üzerinde tüketici mahkemesine başvurabilir.",
      },
      { kind: "h2", text: "Madde 16 – Yürürlük" },
      {
        kind: "p",
        text: "Bu sözleşme [16] maddeden ve eklerden oluşur. Kâğıt üzerinde [Tarih]'te iki nüsha olarak imzalanmıştır; portalda kurulduğunda teklifin onaylandığı anda yürürlüğe girer ve metni, onaylanan sürümüyle Sahip'in portalında saklanır.",
      },
      { kind: "table", head: ["Şirket", "Sahip"], rows: [["[Ad, imza]", "[Ad, imza]"]] },
      { kind: "p", text: "**Ekler**" },
      {
        kind: "ul",
        items: [
          "**Ek-1:** Bahçe listesi. Her bahçe için: il, ilçe, köy; tapu referansı (varsa); kaba konum; sınırı gösterecek kişi; erişim notu; hizmet başlangıcı ve siparişi. Ek siparişle eklenen bahçeler eklendikleri tarih ve sipariş numarasıyla, hizmetten çıkarılan bahçeler çıkış tarihiyle gösterilir. Portalda güncel liste Hesabım › Bahçelerim'dedir.",
          "**Ek-2:** Ziyaret pencereleri. Kış: Aralık–Şubat · İlkbahar: Nisan–Mayıs · Yaz: Haziran–Temmuz · Hasat: Ağustos–Ekim.",
          "**Ek-3:** Kişisel verilerin işlenmesine ilişkin aydınlatma metni.",
          "**Ek-4:** Açık rıza metni (isteğe bağlı).",
          "**Ek-5:** Ön bilgilendirme formu (yalnızca portalda kurulan sözleşmede).",
          "**Ek-6:** İptal ve iade politikası.",
        ],
      },
    ],
  },
  pre_information: {
    title: "Ön Bilgilendirme Formu",
    description: "Mesafeli hizmet sözleşmesinden önce okunacak ön bilgilendirme formu.",
    source: "docs/hukuk/on-bilgilendirme-formu-taslagi.md",
    blocks: [
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
          "Haritadaki sınır Sahip'in gösterdiği fiili kullanım sınırıdır; **tapu ya da mülkiyet sınırı iddiası taşımaz.**",
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
              "Ziyaret tutarı ziyaret hakkıyla hesaplanır. Bahçe başına en az ücret aynı oranla orantılanır. Envanter ücreti tam alınır; yayımlanmış envanteri olan ve yeniden eklenen bahçeden alınmaz.",
              'Ek teklif hizmet dönemini (başlangıç ve üyeliğinizle ortak bitiş günü), ziyaret hakkını (ör. "2/4 ziyaret"), bahçe bazında envanteri ve son geçerlilik gününü gösterir. Son geçerlilik günü, dönemin bitişine en az [30] gün kalan son günü geçmez; ek teklif en geç o gün onaylanır ve ödenir.',
              "Örnek (deneme fiyatlarıyla): 1 Kasım 2026–31 Ekim 2027 döneminde, yılda 4 ziyaretli pakette 1 Nisan 2027'de başlayan 15 dönümlük bahçe için 2 ziyaret ve KDV dahil 4.500,00 TL; tam yıl 9.000,00 TL olurdu.",
            ],
          },
          "Ek masraf yoktur.",
        ],
      },
      { kind: "h2", text: "4. Ödeme ve ifa" },
      {
        kind: "ul",
        items: [
          "Ödeme peşin ve tek çekimdir: kartla 3D Secure ile ([iyzico Ödeme Hizmetleri A.Ş.] üzerinden) ya da havale/EFT ile. Kart bilgileri Şirket'e ulaşmaz.",
          "Hizmet yılı ödemenin tamamlandığı gün başlar. Ek siparişin hizmeti ödemenin tamamlandığı gün (teklifte daha ileri bir başlangıç günü yazıyorsa o gün) başlar ve üyelik döneminin bitiş gününde biter. Ödeme son ek gününden sonra ulaşır ya da dönem bu arada sona ererse ek sipariş başlamaz ve ödenen tutar iade edilir. Envanter ziyaretinin tarihi Sahip'le birlikte belirlenir; periyodik ziyaretler sözleşmenin Ek-2'sindeki pencerelerde yapılır.",
          "Rapor her ziyaretten sonra [X] iş günü içinde portalda yayımlanır.",
        ],
      },
      { kind: "h2", text: "5. Cayma hakkı" },
      {
        kind: "ul",
        items: [
          "Sahip, ödemenin tamamlandığı (siparişin onaylanıp etkinleştiği) günden itibaren **14 gün** içinde gerekçe göstermeden ve cezai şart ödemeden cayabilir; son gün dahildir. Hizmetin başlangıcı teklifte daha ileri bir gün olsa bile (örneğin yenilemede) süre ödeme gününden sayılır. Ek siparişte süre, ek siparişin ödemesinin tamamlandığı günden sayılır.",
          "Bildirim portaldan, [e-posta] ya da [KEP] adresine yazılı olarak yapılır.",
          'Cayma tek bir bahçe için de kullanılabilir: portalda bahçeyi hizmetten çıkarırken "Cayma hakkımı kullanıyorum" seçeneği **açıkça** seçilir. Bu seçenek yalnızca cayma süresi içinde gösterilir. "30 gün sonra" ya da "dönem sonunda" seçimi cayma bildirimi sayılmaz.',
          "Ödenen tutar, bildirimin ulaşmasından itibaren en geç **14 gün** içinde, ödemenin yapıldığı yöntemle iade edilir.",
          "**Hizmete cayma süresi içinde başlanması:** Sahip, teklifi onaylayarak hizmete (envanter ve periyodik ziyaretler) cayma süresi dolmadan başlanmasını açıkça talep eder ve cayma halinde yapılmış envanterin ve yapılmış periyodik ziyaretlerin bedelinin iade edilmeyeceğini kabul eder. Caymada, envanter sayımı yapıldıysa envanterin payı ve yapılmış periyodik ziyaretlerin bedeli iadeden düşülür.",
          "Cayma süresinden sonra bahçe bazında fesih ve iade: [İptal ve İade Politikası](/iade), 5. bölüm.",
        ],
      },
      { kind: "h2", text: "6. Şikâyet ve itiraz" },
      {
        kind: "ul",
        items: [
          "Şikâyetler [E-posta] ve [Telefon] üzerinden iletilir.",
          "Tüketici, Ticaret Bakanlığı'nca ilan edilen parasal sınırlar içinde tüketici hakem heyetine, sınırların üzerinde tüketici mahkemesine başvurabilir.",
        ],
      },
      { kind: "h2", text: "7. Kişisel veriler" },
      {
        kind: "p",
        text: "Kişisel veriler [KVKK Aydınlatma Metni](/kvkk)'ne göre işlenir. Ödeme bilgileri ödeme kuruluşuyla paylaşılır.",
      },
      {
        kind: "p",
        text: "Bu formu okudum ve sözleşme kurulmadan önce bilgilendirildiğimi onaylıyorum.",
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
          "Ödeme süresi içinde ödenmeyen sipariş kendiliğinden düşer.",
          "Üyeliğinize eklenen bir bahçenin teklifi (ek teklif) en geç son ek gününde onaylanır ve ödenir; son ek günü teklifte yazar. Ödemeniz bu günden sonra ulaşır ya da üyelik döneminiz bu arada sona ererse ek sipariş başlamaz, iptal edilir ve ödediğiniz tutarın tamamı iade edilir.",
        ],
      },
      { kind: "h2", text: "2. Cayma hakkı (14 gün)" },
      {
        kind: "ul",
        items: [
          "Ödemenin tamamlandığı (siparişinizin onaylanıp etkinleştiği) günden itibaren 14 gün içinde gerekçe göstermeden cayabilirsiniz. Hizmetin başlangıcı daha ileri bir gün olsa bile (örneğin yenilemede) süre ödeme gününden sayılır. Son gün dahildir: ödemesi 1 Mart'ta tamamlanan siparişte 15 Mart.",
          "Üyeliğinize sonradan eklenen bahçenin siparişi (ek sipariş) için de 14 gün, o siparişin ödemesinin tamamlandığı günden sayılır.",
          'Bildirimi portaldan, [e-posta] ya da [KEP] adresine yazarak yaparsınız. Tek bir bahçe için cayma, bahçeyi hizmetten çıkarırken "Cayma hakkımı kullanıyorum" seçeneğiyle yapılır (5. bölüm).',
          "Ödediğiniz tutar en geç 14 gün içinde iade edilir.",
          "Teklifi onaylayarak hizmete cayma süresi içinde başlanmasını açıkça istemiş ve yapılmış hizmetin bedelinin iade edilmeyeceğini kabul etmiş olursunuz. Bu yüzden caymada, envanter sayımı yapıldıysa envanterin payı ve yapılmış periyodik ziyaretlerin bedeli iadeden düşülür.",
        ],
      },
      { kind: "h2", text: "3. Yapılamayan ziyaret" },
      {
        kind: "ul",
        items: [
          "Hava ya da erişim nedeniyle yapılamayan ziyaret aynı pencere içinde yeniden planlanır.",
          "Pencere içinde yapılamazsa o ziyaretin bedeli iade edilir ya da isterseniz sonraki pencereye aktarılır. Ziyaret bedeli: bahçenin teklif satırındaki tutar (envanter payı hariç) ÷ satırdaki ziyaret hakkı. Tam yıllık siparişte bu, yıllık bedelin (envanter hariç) yıllık ziyaret sayısına bölünmesidir.",
          "Sizden kaynaklanan nedenlerle (erişim sağlanmaması) yapılamayan ziyaret iade edilmez.",
          "Bu yolla iade edilen ziyaret, bahçeyi daha sonra hizmetten çıkarırsanız oradaki iadeden düşülür; bir ziyaret iki kez iade edilmez.",
        ],
      },
      { kind: "h2", text: "4. Fesih" },
      {
        kind: "ul",
        items: [
          '[30] gün önceden yazılı bildirimle sözleşmeyi bütün bahçeleriniz için ya da yalnızca bir bahçe için feshedebilirsiniz. Tek bir bahçeyi bırakmak "bahçe çıkarma"dır; nasıl yapıldığı 5. bölümdedir.',
          "Kullanılmayan ziyaretlerin bedeli iade edilir; yapılmış envanterin ücreti iade edilmez.",
          "Son bahçeniz hizmetten çıkınca üyeliğiniz sona erer.",
        ],
      },
      { kind: "h2", text: "5. Bahçe çıkarma" },
      { kind: "p", text: "**Nasıl istenir?**" },
      {
        kind: "ul",
        items: [
          'Portalda bahçenin sayfasında ya da Hesabım › Bahçelerim\'de "Bahçeyi hizmetten çıkar"a basın. Nedeni ve zamanı seçin, isterseniz not yazın, onay kutusunu işaretleyin.',
          'Her seçenek kendi çıkış tarihiyle, tahmini iadesiyle ve raporlara erişimin bittiği tarihle gösterilir. Tahmini iade bir üst sınırdır ("en fazla"); çıkışa kadar yapılan ziyaretler düşülür.',
          "Talebiniz bir numara alır (C-…) ve çıkış gününde kendiliğinden işler. Çıkış gününe kadar portaldan geri alabilirsiniz.",
          "Bahçe ödemesi beklenen bir siparişte de yer alıyorsa (örneğin onayladığınız ama ödemediğiniz yenileme), önce o siparişi iptal etmeniz ya da düzeltmeniz gerekir. Portal sizi o siparişe yönlendirir.",
        ],
      },
      { kind: "p", text: "**Zaman seçenekleri**" },
      {
        kind: "table",
        head: ["Seçenek", "Çıkış günü", "İade"],
        rows: [
          [
            "30 gün sonra (varsayılan)",
            "Talepten [30] gün sonra; hizmet döneminiz daha önce bitiyorsa dönem sonunun ertesi günü",
            'Kullanılmayan ziyaretler (aşağıda). Çıkış günü dönem sonunun ertesi gününe denk gelirse "Dönem sonunda" satırındaki gibi',
          ],
          [
            "Dönem sonunda",
            "Hizmet döneminin bitişinin ertesi günü",
            "Bu dönem için çıkarma iadesi yoktur, çünkü bahçe dönemin sonuna kadar hizmette kalır. Dönem içinde yapılamayan ziyaretler yalnızca 3. bölüme göre iade edilir. Ödenmiş bir yenileme varsa yenilemenin tamamı iade edilir",
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
        text: "Ekibimiz çıkış tarihini teyit eder. Tarih yalnızca sizinle anlaşarak değiştirilir; değişiklik size SMS ile bildirilir.",
      },
      { kind: "p", text: "**İade hesabı**" },
      {
        kind: "ul",
        items: [
          "Bahçenin teklifteki satır tutarı esas alınır (KDV dahil).",
          "Ziyaret bedeli = (satır tutarı − envanter payı) ÷ satırdaki ziyaret hakkı.",
          "İade = kullanılmayan ziyaret × ziyaret bedeli; envanter yapılmadıysa envanter payı da iade edilir.",
          "**Kullanılmış sayılan ziyaret:** çıkış gününden önce yapılmış periyodik ziyaretler. Bizim gerektirdiğimiz yeniden taramalar (görüntü kalitesi ya da kapsama için yapılan ek ziyaretler) sayılmaz. Aynı gün yapılmış iki tarama bir ziyaret sayılır.",
          "**Önceki iadeler düşülür:** Bu bahçe için daha önce yapılmış iadeler, yapılamayan ziyaret iadeleri (3. bölüm) dahil, hesaptan düşülür.",
          "Hizmet dönemi çıkış gününden önce bitmiş bir siparişin, çıkış dönem sonuna denk geldiğinde içinde bulunduğunuz dönemin siparişi dahil, kullanılmayan ve yapılamayan ziyaretleri bu iadeye girmez; yapılamayan ziyaretler yalnızca 3. bölüme göre iade edilir.",
          "Ödenmiş ama henüz başlamamış yenilemenin bu bahçeye düşen tutarı tamamen iade edilir.",
          "Her iadede KDV payı ayrıca gösterilir.",
        ],
      },
      { kind: "p", text: "**Örnekler** (KDV dahil, envanter ücreti yok):" },
      {
        kind: "ul",
        items: [
          "12.000,00 TL'lik bahçe, 4 ziyaret hakkı, 1 ziyaret yapılmış: ziyaret bedeli 3.000,00 TL, iade **9.000,00 TL** (KDV payı 1.500,00 TL).",
          "Aynı bahçede 1 ziyaret yapılmış, 1 ziyaret yapılamamış ve 3.000,00 TL daha önce iade edilmiş: hesap 9.000,00 TL, önceki iade düşülür, iade **6.000,00 TL**. Toplamda yapılmamış üç ziyaretin bedeli, 9.000,00 TL iade edilmiş olur.",
        ],
      },
      {
        kind: "p",
        text: "**İade nasıl ödenir?** İade hesabı çıkış gününde yapılır. İade, 6. bölümdeki gibi ödemenin yapıldığı yöntemle, çıkış gününden itibaren en geç [14] gün içinde ödenir. Tutarın bir kısmı birden fazla bahçeye ayrılamıyorsa (örneğin bahçe ayrımı olmadan yapılmış bir önceki iade) iadeyi ekibimiz elle inceler; bu durumda da süre aynıdır.",
      },
      { kind: "p", text: "**Çıkıştan sonra**" },
      {
        kind: "ul",
        items: [
          "Bahçenin planlı ziyaretleri iptal edilir. Çıkıştan önce yapılmış ziyaretlerin raporları yayımlanır. Verileriniz silinmez.",
          "[90] gün boyunca siz ve davet ettiğiniz hissedarlar raporları **salt okunur** görür ve indirebilirsiniz. Bu sürede soru sorulamaz, hissedar eklenemez.",
          "Süre sonunda sizin ve davet ettiğiniz hissedarların erişimi kalkar. Bahçede başka bir sahip yoksa bütün hissedarların erişimi kalkar. Bahçe satıldıysa (devir) erişim çıkış gününde kalkar.",
          "Bahçeyi yeniden eklemek isterseniz yeni bir ek teklif alırsınız; yayımlanmış envanteri olan bahçeden envanter ücreti alınmaz.",
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
          "İade yapılınca size SMS ya da WhatsApp ile bildirim gelir; portalda ödeme geçmişinizde görünür.",
          "İadeler kalem kalem yapılır; kısmi iade mümkündür.",
        ],
      },
      { kind: "h2", text: "7. İletişim" },
      { kind: "p", text: "[E-posta] · [Telefon]" },
    ],
  },
};
