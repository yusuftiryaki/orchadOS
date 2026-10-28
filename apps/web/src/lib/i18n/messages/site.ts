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
    menuClose: "Kapat",
    demo: "Demoyu dene",
  },
  footer: {
    legalLabel: "Hukuki metinler",
    siteHeading: "Hizmet",
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
    title: "Bahçenize gitmeden, ağaç ağaç görün.",
    lead: "orchadOS, Antep fıstığı bahçeleri için bağımsız bir denetim hizmetidir. Saha ekibimiz bahçenizi 360° kamerayla sıra sıra tarar; bir ziraat mühendisi her ağacı değerlendirir ve raporu imzalar. Siz sonucu telefonunuzdan, fotoğrafıyla birlikte görürsünüz.",
    ctaSignup: "Kayıt olun",
    signupNote:
      "Hesap açmak ücretsizdir. Ödemeyi, ekibimizin alanı doğruladığı teklifi onaylayınca yaparsınız.",
    ctaDemo: "Demoyu deneyin",
    demoNote: "Hesap açmadan, örnek bahçelerde sahip portalını rehberli turla gezin.",
    ctaHow: "Nasıl çalışır?",
    ctaLogin: "Hesabınız varsa giriş yapın",
    plate: {
      title: "Örnek bahçe, kış ziyareti",
      caption:
        "Her nokta bir ağaç; rengi, uzmanın o ziyarette verdiği sınıf. Satır başındaki kodlar sıraları gösterir. Bu çizim örnektir.",
      tree: "S5-12",
      treeLabel: "Seçili ağaç",
      rows: [
        ["Sınıf", "Dikkat"],
        ["Neden", "Kuru dal 2 (0–3 ölçeğinde)"],
        ["Karar", "Uzman onaylı"],
        ["Kanıt", "4 yönden fotoğraf, 1 yakın plan"],
      ],
      rowLabel: (n: number) => `S${n}`,
    },
    readTitle: "Bir ziyaretin sonunda ne bilirsiniz?",
    readLead:
      "Rapor her ağaç için aynı soruyu cevaplar: bu ağaç ne durumda? Cevap aşağıdaki sınıflardan biridir ve haritada bu renklerle görünür.",
    classesLabel: "Ağaç sınıfları",
    reportTitle: "Parsel karnesinde ayrıca",
    report: [
      "0–100 arası genel durum skoru ve geçen yılın aynı mevsimine göre değişimi",
      "Kötüleşen ve iyileşen ağaç sayısı; kaybolan ve yeni dikilen ağaçlar",
      "Sorunların bahçenin neresinde toplandığı",
      "Önem sırasıyla bulgular ve uzmanın önerileri",
      "Denetim güveni: kaç ağaca bakıldığı, kaç fotoğraf çekildiği, uzmanın imzası",
    ],
    evidenceTitle: "Her bulgunun kanıtı var",
    evidenceLead:
      "Raporda okuduğunuz her şeyin arkasına inebilirsiniz. Bir bulgudan başlayıp o fotoğrafın ne zaman ve nerede çekildiğine kadar gidersiniz.",
    evidence: [
      {
        title: "Bulgu",
        body: "Örneğin \u201cS5-12'de kuru dal\u201d. Bulgular önem sırasıyla listelenir.",
      },
      { title: "Ağaç karnesi", body: "Ağacın kalıcı kodu, sınıfı ve ziyaret ziyaret geçmişi." },
      { title: "Fotoğraf", body: "Dört yönden, aynı açıdan; ziyaretler yan yana." },
      {
        title: "Zaman ve konum",
        body: "Her fotoğrafın tarihi, saati, konumu ve değiştirilmediğinin doğrulaması.",
      },
    ],
    independence:
      "Veriyi bahçenizdeki işçiler ya da bekçi değil, kendi eğitimli personelimiz toplar. Yapay zekâ yalnızca ön değerlendirme yapar; kararı ve imzayı ziraat mühendisi verir.",
    stepsTitle: "Nasıl başlar?",
    steps: [
      {
        title: "Kayıt ve başvuru",
        body: "Hesap açın, bahçenizi haritada kabaca işaretleyin ve paketinizi seçin. Kesin sınırı ve ağaç sayısını bilmeniz gerekmez.",
      },
      {
        title: "Teklif ve ödeme",
        body: "Ekibimiz konumu ve alanı doğrular, size teklif gönderir. Onaylarsanız kartla ya da havaleyle ödersiniz.",
      },
      {
        title: "İlk ziyaret",
        body: "Sınırı gösteren kişiyle birlikte sınır yürünür ve bahçe taranır. Her ağaca kalıcı bir kod verilir.",
      },
      {
        title: "Periyodik ziyaretler",
        body: "Her ziyarette bahçe yeniden taranır. Rapor hazır olunca size SMS ile bağlantı gelir.",
      },
    ],
    stepsMore: "Adımların ayrıntısı",
    calendarTitle: "Yılda kaç ziyaret?",
    calendarLead:
      "Paketler ziyaret sayısıyla ayrılır. Ziyaretler fıstığın yılına göre planlanır: budama, uyanma, meyve tutumu, hasat.",
    calendarLabel: "Paketlerin ziyaret takvimi",
    visitsPerYear: (n: number) => `Yılda ${n} ziyaret`,
    perDonum: (price: string) => `Dönüm başına yıllık ${price}, KDV dahil`,
    calendarNote:
      "İlk yıl bahçe başına bir kez envanter ücreti eklenir. Küçük bahçelerde en az ücret uygulanır.",
    calendarMore: "Fiyatlar ve örnek hesap",
    months: ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"],
    honestTitle: "Neyi iddia etmiyoruz?",
    honest: [
      "Yapay zekâ hastalık teşhisi koymaz. Görüntüde görülen belirtileri işaretler, kararı uzman verir.",
      // Contract Md. 6/1 (docs/hukuk/kararlar.md H07, T16), word for word.
      "Haritadaki sınır, sizin ya da yetkilendirdiğiniz kişinin gösterdiği fiili kullanım sınırıdır. Tapu sınırı, kadastro ölçümü, mülkiyet ya da kullanım hakkı tespiti değildir; resmi bir sınır belirlemez. Sınır ve mülkiyet uyuşmazlıklarında kanıt olarak sunulmak üzere hazırlanmamıştır.",
      "Verim ya da gelir tahmini ve garantisi vermeyiz.",
    ],
    closingTitle: "Önce bir örnek bahçeyi gezin",
    closingBody:
      "Demoda karneyi, sağlık haritasını, 360° gezintiyi ve ağaç karnesini sahibin gördüğü gibi görürsünüz. Hesap açmanız gerekmez.",
    demoFoot: "Demoyu deneyin",
  },
  how: {
    title: "Nasıl çalışır?",
    lead: "Kayıttan ilk rapora kadar adımlar. Kesin bilgiler ilk ziyarette sahada çıkarılır; başlangıçta kabaca bildikleriniz yeterlidir.",
    steps: [
      {
        title: "Kayıt",
        body: "Ad soyad, cep telefonu ve e-postanızla hesap açarsınız. Telefonunuzu SMS koduyla doğrularsınız.",
      },
      {
        title: "Başvuru",
        body: "Bahçelerinizi haritada işaretler, tahmini alanı ve sulama durumunu yazar, paketinizi seçersiniz. Bahçeye girilmesine izin verdiğinizi ve bahçe üzerinde yetkinizi beyan edersiniz.",
      },
      {
        title: "Teklif",
        body: "Operasyon ekibimiz bahçenin konumunu ve alanını doğrular, size bir teklif gönderir. Fiyat doğrulanan alana göre hesaplanır.",
      },
      {
        title: "Ödeme",
        body: "Teklifi onaylayınca kartla (3D Secure) ya da havale/EFT ile ödersiniz. Kart bilgileriniz bize gelmez.",
      },
      {
        title: "Envanter",
        body: "İlk ziyarette sınırı gösterdiğiniz kişiyle birlikte kullanım sınırı yürünür, bahçe taranır. Her ağaca kalıcı bir kod verilir.",
      },
      {
        title: "Periyodik ziyaretler ve raporlar",
        body: "Paketinizdeki her ziyarette bahçe yeniden taranır. Uzman değerlendirir ve imzalar; rapor hazır olunca size bağlantı gelir.",
      },
    ],
    stepsTitle: "Kayıttan ilk rapora",
    scopeTitle: "Hizmetin kapsamında olmayanlar",
    closingTitle: "Bahçeniz için başvurun",
    closingBody:
      "Hesap açmak ücretsizdir. Ödemeyi, ekibimiz alanı doğrulayıp teklif gönderdikten sonra, teklifi onaylarsanız yaparsınız.",
    ctaSignup: "Kayıt olun",
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
    visitsLabel: "Ziyaretler",
    exampleTitle: (area: string) => `Örnek: ${area}`,
    ctaTitle: "Paketinizi başvuruda seçersiniz",
    ctaBody:
      "Kayıt olduktan sonra bahçenizi haritada işaretler ve paketi seçersiniz. Kesin fiyat, ekibimiz alanı doğruladıktan sonra teklifte yazar.",
    ctaSignup: "Kayıt olun",
    ctaDemo: "Demoyu deneyin",
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
    lead: "Sınır, rapor, ödeme ve kişisel veriler hakkında en çok sorulanlar.",
    moreTitle: "Sorunuzun cevabı burada yok mu?",
    moreBody: "Bize telefonla ya da e-postayla ulaşın.",
    moreLink: "İletişim bilgileri",
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
    lead: "Sorularınız için bizi arayabilir ya da e-posta gönderebilirsiniz.",
    phone: "Telefon",
    email: "E-posta",
    kvkk: "Kişisel veri başvuruları",
    kep: "KEP adresi",
    address: "Adres",
    company: "Şirket",
    // Until the company information is complete (T21; public_company_info).
    pendingTitle: "İletişim bilgilerimiz yakında burada",
    pendingBody:
      "Şirket bilgilerimiz yayımlanınca telefon, e-posta ve adresimiz bu sayfada yer alacak.",
    faqLink: "Sık sorulan sorulara bakın",
  },
  legal: {
    draftBanner:
      "Bu metin taslaktır ve avukat incelemesinden geçmemiştir. Yayına alınmadan önce değişebilir.",
    version: (v: string) => `Sürüm: ${v}`,
    contents: "Bu sayfada",
    toTop: "Başa dön",
  },
  home: {
    verifyTitle: "Telefonunuzu doğrulayın",
    verifyBody: "Kaydınızı tamamlamak için cep telefonunuza gelen SMS kodunu girmeniz gerekiyor.",
    verifyLink: "Telefonu doğrula",
  },
  signup: {
    title: "Kayıt ol",
    subtitle:
      "Hesap açmak ücretsizdir. Bilgilerinizi girin; telefonunuza bir doğrulama kodu göndereceğiz.",
    stepForm: "Adım 1 / 2: Bilgileriniz",
    stepCode: "Adım 2 / 2: Telefon doğrulaması",
    asideTitle: "Kayıttan sonra",
    asideSteps: [
      {
        title: "Başvuru",
        body: "Bahçenizi haritada kabaca işaretler, paketinizi seçersiniz.",
      },
      {
        title: "Teklif",
        body: "Ekibimiz konumu ve alanı doğrular, size teklif gönderir.",
      },
      {
        title: "Ödeme ve ilk ziyaret",
        body: "Teklifi onaylayınca ödersiniz. İlk ziyarette bahçeniz taranır.",
      },
    ],
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
    phoneHint: "05xx xxx xx xx biçiminde. Doğrulama kodu bu numaraya gelir.",
    email: "E-posta",
    emailHint: "Giriş yaparken bu adresi kullanırsınız.",
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
    submit: "Kayıt ol ve kod gönder",
    submitting: "Gönderiliyor…",
    codeTitle: "SMS kodunu girin",
    codeSent: (masked: string) => `${masked} numarasına 6 haneli bir kod gönderdik.`,
    // The /kayit code step: the same text whether the number is new, has an
    // account or cannot get a code at all (docs/hukuk/kararlar.md H33).
    codeRequested: (masked: string) =>
      `${masked} numarasına SMS ile 6 haneli bir kod gönderiyoruz. Kod birkaç dakika geçerli.`,
    codeMissing:
      "Kod gelmezse bu numarayla zaten bir hesabınız olabilir; e-posta adresiniz ve parolanızla giriş yapın.",
    codeMissingLogin: "E-posta ile giriş yap",
    registerAgain: "Kod adımının süresi doldu. Bilgilerinizi girip yeniden kayıt olun.",
    codeExisting:
      "Bu numarayla hesabınız varsa giriş yapmış olursunuz; izin tercihlerinizi Hesabım › İzinler'den değiştirebilirsiniz.",
    code: "SMS kodu",
    verify: "Doğrula",
    verifying: "Doğrulanıyor…",
    resend: "Kodu yeniden gönder",
    resendIn: (seconds: number) => `Yeniden göndermek için ${seconds} sn`,
    restart: "Bilgileri değiştir",
    captchaMissing: "Robot olmadığınızı doğrulayın.",
    notCompletedLogin: "Telefonla giriş yap",
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
      // docs/hukuk/kararlar.md H33: never says which detail is registered.
      not_completed:
        "Kayıt tamamlanamadı; bu bilgilerle hesabınız varsa telefonunuzla giriş yapın.",
      too_many_attempts: "Çok fazla kayıt denemesi yapıldı. Bir süre sonra yeniden deneyin.",
      signup_closed: "Kayıt şu anda kapalı.",
      signup_unavailable: "Kayıt hizmetine şu anda ulaşılamıyor. Biraz sonra yeniden deneyin.",
      phone_not_verified: "Telefonunuz henüz doğrulanmadı.",
      // Never "register again": a registrant whose phone is already confirmed
      // would loop. They finish with their e-mail and password (/kayit/dogrula).
      signup_mismatch:
        "Kayıt tamamlanamadı; güvenliğiniz için oturum açılmadı. Bu numarayla kaydı siz başlattıysanız kayıtta kullandığınız e-posta ve parolayla giriş yapın; telefon doğrulamasını oradan tamamlarsınız.",
      password_required:
        "Telefon doğrulamasını yalnızca e-posta ve parolanızla açtığınız oturumda tamamlayabilirsiniz. Çıkış yapıp e-posta ve parolanızla giriş yapın.",
      failed: "Kayıt tamamlanamadı. Biraz sonra yeniden deneyin.",
    },
    verifyPage: {
      title: "Telefonunuzu doğrulayın",
      subtitle: "Kaydınızı tamamlamak için hesabınızdaki cep telefonuna bir SMS kodu göndereceğiz.",
      noPhone: "Hesabınızda doğrulanacak bir telefon numarası yok. Lütfen bizimle iletişime geçin.",
      sendCode: "SMS kodu gönder",
      done: "Telefonunuz zaten doğrulanmış.",
      continue: "Hesabıma git",
    },
  },
  // Self-hosted robot check (docs/hukuk/kararlar.md H03, T12).
  captcha: {
    solving: "Robot doğrulaması yapılıyor…",
    done: "Robot doğrulaması tamam.",
    failed: "Robot doğrulaması başlatılamadı.",
    retry: "Yeniden dene",
  },
  login: {
    // /giris?kayit=yarim: a sign-up completion was refused and the session
    // closed (customer-signup signup_mismatch).
    signupUnfinished:
      "Kaydınız tamamlanamadı ve güvenliğiniz için oturumunuz kapatıldı. Bu numarayla kaydı siz başlattıysanız kayıtta kullandığınız e-posta ve parolayla giriş yapın; telefonunuzu oradan doğrularsınız. Giriş yapamıyorsanız yeniden kayıt olabilirsiniz.",
    asideLabel: "Hesabı olmayanlar için",
    noAccount: "Hesabınız yok mu?",
    signupBody:
      "Kayıt ücretsizdir. Hesap açtıktan sonra bahçenizi haritada işaretleyip başvurursunuz; ödemeyi teklifi onaylayınca yaparsınız.",
    signup: "Kayıt olun",
    demoBefore: "Önce görmek ister misiniz?",
    tryDemo: "Örnek bir bahçede demoyu deneyin",
  },
} as const;

export type SiteText = typeof siteText;
