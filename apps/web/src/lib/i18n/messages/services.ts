// Service layer of the owner portal (IP15, docs/MVP.md Module 6): the offer
// cards, the request form, "Hizmetlerim" and the request page, and the
// independence note on the care row (decision 5). Product rules: the work is
// done by our field staff with a motorlu tırpan (never promise robot mowing);
// the recommendation is shown only in the portal (docs/hukuk/kararlar.md H37).

import type { Database } from "@/lib/database.types";

type Enums = Database["public"]["Enums"];

export const servicesText = {
  nav: "Hizmetlerim",
  // Short name of a service in running text; the catalogue name otherwise.
  shortName: { weed_mowing: "Ot biçme" } as Record<string, string>,
  weedHeight: { short: "Kısa", medium: "Orta", tall: "Uzun" } as Record<string, string>,
  // "Bahçenizde ot uzun" / "orta boyda".
  weedPhrase: { medium: "orta boyda", tall: "uzun", short: "kısa" } as Record<string, string>,
  areaSource: {
    boundary: "ölçülen sınır",
    declared: "beyan edilen alan",
  } as Record<string, string>,
  status: {
    pre_request: "Ön talep",
    requested: "Talep alındı",
    scheduled: "Planlandı",
    done: "Tamamlandı",
    cancelled: "İptal edildi",
  } satisfies Record<Enums["service_request_status"], string>,
  window: {
    asap: "En kısa sürede",
    within_2_weeks: "2 hafta içinde",
    within_month: "Bu ay içinde",
    flexible: "Esnek",
  } satisfies Record<Enums["service_window"], string>,

  card: {
    title: "Bahçe hizmetleri",
    lead: "İşi köydeki saha ekibimiz motorlu tırpanla yapar. Öneri, yayımlanmış son ziyaretteki gözleme ve mevsime dayanır; uzman bulgusu değildir. İşi başkasına da yaptırabilirsiniz.",
    price: (amount: string, draft: boolean) => `${amount}, KDV dahil${draft ? ", tahmini" : ""}`,
    recommended: (weed: string, date: string) => `Bahçenizde ot ${weed} (son ziyaret: ${date}).`,
    offer: (service: string, price: string) => `${service}: ${price}.`,
    available: (service: string, price: string) => `${service} hizmeti: ${price}.`,
    preRequest: (service: string, opens: string) =>
      `${service} sezonu ${opens} açılıyor. Gelecek sezon için ön talep bırakın; bağlayıcı değildir.`,
    open: (service: string, number: string, status: string) =>
      `${service} talebiniz ${number}: ${status}.`,
    request: "Talep et",
    preRequestAction: "Ön talep bırak",
    showRequest: "Talebi gör",
    allRequests: "Hizmetlerim",
  },

  form: {
    genericTitle: "Hizmet talebi",
    title: (service: string) => `${service} talebi`,
    preTitle: (service: string) => `${service} için ön talep`,
    back: "Bahçeye dön",
    lead: "İşi köydeki saha ekibimiz motorlu tırpanla yapar. Talebiniz bir öneridir: tutarı ve iş gününü onayladığımızda sözleşme kurulur ve size SMS ile bildiririz. Ödeme iş bittikten sonra, havale/EFT ile ya da işyerimizde yapılır; çevrimiçi ödeme yoktur.",
    preLead: (opens: string) =>
      `Sezon dışındayız. Ön talep, gelecek sezon bu hizmetle ilgilendiğinizi bildirir; bağlayıcı değildir, fiyat ve tarih taahhüdü içermez. Sezon ${opens} açılınca sizi arar, talebinizi o günün fiyatıyla birlikte konuşuruz. Ön talebinizi istediğiniz zaman geri çekebilirsiniz.`,
    summaryTitle: "Bahçe ve tutar",
    parcel: "Bahçe",
    area: "Alan",
    areaValue: (area: string, source: string) => `${area} (${source})`,
    pricePerDonum: "Dönüm fiyatı",
    pricePerDonumValue: (amount: string) => `${amount} + KDV`,
    minimumFee: "Minimum ücret",
    minimumFeeValue: (amount: string) => `${amount} + KDV`,
    subtotal: "Ara toplam",
    vat: (rate: string) => `KDV (%${rate})`,
    total: "Toplam (KDV dahil)",
    draftNote:
      "Fiyat tahminidir. Talep anındaki tutar talebinize sabitlenir; onaylarken yalnızca indirebiliriz, artıramayız.",
    preEstimateNote:
      "Bugünkü fiyatla hesaplanmış yaklaşık tutardır. Ön talepte fiyat taahhüt edilmez; sezon açılınca güncel fiyatı ayrıca onaylarsınız.",
    roundingNote: "Her başlamış 100 m² 0,1 dönüm sayılır.",
    windowLabel: "Ne zaman yapılsın?",
    windowHint: "Tercihinizdir; kesin günü size biz bildiririz.",
    noteLabel: "Notunuz",
    noteHint:
      "Otların arasında görülmesi güç engelleri yazın: damla sulama hortumu, vana, büyük taş, yeni dikilmiş fidan, kuyu ya da çukur, tel. Kapı, anahtar ve iletişim bilgisi de buraya. En fazla 1000 karakter.",
    optional: "isteğe bağlı",
    termsTitle: "Onaylar",
    termsIntro: "Ön bilgilendirme ve ek sözleşme aynı belgededir:",
    termsLink: "Bakım Hizmetleri Ek Sözleşmesi – Ot Biçme (yeni sekmede açılır)",
    preInformationCheck:
      "Ek sözleşmenin 2. bölümündeki ön bilgilendirmeyi okudum; talep bilgilerini ve toplam tutarı gördüm.",
    termsCheck: "Bakım Hizmetleri Ek Sözleşmesi'ni onaylıyorum.",
    version: (v: string) => `sürüm ${v}`,
    earlyTitle: "İşin cayma süresi içinde yapılması (isteğe bağlı)",
    earlyHint: "İşaretlemezseniz iş, talebinizden en erken 15 gün sonraki bir güne planlanır.",
    // Section 10/3 of the addendum, word for word (docs/hukuk/
    // bakim-hizmeti-ek-sozlesme-taslagi.md); a change needs a new version.
    earlyCheck:
      "Ot biçmenin 14 günlük cayma süresi dolmadan yapılmasını istiyorum. Personel işe başladığında cayma hakkımın sona ereceğini biliyorum. Bu kutuyu işaretlemezsem iş, cayma süresi dolduktan sonraki bir güne planlanır.",
    preTermsNote:
      "Ön talep ek sözleşmenin 11. bölümüne göre yapılır; sözleşme ya da sözleşme önerisi değildir.",
    submit: "Talebi gönder",
    preSubmit: "Ön talep bırak",
    noOffer:
      "Bu bahçe için şu anda talep edilebilecek bir hizmet yok. Bahçenin alanı bilinmiyorsa ya da hizmet kapalıysa bizi arayın.",
    openExists: (number: string) =>
      `Bu bahçe için açık bir talebiniz var (${number}). Yeni talep açmadan önce onu görebilirsiniz.`,
  },

  list: {
    title: "Hizmetlerim",
    lead: "Bahçeleriniz için açtığınız hizmet talepleri ve ön talepler.",
    emptyTitle: "Henüz hizmet talebiniz yok",
    emptyBody:
      "Ot biçme gibi bahçe hizmetlerini bahçe sayfanızdaki hizmet kartından talep edebilirsiniz.",
    emptyAction: "Bahçelerime git",
    columns: {
      number: "Talep",
      parcel: "Bahçe",
      service: "Hizmet",
      status: "Durum",
      date: "Tarih",
      amount: "Tutar",
    },
    requestedOn: (date: string) => `Talep: ${date}`,
    scheduledOn: (date: string) => `İş günü: ${date}`,
    doneOn: (date: string) => `Yapıldı: ${date}`,
    cancelledOn: (date: string) => `İptal: ${date}`,
    estimate: "tahmini",
  },

  detail: {
    title: (number: string) => `Talep ${number}`,
    back: "Hizmetlerim",
    summaryTitle: "Talep",
    parcel: "Bahçe",
    service: "Hizmet",
    window: "Tercih edilen zaman",
    note: "Notunuz",
    early: "Cayma süresi içinde yapılsın",
    yes: "Evet",
    no: "Hayır",
    terms: "Onaylanan koşullar",
    area: "Alan",
    estimateTitle: "Talepte sabitlenen tutar",
    confirmed: "Onaylanan tutar (KDV dahil)",
    notConfirmed: "Tutarı ve iş gününü onayladığımızda burada görünür.",
    scheduled: "İş günü",
    completed: "İşin yapıldığı gün",
    payment: "Ödeme",
    paid: (date: string) => `Ödeme alındı (${date})`,
    payLater: "İş bitince ödenir",
    paymentHow:
      "Ödeme, iş tamamlandı bildiriminden itibaren 14 gün içinde havale/EFT ile (açıklamaya talep numarasını yazın) ya da işyerimizde yapılır. Saha ekibi ödeme almaz.",
    historyTitle: "Durum geçmişi",
    created: "Talep açıldı",
    by: { owner: "sizin tarafınızdan", ops: "ekibimiz tarafından", system: "sistem" } as Record<
      string,
      string
    >,
    cancelTitle: "Talebi iptal et",
    cancelRule: "İş gününden önceki günün sonuna kadar ücretsiz iptal; iş günü için bizi arayın.",
    cancelReason: "İptal nedeni",
    cancelSubmit: "Talebi iptal et",
    cancelConfirm: "Talebi iptal etmek istediğimi onaylıyorum.",
    tooLate: "İş günü geldiği için talep portaldan iptal edilemez. İş günü için bizi arayın.",
    cancelReasonShown: (reason: string) => `Neden: ${reason}`,
    cancelledBy: { owner: "Sizin iptaliniz", ops: "Ekibimizin iptali" } as Record<string, string>,
    proofTitle: "Öncesi ve sonrası",
    proofLead:
      "İşin kanıtı: fotoğraflar bahçenizin kayıtlarına eklenir, içerik özetiyle (SHA-256) saklanır ve sonradan değiştirilmez.",
    before: "Öncesi",
    after: "Sonrası",
    photoAlt: (phase: string, parcel: string, date: string) =>
      `${parcel}: ot biçme ${phase.toLocaleLowerCase("tr")} fotoğrafı, ${date}`,
    photoMissing: "Görüntü açılamadı",
    photoDate: (date: string) => `Tarih: ${date}`,
    fromVisit: "Denetim ziyaretinden",
    integrity: "Bütünlük (SHA-256)",
    noProof: "Fotoğraflar iş tamamlanınca burada görünür.",
    complaint:
      "İşte eksik ya da hasar görürseniz tamamlandı bildiriminden itibaren 7 gün içinde fotoğrafla bize bildirin; geç bildirim hakkınızı düşürmez.",
  },

  notices: {
    talep_alindi:
      "Talebiniz alındı. Tutarı ve iş gününü onayladığımızda size SMS ile bildireceğiz.",
    on_talep_alindi:
      "Ön talebiniz alındı. Sezon açılınca sizi arayacağız; ön talep bağlayıcı değildir.",
    iptal_edildi: "Talebiniz iptal edildi.",
  } as Record<string, string>,

  errors: {
    request_open:
      "Bu bahçe için bu hizmette açık bir talebiniz var. Yeni talep açmadan önce onu Hizmetlerim'de görebilir ya da iptal edebilirsiniz.",
    services_disabled: "Bahçe hizmetleri şu anda talep alınmıyor. Sorunuz varsa bizi arayın.",
    service_inactive:
      "Bu hizmet şu anda bu bahçe için sunulmuyor. Hizmetten çıkarılan bir bahçe için talep açılamaz.",
    area_unknown:
      "Bahçenizin alanı bilinmediği için tutar hesaplanamadı. Bizi arayın; alanı birlikte belirleyelim.",
    terms_outdated:
      "Hizmet koşulları güncellendi. Sayfayı yenileyip güncel koşulları onaylayarak yeniden gönderin.",
    note_too_long: "Not en fazla 1000 karakter olabilir. Kısaltıp yeniden gönderin.",
    reason_too_long: "İptal nedeni en fazla 500 karakter olabilir. Kısaltıp yeniden deneyin.",
    invalid_input: "Formdaki bilgiler eksik ya da hatalı. Kontrol edip yeniden gönderin.",
    consent_missing:
      "Talep için ön bilgilendirmeyi okuduğunuzu ve ek sözleşmeyi onayladığınızı işaretleyin.",
    cancel_confirm_missing: "İptal için onay kutusunu işaretleyin.",
    demo_read_only:
      "Demoda kapalı: gerçek hesabınızda ot biçme talep edebilir ve iptal edebilirsiniz.",
    not_found: "Talep, bahçe ya da hizmet bulunamadı. Bahçe sayfanızdan yeniden deneyin.",
    invalid_status: "Talebin durumu değişti; bu işlem artık yapılamaz. Sayfayı yenileyin.",
    too_late_to_cancel:
      "İş günü geldiği için talep portaldan iptal edilemez. İş günü için bizi arayın.",
    forbidden: "Bu işlemi yalnızca bahçenin sahibi yapabilir.",
    write_failed: "Kaydedilemedi. Bağlantınızı kontrol edip yeniden deneyin; sürerse bizi arayın.",
  } as Record<string, string>,

  // Care row of the report card, the PDF report and the expert review.
  care: {
    weedHeight: (label: string) => `Yabani ot boyu: ${label}`,
    weedHelp: "Kısa: bileğe kadar · Orta: dize kadar · Uzun: dizi aşıyor",
    ownWork: (dates: string) =>
      `Bu dönemde yabani ot biçmeyi orchadOS yaptı (${dates}). Bakım uyumu satırı kendi işimizi de içerir.`,
    expertTitle: "Bağımsızlık uyarısı",
    expertBody:
      "Değerlendirme ve imza akışı değişmez; karne ve PDF raporda bu açıklama sahibe de gösterilir.",
  },
};
