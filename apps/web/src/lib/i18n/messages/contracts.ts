// Texts of the order-specific contract documents (docs/hukuk/kararlar.md H12,
// H13, T04; docs/musteri-yonetimi.md "Sözleşme belgeleri (T04)"): the filled
// pre-information on the quote page, the PDFs, Sözleşmelerim and the ops
// screens. The legal wording itself comes from legal.ts.

export const CONTRACT_KINDS = [
  "pre_information",
  "distance_sales",
  "withdrawal_confirmation",
] as const;
export type ContractDocumentKind = (typeof CONTRACT_KINDS)[number];

export const contractsText = {
  kind: {
    pre_information: "Ön Bilgilendirme Formu",
    distance_sales: "Mesafeli Hizmet Sözleşmesi",
    withdrawal_confirmation: "Cayma süresi bildirimi",
  } satisfies Record<ContractDocumentKind, string>,
  quoteKind: {
    initial: "İlk sipariş",
    addon: "Ek sipariş (üyelik dönemi içinde eklenen bahçe)",
    renewal: "Yenileme",
  },
  // The filled document (quote page and PDF).
  doc: {
    orderTitle: "Bu siparişin bilgileri",
    quoteTitle: "Bu teklifin bilgileri",
    quote: (n: string) => `**Teklif no:** ${n}`,
    order: (n: string) => `**Sipariş no:** ${n}`,
    orderOnAcceptance: "**Sipariş no:** teklif onaylanınca verilir",
    kind: (k: string) => `**Sipariş türü:** ${k}`,
    separateContract:
      "Bu sipariş, önceki siparişlerden ayrı bir mesafeli sözleşmedir (sözleşme Madde 8D/7 ve 12/2); kendi ön bilgilendirmesi, onayı, cayma süresi ve belgeleri vardır.",
    seller: (s: string) => `**Hizmet veren:** ${s}`,
    buyer: (b: string) => `**Hizmet alan:** ${b}`,
    package: (name: string, visits: number) =>
      `**Paket:** ${name} · yılda ${visits} periyodik ziyaret`,
    period: (from: string, to: string) => `**Hizmet dönemi:** ${from} – ${to}`,
    periodOnPayment: (to: string | null) =>
      to
        ? `**Hizmet dönemi:** ödemenin tamamlandığı gün başlar, ${to} günü biter`
        : "**Hizmet dönemi:** ödemenin tamamlandığı gün başlar ve bir yıl sürer",
    periodFrom: (from: string, to: string) =>
      `**Hizmet dönemi:** ${from} (ödeme daha sonra tamamlanırsa ödeme günü) – ${to}`,
    entitlement: (visits: number, inventory: boolean) =>
      `**Ziyaret hakkı:** bahçe başına ${visits} periyodik ziyaret${inventory ? " ve bir envanter ziyareti" : ""}`,
    entitlementAddon: (visits: number, perYear: number) =>
      `**Ziyaret hakkı:** bahçe başına ${visits}/${perYear} periyodik ziyaret (kalan döneme göre orantılı)`,
    validUntil: (d: string) => `**Teklifin son geçerlilik günü:** ${d}`,
    base: (v: string) => `**Ara toplam (indirim öncesi, KDV hariç):** ${v}`,
    discount: (rate: string, v: string) => `**İndirim (%${rate}):** ${v}`,
    discountNote: (note: string) => `**İndirim açıklaması:** ${note}`,
    subtotal: (v: string) => `**KDV hariç toplam:** ${v}`,
    vat: (rate: string, v: string) => `**KDV (%${rate}):** ${v}`,
    total: (v: string) => `**Toplam bedel (KDV dahil):** ${v}`,
    withdrawalRule:
      "**Cayma süresi:** ödemenin tamamlandığı (siparişin etkinleştiği) günden itibaren 14 gün; son gün dahildir. Son gün, ödeme gününden 14 gün sonraki gündür (ör. ödemesi 1 Mart'ta tamamlanan siparişte 15 Mart). Somut son gün ödemeden sonra ayrı bir bildirimle portalda ve Sözleşmelerim'de verilir.",
    withdrawalOnAcceptance: (last: string) =>
      `**Cayma süresi:** bu teklifin toplamı sıfır olduğu için sipariş onayla birlikte etkinleşir; cayma süresinin son günü ${last}'dir (son gün dahil).`,
    withdrawalDate: (paid: string, last: string) =>
      `**Cayma süresi:** sipariş ${paid} günü etkinleşti; cayma süresinin son günü ${last}'dir (son gün dahil).`,
    versions: (pre: string, contract: string) =>
      `**Metin sürümleri:** Ön Bilgilendirme Formu ${pre} · Mesafeli Hizmet Sözleşmesi ${contract}`,
    linesTitle: "Ek-1: Bu siparişin bahçe satırları",
    linesHead: [
      "#",
      "Bahçe",
      "Konum",
      "Alan",
      "Ziyaret",
      "Birim fiyat",
      "En az ücret",
      "Envanter",
      "Tutar (KDV hariç)",
    ],
    breakdownTitle: "Ek teklifin hesabı (bahçe bazında)",
    breakdownLine: (name: string) => `Bahçe: ${name}`,
    breakdownHead: ["Kalem", "Değer"],
    ek7Title: "Ek-7: Örnek cayma formu (bu sipariş için)",
    ek7To: (to: string) => `**Kime:** ${to}`,
    ek7Order: (n: string | null) => `**Sipariş numarası ve ödeme tarihi:** ${n ?? "…"} · …`,
    templateTitle: (title: string) => title,
    draft:
      "TASLAK: Bu metin henüz taslaktır ya da şirket bilgileri eksiktir; köşeli parantez içindeki yerler doldurulmamıştır.",
    unknown: "…",
  },
  withdrawal: {
    title: "Cayma süresi bildirimi",
    intro: (order: string, paid: string) =>
      `${order} numaralı siparişinizin ödemesi ${paid} günü tamamlandı ve sipariş etkinleşti.`,
    lastDay: (last: string) =>
      `**Cayma süresinin son günü: ${last}.** Bu gün süreye dahildir. Bu güne kadar gerekçe göstermeden ve cezai şart ödemeden cayabilirsiniz (Ön Bilgilendirme Formu 5. bölüm, sözleşme Madde 8).`,
    how: (channels: string) =>
      `Cayma bildirimi portaldan, ${channels} yazılı olarak yapılır. Ek-7'deki örnek cayma formu kullanılabilir; açık bir yazılı beyan da yeterlidir. Bildirimde bir bahçe belirtilmişse cayma yalnızca o bahçe için kullanılmış olur.`,
    channels: (email: string, kep: string, address: string) =>
      `${email} ya da ${kep} adresine ya da ${address}'e`,
    refund:
      "Ödenen tutar, bildirimin ulaşmasından itibaren en geç 14 gün içinde ödemenin yapıldığı yöntemle iade edilir. Hizmete cayma süresi içinde başlanmasını onayladıysanız yapılmış envanterin payı ve yapılmış ziyaretlerin bedeli iadeden düşülür.",
    period: (from: string, to: string) => `**Hizmet dönemi:** ${from} – ${to}`,
  },
  pdf: {
    footer: (version: string, order: string) => `${version} · Sipariş ${order}`,
    page: (n: number, total: number) => `Sayfa ${n}/${total}`,
    draftMark: "TASLAK",
  },
  // The quote page.
  quote: {
    title: "Ön bilgilendirme ve sözleşme (bu teklif için doldurulmuş)",
    intro:
      "Aşağıdaki Ön Bilgilendirme Formu ve Mesafeli Hizmet Sözleşmesi bu teklifin bilgileriyle doldurulmuştur. Onaydan önce okuyun; onayladığınızda bu metinlerin özeti onay kaydına yazılır ve siparişe özel PDF kopyaları Hesabım › Sözleşmelerim'de saklanır.",
    addonIntro:
      "Bu bir ek tekliftir: onaylarsanız önceki siparişlerinizden ayrı bir mesafeli sözleşme kurulur (Madde 8D/7, 12/2).",
    renewalIntro:
      "Bu bir yenileme teklifidir: onaylarsanız yeni hizmet yılı için ayrı bir mesafeli sözleşme kurulur (Madde 12/2).",
    showContract: "Mesafeli Hizmet Sözleşmesi'nin tamamını göster",
    preCheck:
      "Yukarıda bu teklifin bilgileriyle doldurulmuş Ön Bilgilendirme Formu'nu okudum ve onaylıyorum.",
    contractCheck:
      "Yukarıda bu teklifin bilgileriyle doldurulmuş Mesafeli Hizmet Sözleşmesi'ni okudum ve kabul ediyorum.",
    stale:
      "Gösterilen metin bu arada değişti (teklif, fatura bilgileri ya da tarih). Sayfa yenilendi; lütfen metni yeniden okuyup onaylayın.",
  },
  // Sözleşmelerim and the order pages.
  list: {
    title: "Sözleşmelerim",
    navLabel: "Sözleşmelerim",
    intro:
      "Onayladığınız her siparişin Ön Bilgilendirme Formu ve Mesafeli Hizmet Sözleşmesi, sipariş bilgileriyle doldurulmuş PDF olarak burada değiştirilmeden saklanır. Ödemeden sonra cayma süresinin son gününü yazan bildirim eklenir.",
    empty: "Henüz bir sözleşme belgeniz yok.",
    preparing: "Belgeler hazırlanıyor. Birkaç dakika içinde burada görünür.",
    manualCopy:
      "Bu siparişin belgeleri otomatik olarak üretilemedi. Onayladığınız metnin kopyası talebiniz üzerine Şirket tarafından verilir; destek kanallarından bize yazabilirsiniz.",
    order: (n: string) => `Sipariş ${n}`,
    kind: "Belge",
    version: "Sürüm",
    created: "Oluşturma",
    size: "Boyut",
    sha: "SHA-256",
    download: "İndir",
    downloadPdf: (kind: string) => `${kind} (PDF) indir`,
    openOrder: "Siparişi aç",
    emptyBody: "Bir teklifi onayladığınızda siparişinizin belgeleri burada saklanır.",
    // What each document is, under its name in Sözleşmelerim.
    about: {
      pre_information: "Sipariş vermeden önce size sunulan hizmet, fiyat ve cayma hakkı bilgileri.",
      distance_sales: "Sizinle yaptığımız hizmet sözleşmesi, sipariş bilgilerinizle doldurulmuş.",
      withdrawal_confirmation: "Ödemeden sonra cayma hakkınızın son gününü bildirir.",
    } as Record<string, string>,
    orderTitle: "Sözleşme belgeleri",
    orderLink: "Tüm sözleşmelerim",
    copyNote:
      "Portal erişiminiz sona erse bile Şirket bu belgeleri onay tarihinden itibaren 10 yıl saklar ve talebiniz üzerine kopyasını verir.",
    kb: (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`,
  },
  ops: {
    missingTitle: "Sözleşme belgesi eksik siparişler",
    missingEmpty: "Sözleşme belgesi eksik sipariş yok.",
    missingHint:
      "Belgeler teklif kabulünden hemen sonra, kabul anında saklanan bilgilerle (kabul anlık görüntüsü) üretilir; üretilemediyse müşteri Sözleşmelerim'i ya da sipariş sayfasını açtığında yeniden denenir. Buradan da üretilebilir; bir tıklama en fazla 5 siparişi işler.",
    manualTitle: "Elle kopya gereken siparişler",
    manualHint:
      "Bu siparişlerin belgeleri otomatik üretilemez (kabul anlık görüntüsü yok, onaylanan sürümün şablonu yok ya da kayıt sürümü reddetti). Otomatik denemeye ve toplu üretime alınmazlar; müşteriye onayladığı sürümün kopyası elle hazırlanıp verilir. “Yeniden dene” yalnızca bu siparişi bir kez daha dener.",
    manualState: "Elle kopya gerekiyor",
    retry: "Yeniden dene",
    order: "Sipariş",
    status: "Durum",
    accepted: "Kabul",
    missing: "Eksik",
    generate: "Belgeleri üret",
    generateAll: (n: number) => `Sıradakileri üret (${n})`,
    documentsTitle: "Sözleşme belgeleri",
    documentsEmpty: "Bu sipariş için kayıtlı belge yok.",
    copyHint:
      "Portal erişimi sona ermiş müşteriye talep halinde buradan indirilen kopya verilir (H12).",
    generator: "Üreten",
    result: {
      generated: (n: number) => `${n} belge üretildi.`,
      none: "Üretilecek belge yoktu.",
      partial: (ok: number, failed: number) =>
        `${ok} belge üretildi, ${failed} belge üretilemedi (sonra yeniden denenebilir).`,
      failed: "Belgeler üretilemedi. Sonra yeniden deneyin.",
      manual: (n: number) => `${n} sipariş elle kopya listesine alındı.`,
    },
  },
} as const;
