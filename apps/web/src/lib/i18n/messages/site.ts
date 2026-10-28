// Turkish text of the public site, the sign-up flow and the login page's
// sign-up link (İP12-C). Product claims follow docs/MVP.md: independent data
// collection, expert-signed reports, no disease diagnosis, no deed or
// ownership boundary claims.

export const siteText = {
  nav: {
    label: "Site",
    howItWorks: "Nasıl çalışır",
    packages: "Paketler",
    faq: "SSS",
    contact: "İletişim",
    login: "Giriş",
    signup: "Kayıt ol",
    account: "Hesabım",
    logout: "Çıkış",
    menu: "Menü",
    demo: "Demoyu dene",
  },
  footer: {
    legalLabel: "Hukuki metinler",
    // Placeholders until the company information is complete (T21; filled
    // from public_company_info()).
    company: "[Şirket unvanı] · [Adres] · [MERSİS no]",
    contactLine: "[E-posta] · [Telefon]",
    companyFilled: (c: { legal_name: string; address: string; mersis_number: string }) =>
      `${c.legal_name} · ${c.address} · MERSİS: ${c.mersis_number}`,
    taxLine: (c: { tax_office: string; tax_number: string }) =>
      `Vergi dairesi / no: ${c.tax_office} / ${c.tax_number}`,
    contactFilled: (c: {
      email: string;
      phone: string;
      kep_address: string;
      site_domain: string;
    }) => `${c.email} · ${c.phone} · KEP: ${c.kep_address} · ${c.site_domain}`,
    legal: {
      kvkk: "KVKK aydınlatma metni",
      explicitConsent: "Açık rıza metni",
      privacy: "Gizlilik ve çerez politikası",
      distanceSales: "Mesafeli hizmet sözleşmesi",
      preInformation: "Ön bilgilendirme formu",
      refund: "İptal ve iade politikası",
      fieldNotice: "Bahçede bulunanlar için aydınlatma",
    },
    note: "Hukuki metinler taslaktır; yayın şartları tamamlanınca yürürlüğe girer.",
  },
  landing: {
    eyebrow: "Antep fıstığı bahçeleri için",
    title: "Bahçenize gitmeden, ağaç ağaç görün.",
    lead: "orchadOS bağımsız bir bahçe denetim hizmetidir. Kendi saha ekibimiz bahçenizi düzenli aralıklarla 360° kamera ve uydu konumlamayla tarar; bir ziraat mühendisi değerlendirir ve raporu imzalar. Siz sonucu portalda, kanıtıyla birlikte görürsünüz.",
    ctaSignup: "Kayıt olun",
    ctaHow: "Nasıl çalışır?",
    ctaLogin: "Hesabınız varsa giriş yapın",
    ctaDemo: "Demoyu dene",
    demoFoot: "Bunları örnek bir bahçede hesap açmadan görün: demoyu deneyin",
    pillarsTitle: "Neden orchadOS?",
    pillars: [
      {
        title: "Bağımsız",
        body: "Veriyi kendi eğitimli personelimiz toplar. Bahçedeki işçiler ya da bekçi veri girmez.",
      },
      {
        title: "Uzman imzalı",
        body: "Her rapor, değerlendirmeyi yapan ziraat mühendisinin imzasını taşır. Yapay zekâ yalnızca ön değerlendirme yapar.",
      },
      {
        title: "Kanıtıyla",
        body: "Her bulgudan ağaca, ağaçtan fotoğrafa, fotoğraftan çekim zamanına ve konumuna inebilirsiniz.",
      },
      {
        title: "Ağaç ağaç",
        body: "Her ağacın kalıcı bir kodu ve karnesi olur. Ziyaretler arasındaki değişimi aynı ağaç üzerinde izlersiniz.",
      },
    ],
    getTitle: "Portalda ne görürsünüz?",
    get: [
      "Parsel karnesi ve uzman özeti",
      "Ağaç ağaç sağlık haritası",
      "Street View tarzı 360° bahçe gezisi",
      "Her ağacın karnesi ve fotoğrafları",
      "PDF ziyaret raporu; rapor hazır olunca SMS ile bağlantı",
    ],
    honestTitle: "Neyi iddia etmiyoruz?",
    honest: [
      "Yapay zekâ hastalık teşhisi koymaz. Görüntüde görülen belirtileri işaretler, kararı uzman verir.",
      // Contract Md. 6/1 (docs/hukuk/kararlar.md H07, T16), word for word.
      "Haritadaki sınır, sizin ya da yetkilendirdiğiniz kişinin gösterdiği fiili kullanım sınırıdır. Tapu sınırı, kadastro ölçümü, mülkiyet ya da kullanım hakkı tespiti değildir; resmi bir sınır belirlemez. Sınır ve mülkiyet uyuşmazlıklarında kanıt olarak sunulmak üzere hazırlanmamıştır.",
      "Verim ya da gelir tahmini ve garantisi vermeyiz.",
    ],
  },
  how: {
    title: "Nasıl çalışır?",
    lead: "Kayıttan ilk rapora kadar adımlar. Kesin bilgiler ilk ziyarette sahada çıkarılır; başlangıçta kabaca bildikleriniz yeterlidir.",
    steps: [
      {
        title: "1. Kayıt",
        body: "Ad soyad, cep telefonu ve e-postanızla hesap açarsınız. Telefonunuzu SMS koduyla doğrularsınız.",
      },
      {
        title: "2. Başvuru",
        body: "Bahçelerinizi haritada işaretler, tahmini alanı ve sulama durumunu yazar, paketinizi seçersiniz. Bahçeye girilmesine izin verdiğinizi ve bahçe üzerinde yetkinizi beyan edersiniz.",
      },
      {
        title: "3. Teklif",
        body: "Operasyon ekibimiz bahçenin konumunu ve alanını doğrular, size bir teklif gönderir. Fiyat doğrulanan alana göre hesaplanır.",
      },
      {
        title: "4. Ödeme",
        body: "Teklifi onaylayınca kartla (3D Secure) ya da havale/EFT ile ödersiniz. Kart bilgileriniz bize gelmez.",
      },
      {
        title: "5. Envanter",
        body: "İlk ziyarette sınırı gösterdiğiniz kişiyle birlikte kullanım sınırı yürünür, bahçe taranır. Her ağaca kalıcı bir kod verilir.",
      },
      {
        title: "6. Periyodik ziyaretler ve raporlar",
        body: "Paketinizdeki her ziyarette bahçe yeniden taranır. Uzman değerlendirir ve imzalar; rapor hazır olunca size bağlantı gelir.",
      },
    ],
    scopeTitle: "Hizmetin kapsamında olmayanlar",
    outOfScope: [
      "Bakım, ilaçlama, budama gibi bahçe işleri",
      "Hastalık teşhisi ve laboratuvar analizi",
      "Verim ya da gelir tahmini ve garantisi",
      "Mülkiyet ve tapu sınırı tespiti",
      "Bekçilik",
    ],
  },
  packages: {
    title: "Paketler ve fiyatlar",
    lead: "Fiyat dönüm ve ziyaret başınadır. Paket, yılda kaç periyodik ziyaret yapılacağını belirler.",
    modelTitle: "Fiyat nasıl hesaplanır?",
    model: [
      "Yıllık bedel: yıllık ziyaret sayısı × doğrulanan alan (dönüm) × paketin dönüm ve ziyaret başı birim fiyatı.",
      "Her bahçe için yıllık en az ücret uygulanır.",
      "İlk yıl bahçe başına bir kez envanter ücreti eklenir.",
      "Ödeme planı: ilk yıl envanter ödemesi teklif onayından sonra tek seferde; kalan tutar paketteki ziyaret sayısı kadar eşit ziyaret ödemesiyle, her biri o ziyaretin penceresinden 14 gün önce. Kart taksiti değildir; faiz ya da ek ücret yoktur.",
      "Başvuruları bahçenin konumuna ve ekip kapasitesine göre değerlendiririz; her konuma hizmet veremeyebiliriz.",
      "Aynı köyde komşu bahçeler birlikte başvurursa teklifte indirim yapılabilir.",
      "Teklifteki fiyat, teklif geçerli olduğu sürece değişmez.",
    ],
    empty: "Fiyatlar teklif ile belirlenir",
    emptyBody:
      "Yayımlanmış bir fiyat listesi henüz yok. Başvurunuzu aldıktan sonra bahçenize göre teklif veriyoruz.",
    visitsPerYear: (n: number) => `Yılda ${n} periyodik ziyaret`,
    includesInventory: "Envanter dahil",
    perDonum: "dönüm başına, yıllık, KDV dahil",
    perVisit: (unit: string) => `Ziyaret başına, dönüm başı ${unit}`,
    minimumFee: "En az ücret (bahçe başına, yıllık)",
    inventoryFee: "Envanter ücreti (ilk yıl, bahçe başına)",
    vatNote: (rate: string) => `Fiyatlara %${rate} KDV dahildir; teklifte KDV ayrıca gösterilir.`,
    priceListNote: (version: number, validFrom: string) =>
      `Fiyat listesi sürüm ${version}, ${validFrom} tarihinden itibaren geçerli.`,
  },
  faq: {
    title: "Sık sorulan sorular",
    items: [
      {
        q: "Bahçemin sınırını bilmiyorum, sorun olur mu?",
        a: "Olmaz. Başvuruda bahçenin yerini haritada kabaca işaretlemeniz yeterli. Kesin kullanım sınırı ilk ziyarette, sizin ya da yetkilendirdiğiniz kişinin gösterdiği yerden yürünerek çıkarılır.",
      },
      {
        q: "Sınır tapudaki sınırla aynı mı?",
        a: "Hayır. Haritadaki sınır, sizin ya da yetkilendirdiğiniz kişinin gösterdiği fiili kullanım sınırıdır. Tapu sınırı, kadastro ölçümü, mülkiyet ya da kullanım hakkı tespiti değildir; resmi bir sınır belirlemez. Sınır ve mülkiyet uyuşmazlıklarında kanıt olarak sunulmak üzere hazırlanmamıştır.",
      },
      {
        q: "Hissedarlarım da raporu görebilir mi?",
        a: "Evet. Portaldan hissedarlarınızı izleyici olarak ekleyebilirsiniz; aynı raporları görürler.",
      },
      {
        q: "Yapay zekâ hastalık teşhisi koyuyor mu?",
        a: "Hayır. Yapay zekâ görüntü kalitesini denetler ve ön etiket önerir. Değerlendirmeyi ve raporu ziraat mühendisi yapar ve imzalar.",
      },
      {
        q: "Bahçeye kim gidiyor?",
        a: "Eğitimli kendi saha personelimiz. Bahçenizdeki işçiler ya da bekçi veri toplamaz; bu, raporun bağımsızlığı için önemlidir.",
      },
      {
        q: "Hava yüzünden bir ziyaret yapılamazsa ne olur?",
        a: "Ziyaret aynı mevsim penceresi içinde yeniden planlanır. Pencere içinde yapılamazsa iade koşulları İptal ve iade politikasında yazılıdır.",
      },
      {
        q: "Nasıl ödeme yapabilirim?",
        a: "Teklifi onayladıktan sonra kartla (3D Secure, tek çekim) ya da havale/EFT ile. Kart bilgileriniz ödeme kuruluşunda kalır, bize gelmez.",
      },
      {
        q: "Kişisel verilerim ne oluyor?",
        a: "Ayrıntılar KVKK aydınlatma metninde. Adınız, telefonunuz, parsel adı ve köy yapay zekâ hizmetine gönderilmez.",
      },
    ],
  },
  contact: {
    title: "İletişim",
    lead: "Sorularınız için bize yazabilir ya da arayabilirsiniz.",
    items: [
      { label: "Telefon", value: "[Telefon]" },
      { label: "E-posta", value: "[E-posta]" },
      { label: "Adres", value: "[Adres]" },
      { label: "KVKK başvuruları", value: "[kvkk@alanadi]" },
    ],
    hours: "Hafta içi [09.00–18.00]",
  },
  legal: {
    draftBanner:
      "Bu metin taslaktır ve avukat incelemesinden geçmemiştir. Yayına alınmadan önce değişebilir.",
    version: (v: string) => `Sürüm: ${v}`,
  },
  home: {
    verifyTitle: "Telefonunuzu doğrulayın",
    verifyBody: "Kaydınızı tamamlamak için cep telefonunuza gelen SMS kodunu girmeniz gerekiyor.",
    verifyLink: "Telefonu doğrula",
  },
  signup: {
    title: "Kayıt ol",
    subtitle: "Bahçeniz için hesap açın. Telefonunuzu SMS koduyla doğrulayacağız.",
    locationNote:
      "Başvurunuzu bahçenizin konumuna ve ekibimizin kapasitesine göre değerlendiririz; her konuma hizmet veremeyebiliriz. Kayıt, başvuru ve fiyat önizlemesi ücretsizdir.",
    closedTitle: "Kayıt yakında",
    closedBody:
      "Kendi hesabınızı açma özelliği yakında açılacak. Şimdilik kayıt için bizimle iletişime geçin.",
    closedContact: "İletişim bilgileri",
    haveAccount: "Hesabınız var mı?",
    login: "Giriş yapın",
    fullName: "Ad soyad",
    phone: "Cep telefonu",
    phoneHint: "Örnek: 0532 123 45 67",
    email: "E-posta",
    password: "Parola",
    passwordHint: "En az 8 karakter",
    passwordRepeat: "Parola (tekrar)",
    contactPreference: "Size nasıl ulaşalım?",
    contactPreferences: { whatsapp: "WhatsApp", sms: "SMS" },
    contactPreferenceHint: "WhatsApp seçseniz de mesajlar şimdilik SMS olarak gönderilir.",
    kvkk: {
      before: "",
      link: "KVKK aydınlatma metnini",
      after: " okudum.",
    },
    explicitIntro: "İsteğe bağlı izin (vermemeniz hizmeti almanıza engel değildir):",
    explicitLink: "Açık rıza metni",
    // The box of docs/hukuk/acik-riza-metni.md (riza-v2-taslak); shown only
    // when MARKETING_CONSENT_ENABLED.
    explicitMarketing:
      "OBA Bilişim Teknolojileri LTD.'nin orchadOS hizmetine ilişkin yenilik, kampanya ve tanıtımlarını bana kısa mesajla (SMS) göndermesine ticari elektronik ileti onayı veriyorum ve bu amaçla adımın ve telefon numaramın işlenmesine açık rıza veriyorum. Onayım İleti Yönetim Sistemi'ne (İYS) kaydedilir.",
    versions: (kvkk: string, explicit: string) => `Metin sürümleri: ${kvkk}, ${explicit}`,
    submit: "Kayıt ol ve kod gönder",
    submitting: "Gönderiliyor…",
    codeTitle: "SMS kodu",
    codeSent: (masked: string) => `${masked} numarasına 6 haneli bir kod gönderdik.`,
    codeExisting:
      "Bu numarayla hesabınız varsa giriş yapmış olursunuz; izin tercihlerinizi Hesabım › İzinler'den değiştirebilirsiniz.",
    code: "SMS kodu",
    verify: "Doğrula",
    verifying: "Doğrulanıyor…",
    resend: "Kodu yeniden gönder",
    resendIn: (seconds: number) => `Yeniden göndermek için ${seconds} sn`,
    restart: "Bilgileri değiştir",
    captchaMissing: "Robot olmadığınızı doğrulayın.",
    fieldErrors: {
      required: "Bu alan gerekli.",
      invalid: "Geçerli bir değer girin.",
      too_short: "Çok kısa.",
      too_long: "Çok uzun.",
      mismatch: "Parolalar aynı değil.",
    },
    fieldErrorOverrides: {
      phone: { invalid: "Türkiye cep telefonu girin (05xx xxx xx xx)." },
      email: { invalid: "Geçerli bir e-posta adresi girin." },
      password: { too_short: "Parola en az 8 karakter olmalı." },
      kvkk_notice: { required: "Devam etmek için aydınlatma metnini okuduğunuzu işaretleyin." },
    } as Record<string, Record<string, string>>,
    formErrors: "Formda düzeltilmesi gereken alanlar var.",
    errors: {
      invalid_input: "Bilgilerden biri geçersiz. Alanları kontrol edin.",
      captcha_failed: "Robot doğrulaması başarısız oldu. Yeniden deneyin.",
      email_taken: "Bu e-posta adresi başka bir hesapta kayıtlı. Giriş yapmayı deneyin.",
      phone_registered: "Bu numara kayıtlı. Giriş sayfasından girin; giremiyorsanız bize yazın.",
      too_many_attempts: "Çok fazla kayıt denemesi yapıldı. Bir süre sonra yeniden deneyin.",
      signup_closed: "Kayıt şu anda kapalı.",
      signup_unavailable: "Kayıt hizmetine şu anda ulaşılamıyor. Biraz sonra yeniden deneyin.",
      phone_not_verified: "Telefonunuz henüz doğrulanmadı.",
      failed: "Kayıt tamamlanamadı. Biraz sonra yeniden deneyin.",
    },
    verifyPage: {
      title: "Telefonunuzu doğrulayın",
      subtitle: "Kaydınızı tamamlamak için hesabınızdaki cep telefonuna bir SMS kodu göndereceğiz.",
      noPhone: "Hesabınızda doğrulanacak bir telefon numarası yok. Lütfen bizimle iletişime geçin.",
      sendCode: "SMS kodu gönder",
      done: "Telefonunuz zaten doğrulanmış.",
      continue: "Devam et",
    },
  },
  login: {
    noAccount: "Hesabınız yok mu?",
    signup: "Kayıt olun",
    tryDemo: "Hesap açmadan örnek bir bahçede demoyu deneyin",
  },
} as const;

export type SiteText = typeof siteText;
