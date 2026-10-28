// Visit dates, postponements, missed visits and the 8A reconciliation
// (docs/hukuk/kararlar.md H01, H15, H21; T07, T06; contract Md. 8A).

export const visitsText = {
  portal: {
    title: "Planlı ziyaretler",
    lead: "Ziyaret tarihi size en az 3 gün önce bildirilir. Ziyaretten en geç bir gün önce bir kez erteleme isteyebilirsiniz; ekibimiz ziyareti aynı pencere içinde yeniden planlar.",
    postpone: "Ertelenmesini iste",
    postponed: "Erteleme istendi; yeni tarih size bildirilecek.",
    notPostponable: "Erteleme süresi geçti.",
    day: (date: string) => `Tarih: ${date}`,
  },
  ops: {
    noticesTitle: "Ziyaret tarihi bildirimi",
    noticesLead:
      "Sözleşme 8A/1: tarih Sahip'e en az 3 gün önce SMS ya da telefonla bildirilir. 3 günden yakın bir tarihte SMS gitmez; telefonla bildirim kaydı gerekir.",
    noNotice: "Bu tarih için bildirim kaydı yok.",
    channel: { message: "SMS / WhatsApp", phone: "Telefon" } as Record<string, string>,
    status: { pending: "kuyrukta", sent: "gönderildi", failed: "gönderilemedi" } as Record<
      string,
      string
    >,
    phoneNotice: "Telefonla bildirildi",
    phoneNoticeAt: "Bildirim saati",
    phoneNoticeSave: "Telefonla bildirimi kaydet",
    phoneRequired:
      "Tarih 3 günden yakın: SMS gitmez. Sahip'e telefonla bildirdiğiniz saati yazın; kayıt ziyaretle birlikte tutulur.",
    postponementTitle: "Erteleme",
    postponement: (date: string, channel: string) =>
      `Sahip ${channel} erteleme istedi (ilk tarih ${date}). Ziyareti aynı pencerede yeni bir tarihe planlayın.`,
    postponementChannel: {
      portal: "portaldan",
      phone: "telefonla",
      written: "yazılı olarak",
    } as Record<string, string>,
    postponementRecord: "Telefonla ya da yazılı gelen ertelemeyi kaydet",
    postponementAt: "İsteğin zamanı",
    postponementSave: "Ertelemeyi kaydet",
    missedTitle: "Yapılamayan ziyaret",
    missedLead:
      "Sözleşme 8A: Sahip kaynaklı engelde zaman damgalı fotoğraf ve not, aynı gün bildirim ve aynı pencerede yeni tarih zorunludur. Önerilen tarihte aynı nedenle yine yapılamazsa ziyaret yapılmış sayılır.",
    missedNone: "Kayıt yok.",
    reasonLabel: "Neden",
    reason: {
      customer: "Sahip kaynaklı (8A/3)",
      company: "Şirket kaynaklı (8A/2)",
      weather: "Hava ya da Sahip dışı erişim engeli (8A/2)",
      force_majeure: "Mücbir sebep (8A/4)",
    } as Record<string, string>,
    outcome: {
      rescheduled: "Yeniden planlandı",
      deemed_done: "Yapılmış sayıldı (8A/3)",
      refunded: "İade edildi (8A/2)",
      carried_over: "Sonraki pencereye aktarıldı (Sahip'in talebiyle)",
    } as Record<string, string>,
    outcomePending: "Sonuç bekleniyor",
    fieldEvents: "Saha uygulamasının kaydı",
    fieldEventPrefill: (reason: string, photos: number) =>
      `Saha: ${reason} · ${photos} fotoğraf. Form bu kayıtla dolduruldu.`,
    occurredOn: "Ziyaretin yapılamadığı gün",
    detail: "Ayrıntı kodu",
    note: "Not",
    noteHint: "Ne oldu, kim vardı (telefon numarası yazmayın).",
    evidence: "Kanıt fotoğrafı",
    evidenceHint:
      "Saha fotoğrafları seçili gelir; ek fotoğraf yükleyebilirsiniz (JPEG, PNG, WebP, en fazla 4 MB).",
    notifiedOn: "Sahip'e bildirildiği gün",
    notifiedChannel: "Bildirim yolu",
    notifiedChannels: { sms: "SMS", whatsapp: "WhatsApp", phone: "Telefon" } as Record<
      string,
      string
    >,
    proposedDate: "Önerilen yeni tarih (aynı pencerede)",
    noDateInWindow: "Pencere içinde yeni tarih önerilemiyor (8A/2 uygulanır)",
    reportLost: "Raporu yayımlanamıyor (örneğin veri kaybı); kullanılmış ziyaret sayılmaz",
    outcomeLabel: "Sonuç",
    window: (label: string, end: string) => `Pencere: ${label} (son gün ${end})`,
    noWindow: "Bu gün bir ziyaret penceresinde değil.",
    carryTo: "Aktarılacak pencere",
    carryChannel: "Sahip'in talebi",
    carryChannels: { portal: "Portal", written: "Yazılı" } as Record<string, string>,
    refundId: "8A iadesi (iade numarası, isteğe bağlı)",
    save: "Kaydet",
    setOutcome: "Sonucu kaydet",
    deemedDone: "Yapılmış say (ikinci başarısız deneme)",
    fieldNoticesTitle: "Sahada bilgilendirme kayıtları",
    fieldNoticesNone: "Kayıt yok.",
    fieldNotice: {
      field_notice_sign: "Levha ve tanıtım kartı",
      field_notice_verbal: "Sözlü bilgilendirme",
      field_notice_objection: "İtiraz",
    } as Record<string, string>,
    sign: (sign: boolean, badge: boolean) =>
      `Levha: ${sign ? "kondu" : "konmadı"} · Kart: ${badge ? "görünür" : "görünmüyor"}`,
    verbal: {
      given: "Bilgi verildi",
      nobody: "Bahçede kimse yoktu",
      not_given: "Verilemedi",
    } as Record<string, string>,
    badgePostponed: "Erteleme istendi",
    badgeNoNotice: "Bildirim yok",
    badgeMissed: (n: number) => `${n} yapılamadı kaydı`,
  },
  reconciliation: {
    title: "Ziyaret mutabakatı (8A)",
    nav: "Mutabakat",
    lead: "Sözleşme 8A/6: her ziyaret penceresinin ve hizmet döneminin sonunda yapılamayan ziyaretler kendiliğinden tespit edilir; bedeli pencerenin bitiminden sonra en geç 14 gün içinde iade edilir ya da Sahip isterse aktarılır. İadeyi İadeler ekranından açın (neden: yapılamayan ziyaret).",
    empty: "Açık görev yok.",
    all: "Tümü",
    open: "Açık",
    columns: {
      customer: "Müşteri",
      garden: "Bahçe",
      order: "Sipariş",
      trigger: "Kontrol",
      scope: "Kapsam",
      visits: "Ziyaret",
      shortfall: "Eksik",
      fee: "Ziyaret bedeli",
      due: "Son gün",
      status: "Durum",
    },
    trigger: {
      window_end: "Pencere sonu",
      period_end: "Dönem sonu",
      removal: "Dönem sonunda çıkış",
    } as Record<string, string>,
    visits: (used: number, entitled: number, refunded: number, carried: number) =>
      `${used}/${entitled} yapıldı · ${refunded} iade · ${carried} aktarma`,
    overdue: "Gecikti",
    resolution: {
      refund_opened: "İade açıldı",
      carried_over: "Aktarıldı",
      visit_done: "Ziyaret yapıldı",
      not_needed: "Gerek yok (not zorunlu)",
    } as Record<string, string>,
    resolve: "Kapat",
    note: "Not",
    resolved: "Kapatıldı",
    saved: "Görev kapatıldı.",
  },
} as const;
