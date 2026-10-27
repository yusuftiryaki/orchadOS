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
      "Portalda kurulan bahçe denetim hizmeti sözleşmesi: kapsam, ödeme, cayma hakkı, yenileme.",
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
        text: "Bu sözleşme, Sahip'in Ek-1'de belirtilen bahçesinin (\"Bahçe\") Şirket tarafından bağımsız olarak, belirli aralıklarla denetlenmesini düzenler. Denetimin sonuçları uzman onaylı raporlar olarak Sahip'e sunulur. Tarafların hak ve yükümlülükleri bu sözleşmede belirtilmiştir.",
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
          "**Yıllık hizmet bedeli:** Teklifte yazan tutardır. Yıllık ziyaret sayısı, doğrulanan alan (dönüm) ve paketin dönüm ve ziyaret başı birim fiyatının çarpımıdır; bahçe başına en az ücret ve ilk yıl bir kez envanter ücreti eklenir. KDV ayrıca gösterilir. Teklif, geçerlilik süresi içinde değişmez.",
          "**Ödeme:** Teklif onaylandıktan sonra peşin ve tek çekimdir: kartla (3D Secure, [ödeme kuruluşu: iyzico] üzerinden) ya da havale/EFT ile. Kart bilgileri Şirket'e ulaşmaz. Ödeme sipariş ödeme süresi içinde yapılmazsa sipariş kendiliğinden düşer.",
          "**Belge:** Her ödeme için portalda bir makbuz verilir. Makbuz fatura değildir; fatura [ ] düzenlenir.",
          "**Pilot dönemi:** [Ücretsiz / indirimli; süresi ve şartları].",
          "**Hizmetin başlaması:** Hizmet yılı ödemenin tamamlandığı gün başlar ve bir yıl sürer.",
        ],
      },
      { kind: "h2", text: "Madde 8A – Yapılamayan ziyaretler" },
      {
        kind: "ol",
        items: [
          "Hava, erişim ya da Şirket'ten kaynaklanan bir nedenle yapılamayan ziyaret, aynı ziyaret penceresi içinde yeniden planlanır.",
          "Pencere içinde yapılamazsa, o ziyaretin bedeli Sahip'e iade edilir. Ziyaret bedeli, yıllık bedelin (envanter ücreti hariç) paketteki yıllık ziyaret sayısına bölünmesiyle bulunur. İade, ödemenin yapıldığı yöntemle ve pencerenin bitiminden sonra en geç [14] gün içinde yapılır. Sahip isterse iade yerine ziyaret bir sonraki pencereye aktarılır.",
          "Sahip'ten kaynaklanan nedenlerle (erişim sağlanmaması, sınırı gösterecek kişinin bulunmaması) yapılamayan ziyaret için iade yapılmaz.",
          "Mücbir sebep halinde Madde 13 uygulanır.",
        ],
      },
      { kind: "h2", text: "Madde 8B – Cayma hakkı" },
      {
        kind: "ol",
        items: [
          "Sözleşme portalda kurulmuşsa Sahip, sözleşmenin kurulduğu günden (ödemenin tamamlandığı gün) itibaren **14 gün** içinde hiçbir gerekçe göstermeden ve cezai şart ödemeden cayabilir.",
          "Cayma bildirimi portaldan, [e-posta] adresine ya da [KEP] adresine yazılı olarak yapılır. Süre içinde gönderilen bildirim yeterlidir.",
          "Şirket, cayma bildiriminin kendisine ulaştığı günden itibaren en geç **14 gün** içinde tahsil ettiği tutarın tamamını, ödemenin yapıldığı yöntemle ve Sahip'e bir masraf yüklemeden iade eder.",
          "**Hizmete cayma süresi içinde başlanması:** Sahip, envanter ziyaretinin cayma süresi dolmadan yapılmasını açıkça isterse ve ziyaret yapılırsa, cayma halinde yapılan hizmetin bedeli [orantılı olarak] düşülür.",
          "Sahip tüketici değilse (tacir ya da şirket) bu madde uygulanmaz.",
        ],
      },
      { kind: "h2", text: "Madde 8C – Ödeme sonrası iptal ve iade" },
      {
        kind: "ol",
        items: [
          "Ödemeden önce Sahip siparişi portaldan iptal edebilir; bir bedel doğmaz.",
          "Cayma süresinden sonra yapılan fesihte Madde 12/2 uygulanır.",
          "İade yöntemi ve süreleri [İptal ve İade Politikası](/iade)'nda yazılıdır.",
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
          "Sözleşme kurulduğu tarihten (portalda: ödemenin tamamlandığı günden) itibaren [1] yıl süreyle geçerlidir.",
          {
            text: "**Yenileme:** Hizmet yılı bitmeden en az [45] gün önce Şirket, Sahip'e portalda yenileme teklifi gönderir. Yeni dönemin fiyatı o gün yayımlı fiyat listesine göre hesaplanır.",
            children: [
              "Sözleşme **kendiliğinden uzamaz ve kart otomatik olarak çekilmez.** Sahip yenileme teklifini onaylayıp ödediğinde yeni hizmet yılı, önceki yılın bitişinin ertesi günü başlar.",
              "Sahip yenileme teklifini onaylamazsa hizmet yılın sonunda biter ve 3. fıkra uygulanır.",
              "",
            ],
          },
          "Taraflardan her biri [30] gün önceden yazılı bildirimle sözleşmeyi feshedebilir. Kullanılmayan ziyaretlerin bedeli, Madde 8A/2'deki ziyaret bedeli esasına göre iade edilir; yapılmış envanterin ücreti iade edilmez.",
          {
            text: "**Sözleşme sona erdiğinde:**",
            children: [
              "Sahip, [90] gün boyunca portaldan raporlarını indirebilir.",
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
          "**Ek-1:** Bahçe bilgileri. İl, ilçe, köy; tapu referansı (varsa); kaba konum; sınırı gösterecek kişi; erişim notu.",
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
          "Antep fıstığı bahçesinin bağımsız denetimi: bir kez envanter (kullanım sınırı, ağaç haritası ve kodlama) ve paketteki sayıda periyodik ziyaret.",
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
          "Ek masraf yoktur.",
        ],
      },
      { kind: "h2", text: "4. Ödeme ve ifa" },
      {
        kind: "ul",
        items: [
          "Ödeme peşin ve tek çekimdir: kartla 3D Secure ile ([iyzico Ödeme Hizmetleri A.Ş.] üzerinden) ya da havale/EFT ile. Kart bilgileri Şirket'e ulaşmaz.",
          "Hizmet yılı ödemenin tamamlandığı gün başlar. Envanter ziyaretinin tarihi Sahip'le birlikte belirlenir; periyodik ziyaretler sözleşmenin Ek-2'sindeki pencerelerde yapılır.",
          "Rapor her ziyaretten sonra [X] iş günü içinde portalda yayımlanır.",
        ],
      },
      { kind: "h2", text: "5. Cayma hakkı" },
      {
        kind: "ul",
        items: [
          "Sahip, sözleşmenin kurulduğu günden itibaren **14 gün** içinde gerekçe göstermeden ve cezai şart ödemeden cayabilir.",
          "Bildirim portaldan, [e-posta] ya da [KEP] adresine yazılı olarak yapılır.",
          "Ödenen tutar, bildirimin ulaşmasından itibaren en geç **14 gün** içinde, ödemenin yapıldığı yöntemle iade edilir.",
          "Sahip'in açık isteğiyle cayma süresi içinde hizmete başlanmışsa:.",
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
    description: "İptal, cayma, yapılamayan ziyaret ve iade kuralları.",
    source: "docs/hukuk/iptal-iade-politikasi-taslagi.md",
    blocks: [
      { kind: "h2", text: "1. Ödemeden önce" },
      {
        kind: "ul",
        items: [
          "Başvurunuzu ya da onaylamadığınız teklifi istediğiniz zaman geri çekebilirsiniz.",
          "Onayladığınız ama henüz ödemediğiniz siparişi portaldan iptal edebilirsiniz. Bir bedel doğmaz.",
          "Ödeme süresi içinde ödenmeyen sipariş kendiliğinden düşer.",
        ],
      },
      { kind: "h2", text: "2. Cayma hakkı (14 gün)" },
      {
        kind: "ul",
        items: [
          "Ödemenin tamamlandığı günden itibaren 14 gün içinde gerekçe göstermeden cayabilirsiniz.",
          "Bildirimi portaldan, [e-posta] ya da [KEP] adresine yazarak yaparsınız.",
          "Ödediğiniz tutar en geç 14 gün içinde iade edilir.",
          "Sizin isteğinizle cayma süresi içinde envanter ziyareti yapılmışsa:.",
        ],
      },
      { kind: "h2", text: "3. Yapılamayan ziyaret" },
      {
        kind: "ul",
        items: [
          "Hava ya da erişim nedeniyle yapılamayan ziyaret aynı pencere içinde yeniden planlanır.",
          "Pencere içinde yapılamazsa o ziyaretin bedeli iade edilir ya da isterseniz sonraki pencereye aktarılır. Ziyaret bedeli: yıllık bedel (envanter hariç) ÷ yıllık ziyaret sayısı.",
          "Sizden kaynaklanan nedenlerle (erişim sağlanmaması) yapılamayan ziyaret iade edilmez.",
        ],
      },
      { kind: "h2", text: "4. Fesih" },
      {
        kind: "ul",
        items: [
          "[30] gün önceden yazılı bildirimle sözleşmeyi feshedebilirsiniz.",
          "Kullanılmayan ziyaretlerin bedeli iade edilir; yapılmış envanterin ücreti iade edilmez.",
        ],
      },
      { kind: "h2", text: "5. İade nasıl yapılır?" },
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
      { kind: "h2", text: "6. İletişim" },
      { kind: "p", text: "[E-posta] · [Telefon]" },
    ],
  },
};
