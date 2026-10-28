import { demoText } from "./demo";
import type { PortalError, PortalNotice } from "@/lib/portal-billing/urls";
import type { PortalFieldError } from "@/lib/portal-billing/validation";
import { billingText } from "./billing";

// Turkish texts of the customer portal's application, quote, order, payment
// and account screens (IP12-D, docs/musteri-yonetimi.md §10). Enum labels and
// the reason codes of the billing functions come from billingText.

const notices: Record<PortalNotice, string> = {
  taslak_acildi: "Başvuru taslağınız açıldı. Şimdi bahçelerinizi ekleyin.",
  paket_kaydedildi: "Paket seçiminiz kaydedildi.",
  bahce_kaydedildi: "Bahçe kaydedildi.",
  bahce_silindi: "Bahçe başvurudan çıkarıldı.",
  basvuru_gonderildi:
    "Başvurunuz gönderildi. Ekibimiz bahçelerinizi inceleyip size teklif gönderecek.",
  basvuru_geri_cekildi: "Başvurunuz geri çekildi.",
  teklif_kabul_edildi: "Teklifi kabul ettiniz; siparişiniz açıldı.",
  teklif_reddedildi: "Teklifi reddettiniz.",
  revize_istendi: "Revize isteğiniz iletildi; ekibimiz yeni bir teklif hazırlayacak.",
  aydinlatma_kaydedildi: "Aydınlatma metnini okuduğunuz kaydedildi.",
  siparis_iptal_edildi: "Sipariş iptal edildi.",
  fatura_kaydedildi: "Fatura bilgileriniz kaydedildi.",
  iletisim_kaydedildi: "İletişim bilgileriniz kaydedildi.",
  izin_kaydedildi: "İzin tercihiniz kaydedildi.",
  hesap_vardi:
    "Bu bilgilerle zaten bir hesabınız vardı; oturumunuz o hesapla açıldı. İzinlerinizi buradan gözden geçirebilirsiniz.",
  cikarma_istendi:
    "Çıkarma talebiniz alındı. Bahçe çıkış tarihinde kendiliğinden hizmetten çıkar; o güne kadar talebi geri alabilirsiniz.",
  cikarma_geri_alindi: "Çıkarma talebiniz geri alındı; bahçeniz hizmette kalıyor.",
  bahce_basvurudan_cikarildi: "Bahçe başvurudan çıkarıldı.",
  siparis_duzeltmeye_acildi:
    "Sipariş iptal edildi ve başvurunuz düzeltmeye açıldı. Bahçe listesini değiştirin; ekibimiz yeni bir teklif hazırlayacak.",
};

const errors: Record<PortalError, string> = {
  ...billingText.errors,
  demo_read_only: demoText.closed.billing,
  payments_disabled: "Kartla ödeme şu anda kullanılamıyor. Havale ile ödeyebilirsiniz.",
  provider_error: "Ödeme sayfası açılamadı; lütfen biraz sonra yeniden deneyin.",
  odeme_bulunamadi:
    "Ödeme kaydı bulunamadı. Kartınızdan çekim yapıldıysa birkaç dakika içinde burada görünür; görünmezse bizimle iletişime geçin.",
  onay_eksik: "Devam etmek için iki onay kutusunu da işaretleyin.",
  consent_unavailable: "Bu izin şu anda verilemiyor. Daha önce verdiyseniz geri alabilirsiniz.",
  fatura_eposta_eksik:
    "Kartla ödeme için bir e-posta adresi gerekli. Fatura bilgilerinize e-posta adresinizi ekleyin ya da havale ile ödeyin.",
};

const fieldErrors: Record<PortalFieldError, string> = {
  required: "Bu alan gerekli.",
  invalid: "Geçerli bir değer girin.",
  too_long: "Bu alan çok uzun.",
  too_small: "Değer çok küçük.",
  too_large: "Değer çok büyük.",
  too_few: "Sınır için en az üç nokta işaretleyin.",
  too_many: "Sınırda çok fazla nokta var.",
  self_intersecting: "Sınırın kenarları kesişmemeli.",
};

// The 20-dönüm example on /paketler (the public site's own texts are in
// siteText.packages).
export const packageExampleText = {
  areaM2: 20_000,
  title: "Örnek: 20 dönüm, ilk yıl",
  body: (subtotal: string, vat: string, total: string) =>
    `${subtotal} + KDV ${vat} = ${total}. Kesin tutar, alan doğrulandıktan sonra teklifte yer alır.`,
} as const;

export const portalBillingText = {
  nav: {
    label: "Hesap",
    gardens: "Bahçelerim",
    applications: "Başvurularım",
    orders: "Siparişlerim",
    payments: "Ödemelerim",
    account: "Hesabım",
  },
  notices,
  errors,
  fieldErrors,
  formError: "Formda düzeltilmesi gereken alanlar var.",
  fieldErrorOverrides: {
    area_donum: {
      too_small: "Alan en az 0,5 dönüm olmalı.",
      too_large: "Alan en fazla 10.000 dönüm olabilir.",
    },
    position: {
      required: "Haritada bahçenin yerini işaretleyin.",
      invalid: "Haritada bahçenin yerini yeniden işaretleyin.",
    },
    entry_permission: {
      required: "Ekibimizin bahçeye girebilmesi için izin vermelisiniz.",
    },
    identity_number: {
      invalid: "T.C. kimlik numarası geçersiz.",
    },
    site_contact_phone: {
      invalid: "Telefonu 05xx xxx xx xx biçiminde girin.",
    },
  } as Partial<Record<string, Partial<Record<PortalFieldError, string>>>>,
  // Field names of the database's invalid_input detail → form fields.
  dbFields: {
    declared_area_m2: "area_donum",
    position: "position",
    name: "name",
    boundary: "boundary",
    entry_permission: "entry_permission",
    site_contact_phone: "site_contact_phone",
    estimated_tree_count: "estimated_tree_count",
  } as Record<string, string>,
  save: "Kaydet",
  saving: "Kaydediliyor…",
  cancel: "Vazgeç",
  back: "Geri",
  optional: "isteğe bağlı",
  yes: "Evet",
  no: "Hayır",
  unknown: "Bilinmiyor",
  choose: "Seçin",
  none: "—",
  donum: (text: string) => `${text} dönüm`,

  // IP14 (docs/bahce-yonetimi.md §11). Dates are never followed by a case
  // suffix: the wording puts them after a colon.
  membership: {
    title: "Üyeliğiniz",
    package: "Paket",
    serviceEnd: (date: string) => `Hizmet bitişi: ${date}`,
    gardenCount: (n: number) => `${n} bahçe hizmette`,
    nextPeriod: (date: string) => `Üyeliğiniz yenilendi · sonraki dönemin bitişi: ${date}`,
    renewalReady: "Yenileme teklifiniz hazır",
    renewalOpen: "Teklifi inceleyin",
    multiPeriod:
      "Birden fazla hizmet döneminiz var; yenileme zamanı geldiğinde ekibimiz bahçelerinizi tek döneme toplamayı önerecek.",
    endedTitle: "Üyeliğiniz sona erdi",
    endedBody:
      "Bahçelerinizin hizmeti sona erdi; raporlarınız silinmedi. Yeniden hizmet almak için başvuru yapabilirsiniz.",
    addTitle: "Bahçe ekle",
    addBody:
      "Üyeliğinize yeni bir bahçe ekleyin. Fiyat döneminizin kalan kısmına göre hesaplanır; yeni bahçenin hizmeti üyeliğinizle aynı gün biter.",
    addButton: "Bahçe ekle",
    band: (pkg: string, end: string) =>
      `Ek bahçeleriniz ${pkg} paketiyle hizmet alır · Hizmet bitişi: ${end} · fiyat kalan döneme göre hesaplanır`,
    accountGardens: "Hesabınızdaki bahçeler",
    accountGardensEmpty: "Hesabınızda henüz bahçe yok.",
    packageLocked: "Ek bahçeler üyeliğinizin paketiyle hizmet alır.",
    packageUnavailable: "Ek bahçe için ekibimizle iletişime geçin.",
    periodTooShort:
      "Döneminizin bitmesine az kaldı; ek bahçeniz yenilemeyle başlayan yeni döneme eklenir.",
    addonPreview: (start: string, end: string, visits: number, perYear: number) =>
      `Hizmet dönemi: ${start} – ${end} · ziyaret hakkı ${visits}/${perYear}`,
  },

  gardens: {
    title: "Bahçelerim",
    lead: "Hizmet alan bahçeleriniz ve durumları.",
    empty: "Hizmette bahçeniz yok.",
    add: "Bahçe ekle",
    remove: "Hizmetten çıkar",
    open: "Bahçeyi aç",
    inService: "Hizmette",
    serviceEnd: (date: string) => `Hizmet bitişi: ${date}`,
    leaving: (date: string) => `Çıkış tarihi: ${date}`,
    removed: (date: string) => `Hizmet dışı · raporlar şu tarihe kadar açık: ${date}`,
    upcoming: (date: string) => `Sonraki dönemde başlıyor: ${date}`,
    pilotTitle: "Siparişsiz bahçeler",
    pilotContact: "Bu bahçeyi çıkarmak için bize ulaşın",
    outOfServiceTitle: "Hizmette olmayan bahçeler",
    outOfService: "Hizmette değil",
  },

  removal: {
    title: "Hizmet",
    period: (start: string, end: string) => `Hizmet dönemi: ${start} – ${end}`,
    visits: (used: number, entitled: number) => `Yapılan ziyaret: ${used}/${entitled}`,
    withdrawalUntil: (date: string) => `Cayma hakkının son günü: ${date}`,
    formTitle: "Bahçeyi hizmetten çıkar",
    formLead:
      "Bahçe çıkış tarihinde hizmetten çıkar ve planlı ziyaretleri iptal edilir. Raporlarınız silinmez; bir süre salt okunur açık kalır.",
    reason: "Neden",
    note: "Notunuz",
    noteHint: "Ekibimizin bilmesini istedikleriniz (en fazla 1000 karakter).",
    timing: "Ne zaman",
    timings: {
      // The days to the effective day (removal_notice_days, 30 by default).
      notice: (days: number) => (days <= 0 ? "Bugün" : `${days} gün sonra`),
      beforeStart: "Hizmet başlamadan",
      period_end: "Dönem sonunda",
      withdrawal:
        "Cayma hakkımı kullanıyorum: bahçe bugün hizmetten çıkar, ödediğiniz tutar iade edilir (hizmete erken başlanmasını talep ettiyseniz yapılmış envanter ve ziyaretler hariç)",
    },
    effectiveOn: (date: string) => `Çıkış tarihi: ${date}`,
    refund: (amount: string) => `Tahmini iade: en fazla ${amount}`,
    accessUntil: (date: string) => `Raporlar şu tarihe kadar açık: ${date}`,
    refundNote:
      "Tahmini iade bağlayıcı değildir; kesin tutar çıkış tarihinde hesaplanır ve ekibimiz işledikten sonra ödenir.",
    confirm:
      "Bahçenin seçtiğim tarihte hizmetten çıkacağını ve planlı ziyaretlerinin iptal edileceğini anladım.",
    submit: "Bahçeyi hizmetten çıkar (raporlarınız silinmez)",
    openTitle: (number: string) => `Çıkarma talebiniz: ${number}`,
    openTitleOps: (number: string) => `Bahçenin hizmetten çıkarılması: ${number}`,
    status: "Durum",
    cancel: "Talebi geri al",
    cancelHint: "Talebi çıkış tarihine kadar geri alabilirsiniz; bahçeniz hizmette kalır.",
    byOps: "Bu çıkarmayı ekibimiz başlattı; değişiklik için bize ulaşın.",
    closed: "Bahçe çıkarmak için bize ulaşın.",
    // T03 (docs/hukuk/kararlar.md H10, H11 (c)).
    withdrawalFormTitle: "Cayma hakkını kullan",
    notWithdrawal: "Bu seçim cayma bildirimi değildir; cayma hakkınız sürüyor.",
    withdrawalReceived: (number: string, date: string) =>
      `Cayma bildiriminiz ${date ? `${date} tarihinde ` : ""}alındı (${number}). Teyit SMS ile de gönderildi.`,
    pending:
      "Bu bahçe ödeme bekleyen bir siparişte. Çıkarmak için önce o siparişi iptal edin ya da bahçe listesini değiştirin.",
    pendingLink: "Siparişe gidin",
    removed: (number: string) => `Bahçe hizmetten çıkarıldı (${number}).`,
    removedBand: (date: string) =>
      `Bu bahçe hizmetten çıkarıldı. Raporlar şu tarihe kadar açık: ${date}`,
    readOnlyQuestions: "Bu bahçe hizmetten çıkarıldı; raporları okuyabilirsiniz, soru sorulamaz.",
    readOnlyViewers: "Bu bahçe hizmetten çıkarıldı; yeni hissedar davet edilemez.",
    fieldErrors: {
      reason: "Bir neden seçin.",
      timing: "Bir çıkış zamanı seçin.",
      confirm: "Devam etmek için onay kutusunu işaretleyin.",
      note: "Not en fazla 1000 karakter olabilir.",
    } as Record<string, string>,
  },

  home: {
    title: "Hesabınız",
    ctaTitle: "Bahçenizi kaydedin",
    ctaBody:
      "Bahçelerinizi haritada işaretleyin, paketinizi seçin; ekibimiz inceleyip size bağlayıcı bir teklif göndersin.",
    ctaButton: "Başvuru yapın",
    draftTitle: "Taslak başvurunuz",
    draftBody: "Başvurunuzu tamamlayıp gönderin.",
    draftButton: "Taslağa devam edin",
    reviewTitle: "İncelemedeki başvuru",
    reviewBody: (n: string) => `${n} numaralı başvurunuz ekibimizde inceleniyor.`,
    quoteTitle: "Açık teklif",
    quoteBody: (n: string, total: string, until: string) =>
      `${n} numaralı teklif: ${total}. Son geçerlilik ${until}.`,
    quoteButton: "Teklifi inceleyin",
    orderTitle: "Ödeme bekleyen sipariş",
    orderBody: (n: string, amount: string) => `${n} numaralı sipariş: ${amount} ödenecek.`,
    orderButton: "Ödemeye geçin",
  },

  applications: {
    title: "Başvurularım",
    empty: "Henüz başvurunuz yok.",
    new: "Yeni başvuru",
    number: "Numara",
    status: "Durum",
    created: "Oluşturulma",
    gardens: "Bahçe",
    open: "Aç",
    draftNumber: "Taslak",
  },

  newApplication: {
    title: "Yeni başvuru",
    lead: "Önce bir paket seçin; bahçelerinizi sonraki adımda eklersiniz. Paketi gönderene kadar değiştirebilirsiniz.",
    package: "Paket",
    visits: (n: number) => `Yılda ${n} ziyaret`,
    inventory: "İlk yıl ağaç envanteri dahil",
    unitPrice: (amount: string) => `${amount} / dönüm / ziyaret (KDV hariç)`,
    minimum: (amount: string) => `En az ${amount} (bahçe başına, yıllık)`,
    submit: "Taslağı aç",
    noPackages: "Şu anda yayımlanmış bir fiyat listesi yok; başvuru açılamıyor.",
    existingDraft: "Açık bir taslağınız var; yeni başvuru yerine o açılacak.",
    memberLead:
      "Yeni bahçeniz üyeliğinize eklenir. Bahçelerinizi sonraki adımda eklersiniz; ekibimiz inceleyip size ek bahçe teklifi gönderir.",
    memberSubmit: "Devam edin",
  },

  application: {
    title: (number: string | null) => (number ? `Başvuru ${number}` : "Başvuru taslağı"),
    status: "Durum",
    package: "Paket",
    changePackage: "Paketi değiştir",
    customerNote: "Ekibimize notunuz",
    customerNoteHint: "Ziyaret zamanı, erişim gibi eklemek istedikleriniz.",
    gardens: "Bahçeler",
    noGardens: "Henüz bahçe eklemediniz.",
    addGarden: "+ Bahçe ekle",
    edit: "Düzenle",
    remove: "Çıkar",
    area: "Beyan edilen alan",
    verifiedArea: "Doğrulanan alan",
    location: "Yer",
    boundaryDrawn: "Sınır çizildi",
    noBoundary: "Sınır yok",
    preview: "Fiyat önizlemesi",
    previewNote:
      "Önizleme beyan ettiğiniz alanlarla hesaplanır ve bağlayıcı değildir. Ekibimiz alanları doğruladıktan sonra kesin teklif gönderir.",
    previewNone: "Önizleme için paket ve en az bir bahçe gerekli.",
    line: (n: number) => `Bahçe ${n}`,
    subtotal: "Ara toplam (KDV hariç)",
    vat: (rate: string) => `KDV (%${rate})`,
    total: "Toplam",
    submit: "Başvuruyu gönder",
    submitHint: "Gönderdikten sonra bahçeleri değiştiremezsiniz.",
    withdraw: "Başvuruyu geri çek",
    withdrawConfirm: "Başvuru geri çekilir; açık teklif varsa iptal olur.",
    rejected: (reason: string) => `Başvurunuz sonuçlandırıldı: ${reason}.`,
    timeline: "Geçmiş",
    events: {
      created: "Taslak açıldı",
      submitted: "Gönderildi",
      quoteIssued: (n: string) => `Teklif verildi (${n})`,
      quoteDecided: (n: string, status: string) => `Teklif ${n}: ${status}`,
      decided: (status: string) => `Başvuru: ${status}`,
    },
    quotes: "Teklifler",
    openQuote: "Teklifi aç",
    incomplete: (field: string) => `Başvuruda eksik bilgi var: ${field}.`,
    withdrawGarden: "Başvurudan çıkar",
    withdrawGardenConfirm: "Bu bahçeyi başvurudan çıkar",
    withdrawGardenHint: "Açık teklif varsa iptal olur; ekibimiz yeni teklif hazırlar.",
    withdrawn: "Başvurudan çıkarıldı",
    incompleteFields: {
      package_id: "paket seçilmedi",
      gardens: "bahçe eklenmedi",
      authorization_basis: "bir bahçede yetki dayanağı seçilmedi",
    } as Record<string, string>,
  },

  garden: {
    newTitle: "Bahçe ekle",
    editTitle: (name: string) => `Bahçe: ${name}`,
    general: "Bahçe bilgileri",
    name: "Bahçe adı",
    nameHint: "Kendi bildiğiniz ad, ör. “Kuzey bahçe”.",
    province: "İl",
    district: "İlçe",
    village: "Köy / mahalle",
    areaDonum: "Alan (dönüm)",
    areaHint: "Tapudaki ya da bildiğiniz alan; 1 dönüm = 1.000 m². Ondalık için virgül: 12,5",
    irrigation: "Sulama",
    irrigationValues: { irrigated: "Sulu", rainfed: "Kuru (yağışa bağlı)", unknown: "Bilmiyorum" },
    trees: "Tahmini ağaç sayısı",
    mapSection: "Haritada yer",
    mapLead:
      "Önce “Yer” ile bahçenin içine bir kez tıklayın (zorunlu). İsterseniz “Sınır” ile köşeleri sırayla işaretleyin; kaba bir çizim yeterli.",
    modePosition: "Yer",
    modeBoundary: "Sınır",
    undo: "Son noktayı sil",
    clear: "Sınırı temizle",
    points: (n: number) => `${n} nokta`,
    positionSet: "Yer işaretlendi.",
    positionMissing: "Yer henüz işaretlenmedi.",
    boundaryArea: (m2: string, donum: string) => `Çizilen alan yaklaşık ${m2} m² (${donum} dönüm).`,
    // Contract Md. 6/1, short form (T16).
    boundaryCaption: "Fiili kullanım sınırı; tapu ya da kadastro sınırı değildir.",
    legal: "Yetki ve tapu",
    authorizationBasis: "Bahçe üzerindeki yetkiniz",
    authorizationValues: {
      title_holder:
        "Tapu sahibiyim ya da hisseli tapuda paydaşım (kullandığım bölüm; rızai taksim dahil)",
      power_of_attorney: "Malikin ya da paydaşların izniyle kullanıyorum (vekil, kiracı, ortakçı)",
      heir_declaration: "Mirasçıyım (paylaşılmamış miras)",
    },
    deedBlock: "Ada",
    deedParcel: "Parsel",
    deedHint: "Tapu bilgisi isteğe bağlıdır; doğrulamayı hızlandırır.",
    sharedDeed: "Hisseli tapu mu?",
    usedPortion: "Kullandığınız bölüm",
    access: "Erişim",
    entryPermission:
      "Bu bahçeyi seçtiğim dayanakla fiilen kullanıyorum. Ekibinizin envanter ve ziyaretler için bahçeye girmesine izin veriyorum ve buna yetkiliyim.",
    accessNote: "Erişim notu",
    accessNoteHint: "Yol tarifi, kapı, anahtar gibi bilgiler. Gerekmedikçe kişi bilgisi yazmayın.",
    siteContactName: "Bahçedeki kişi",
    siteContactPhone: "Bahçedeki kişinin telefonu",
    privacy: "Tapu, erişim ve bahçedeki kişi bilgileri yalnızca operasyon ekibimizce görülür.",
    submit: "Bahçeyi kaydet",
  },

  quote: {
    title: (number: string) => `Teklif ${number}`,
    status: "Durum",
    package: "Paket",
    visits: (n: number) => `Yılda ${n} ziyaret`,
    firstYear: "İlk yıl (envanter dahil)",
    renewal: "Yenileme",
    validUntil: "Son geçerlilik",
    serviceStart: "Önerilen hizmet başlangıcı",
    lines: "Kalemler",
    garden: "Bahçe",
    area: "Alan",
    visitsCol: "Ziyaret",
    unitPrice: "Birim fiyat",
    lineTotal: "Tutar (KDV hariç)",
    inventoryFee: "Envanter ücreti",
    minimumApplied: "en az ücret uygulandı",
    base: "Toplam (indirim öncesi)",
    discount: (pct: string) => `İndirim (%${pct})`,
    discountNote: "İndirim açıklaması",
    subtotal: "Ara toplam (KDV hariç)",
    vat: (rate: string) => `KDV (%${rate})`,
    total: "Genel toplam",
    note: "Ekibimizin notu",
    billingTitle: "Fatura bilgileri",
    billingComplete: "Fatura bilgileriniz tamam.",
    billingIncomplete: "Teklifi kabul etmeden önce fatura bilgilerinizi tamamlayın.",
    billingEdit: "Fatura bilgilerini düzenle",
    billingFill: "Fatura bilgilerini girin",
    kvkkTitle: "Aydınlatma metni",
    kvkkBody:
      "Kişisel verilerinizin nasıl işlendiğini anlatan aydınlatma metnini okuduğunuza dair bir kaydımız yok. Teklifi kabul etmeden önce metni okuyup kaydedin.",
    kvkkLink: "Aydınlatma metnini okuyun",
    kvkkCheck: "KVKK aydınlatma metnini okudum.",
    kvkkSubmit: "Kaydet",
    kvkkOtherOrg:
      "Bu teklif için aydınlatma metnini okuduğunuza dair kayıt yok ve buradan kaydedilemiyor. Lütfen bizimle iletişime geçin.",
    acceptTitle: "Kabul",
    preInformation: "Ön Bilgilendirme Formu",
    distanceSales: "Mesafeli Hizmet Sözleşmesi",
    preInformationCheck: "Ön Bilgilendirme Formu'nu okudum ve onaylıyorum.",
    distanceSalesCheck: "Mesafeli Hizmet Sözleşmesi'ni okudum ve kabul ediyorum.",
    version: (v: string) => `sürüm ${v}`,
    accept: "Teklifi kabul et (ödeme yükümlülüğü doğar)",
    acceptHint:
      "Kabulle sözleşme kurulur ve ödeme adımına geçersiniz. Ödeme süresi içinde ödemezseniz siparişi iptal edebilir ya da ödeme sürenizi uzatabiliriz; sizden bir bedel istenmez.",
    declineTitle: "Değişiklik ya da ret",
    revisionNote: "Ne değişsin?",
    revisionHint: "Ör. bir bahçenin alanı, paket ya da başlangıç tarihi.",
    requestRevision: "Revize iste",
    decline: "Teklifi reddet",
    declineHint: "Reddedilen teklif kapanır; başvurunuz da geri çekilir.",
    closed: (status: string) => `Bu teklif kapandı: ${status}.`,
    order: "Siparişe git",
    serviceEnd: "Hizmet bitişi",
    serviceEndOnPayment: "ödeme gününden itibaren bir yıl",
    servicePeriod: "Hizmet dönemi",
    addonHeader: (end: string) => `Mevcut üyeliğinize ek bahçe teklifi · hizmet bitişi: ${end}`,
    addonVisits: (visits: number, perYear: number) => `${visits}/${perYear}`,
    addonVisitsHint:
      "Ziyaret hakkı, üyeliğinizin kalan süresine göre yıllık ziyaret sayısından orantılanır.",
    inventoryIncluded: "envanter dahil",
    // T21: the production gate (legal_gate_status) and the KVKK notice that
    // must be a registered final version.
    gateTitle: "Teklif şu anda onaylanamıyor",
    gateReason: {
      distance_sales_draft: "Mesafeli Hizmet Sözleşmesi henüz son hâlinde değil.",
      pre_information_draft: "Ön Bilgilendirme Formu henüz son hâlinde değil.",
      kvkk_notice_not_final:
        "Aydınlatma metninin güncel sürümünü okuduğunuza dair kaydınız yok. Aşağıdan metni okuyup kaydedin.",
      company_info_incomplete: "Şirket bilgileri henüz tamamlanmadı.",
    },
    gateHint: "Lütfen daha sonra yeniden deneyin; teklifiniz geçerlilik süresi boyunca açık kalır.",
    kvkkCurrentBody:
      "Aydınlatma metni güncellendi. Teklifi kabul etmeden önce güncel metni okuyup kaydedin.",
    // T03 (H11 (a)): the optional early-performance box.
    earlyPerformanceTitle: "Hizmetin başlangıcı (isteğe bağlı)",
    earlyPerformanceHint:
      "Bu kutu isteğe bağlıdır; işaretlemeseniz de teklifi kabul edebilirsiniz.",
    // T18 (H19): the add-on breakdown.
    breakdownLine: (garden: string) => `${garden}`,
  },

  orders: {
    title: "Siparişlerim",
    empty: "Henüz siparişiniz yok.",
    number: "Numara",
    status: "Durum",
    total: "Tutar",
    paid: "Ödenen",
    service: "Hizmet dönemi",
    due: "Son ödeme",
    open: "Aç",
  },

  order: {
    title: (number: string) => `Sipariş ${number}`,
    status: "Durum",
    quote: "Teklif",
    total: "Toplam (KDV dahil)",
    paid: "Ödenen",
    refunded: "İade edilen",
    outstanding: "Kalan",
    due: "Son ödeme tarihi",
    service: "Hizmet dönemi",
    items: "Kalemler",
    payTitle: "Ödeme",
    card: "Kartla öde",
    cardHint:
      "Ödeme sayfası iyzico güvencesiyle açılır; kart bilgileriniz bize ulaşmaz. Ödemeden sonra bu sayfaya dönersiniz.",
    cardPending: "Ödeme sayfası açılıyor…",
    cardOff: "Kartla ödeme şu anda kapalı; havale ile ödeyebilirsiniz.",
    cardInProgress:
      "Süren bir kart ödemeniz var; sonuçlanmadan yeni bir kart ödemesi başlatılamaz. Ödeme sayfası açık kalmadıysa birkaç dakika içinde yeniden deneyebilirsiniz.",
    cardInProgressLink: "Ödemenin durumunu görün",
    transferTitle: "Havale / EFT",
    transferBody:
      "Aşağıdaki hesaba gönderin ve açıklamaya referansı mutlaka yazın. Ödemeniz ekibimizce kaydedildiğinde sipariş aktifleşir; kısmi ödeme kabul edilir. Bankanızın alabileceği gönderim ücreti size aittir; Şirket ek ücret almaz.",
    bank: "Banka",
    iban: "IBAN",
    holder: "Alıcı",
    reference: "Açıklama (referans)",
    amount: "Gönderilecek tutar",
    noBank: "Havale bilgileri henüz tanımlanmadı; lütfen bizimle iletişime geçin.",
    cancelTitle: "Siparişi iptal et",
    cancelBody: "Ödeme yapılmadıysa siparişi iptal edebilirsiniz.",
    cancel: "Siparişi iptal et",
    payments: "Ödemeler",
    noPayments: "Bu sipariş için ödeme yok.",
    activeNote: "Siparişiniz aktif; bahçeleriniz “Bahçelerim” altında.",
    addonNote: "Üyeliğinize eklenen bahçe",
    reviseTitle: "Bahçe listesini değiştir",
    reviseBody:
      "Sipariş iptal edilir ve başvurunuz yeniden açılır. Bahçe çıkardıktan sonra ekibimiz yeni bir teklif hazırlar.",
    reviseConfirm: "Siparişin iptal edileceğini anladım.",
    revise: "Bahçe listesini değiştir (sipariş iptal edilir, yeni teklif hazırlanır)",
  },

  payments: {
    title: "Ödemelerim",
    empty: "Henüz ödemeniz yok.",
    date: "Tarih",
    order: "Sipariş",
    method: "Yöntem",
    status: "Durum",
    amount: "Tutar",
    receipt: "Makbuz",
    open: "Aç",
  },

  payment: {
    title: "Ödeme",
    titleWithReceipt: (n: string) => `Ödeme ${n}`,
    status: "Durum",
    order: "Sipariş",
    method: "Yöntem",
    amount: "Tutar",
    card: "Kart",
    cardText: (association: string | null, last4: string | null) =>
      [association, last4 ? `•••• ${last4}` : null].filter(Boolean).join(" "),
    installment: "Taksit",
    bankReference: "Banka referansı",
    valueDate: "Valör",
    date: "Tarih",
    receipt: "Makbuzu indir (PDF)",
    refunds: "İadeler",
    refundAmount: "Tutar",
    refundStatus: "Durum",
    results: {
      initiated: "Ödemeniz bekleniyor. Bu sayfa birkaç saniyede bir kendiliğinden yenilenir.",
      pending_review:
        "Ödemeniz bankadan onay bekliyor; sonuç birkaç dakika içinde burada görünecek. Bu sayfa kendiliğinden yenilenir.",
      succeeded: "Ödemeniz alındı, teşekkür ederiz.",
      failed: "Ödeme tamamlanamadı. Kartınızdan çekim yapılmadı; yeniden deneyebilirsiniz.",
      expired: "Ödeme süresi doldu. Siparişinizden yeniden deneyebilirsiniz.",
      voided: "Bu ödeme iptal edildi ve tutarı iade edildi.",
    } as Record<string, string>,
    retry: "Siparişe dön",
  },

  account: {
    title: "Hesabım",
    contactTitle: "İletişim bilgileri",
    fullName: "Ad soyad",
    email: "İletişim e-postası",
    emailHint: "Giriş e-postanız değişmez; bu adres bildirimler içindir.",
    phone: "Cep telefonu",
    phoneNote:
      "Telefon numaranız giriş için de kullanıldığından buradan değiştirilemez. Değiştirmek için bizimle iletişime geçin.",
    preference: "İletişim tercihi",
    preferences: { whatsapp: "WhatsApp", sms: "SMS", phone_call: "Telefon araması" } as Record<
      string,
      string
    >,
    preferenceHint: "WhatsApp seçseniz de mesajlar şimdilik SMS olarak gönderilir.",
    billingTitle: "Fatura bilgileri",
    billingNone: "Fatura bilgileriniz henüz yok.",
    billingEdit: "Düzenle",
    consentsTitle: "İzinler",
    consentsLink: "İzinleri yönet",
    summaryTitle: "Özet",
    applications: (n: number) => `${n} başvuru`,
    orders: (n: number) => `${n} sipariş`,
    payments: (n: number) => `${n} ödeme`,
  },

  billing: {
    title: "Fatura bilgileri",
    lead: "Makbuz ve fatura bu bilgilerle düzenlenir. Kart ödemesinde ödeme kuruluşuna da iletilir.",
    kind: "Fatura türü",
    kinds: billingText.billingPartyKind,
    firstName: "Ad",
    lastName: "Soyad",
    identityNumber: "T.C. kimlik numarası",
    identityHint: "11 haneli. Kayıtlı numaranız gösterilmez; değiştirmek için yenisini yazın.",
    identityStored: (masked: string) => `Kayıtlı: ${masked}`,
    companyTitle: "Şirket unvanı",
    taxOffice: "Vergi dairesi",
    taxNumber: "Vergi numarası",
    address: "Adres",
    district: "İlçe",
    city: "İl",
    postalCode: "Posta kodu",
    email: "Fatura e-postası",
    emailHint: "Boş bırakırsanız iletişim ya da giriş e-postanız kullanılır.",
    emailRequiredHint:
      "Hesabınızda e-posta adresi yok. Kartla ödeme için gerekli; ödeme kuruluşu makbuzu bu adrese gönderir.",
    submit: "Fatura bilgilerini kaydet",
    backTo: "Kaydettikten sonra teklife dönersiniz.",
  },

  consents: {
    title: "İzinler",
    lead: "İsteğe bağlı izinlerinizi istediğiniz zaman verebilir ya da geri alabilirsiniz. Geri almak, o ana kadarki işlemleri etkilemez.",
    noneAsked:
      "Şu anda sorduğumuz isteğe bağlı bir izin yok. Tanıtım iletileri için onay, İleti Yönetim Sistemi (İYS) kaydımız tamamlandıktan sonra sorulacak; o zamana kadar size tanıtım iletisi gönderilmez.",
    noLongerAsked: "Bu izin artık sorulmuyor ve kullanılmıyor; isterseniz geri alabilirsiniz.",
    explicitLink: "Açık rıza metni",
    kvkkLink: "Aydınlatma metni",
    granted: "Verildi",
    notGranted: "Verilmedi",
    recorded: (date: string, version: string) => `Son kayıt ${date} (${version})`,
    grant: "Rıza ver",
    withdraw: "Rızayı geri al",
    kvkkTitle: "Aydınlatma metni",
    kvkkMissing: "Aydınlatma metnini okuduğunuza dair kaydımız yok.",
    kvkkDone: (date: string, version: string) => `Okudunuz: ${date} (${version}).`,
    kvkkCheck: "KVKK aydınlatma metnini okudum.",
    kvkkSubmit: "Kaydet",
  },
} as const;
