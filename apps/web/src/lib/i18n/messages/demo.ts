// Turkish text of the demo tour (İP13, docs/demo-turu.md §11): the /demo start
// page, the demo shell and banner, the guided tour, the closed write paths,
// the sample PDFs and the privacy paragraph. The data is synthetic and says
// so; nothing here claims a real garden.

import type { LegalBlock } from "./legal";

export type DemoStartError =
  | "invalid_input"
  | "captcha_failed"
  | "captcha_missing"
  | "rate_limited"
  | "demo_closed"
  | "demo_capacity"
  | "failed"
  | "unavailable"
  | "verify_failed"
  | "signed_in";

const closed = (what: string) => `Demoda kapalı: gerçek hesabınızda ${what}.`;

export const demoText = {
  start: {
    title: "Demoyu deneyin",
    metaDescription:
      "orchadOS sahip portalını hesap açmadan, örnek bir bahçe üzerinde deneyin: 360° gezi, sağlık haritası, karne, ağaç karnesi ve raporlar.",
    lead: "Hesap açmadan ve ödeme yapmadan, ücretli bir bahçe sahibinin gördüğü portalı örnek iki bahçe üzerinde gezin.",
    seeTitle: "Neler göreceksiniz",
    see: [
      "360° bahçe gezisi ve bir yıl önceki ziyaretle karşılaştırma",
      "Sağlık haritası ve katmanları",
      "Parsel karnesi: sağlık puanı, yapı, bakım, zararlı belirtileri ve meyve yükü",
      "Ağaç karnesi: fotoğraf kanıtı ve hash doğrulaması",
      "Bulgular, uzman açıklamaları ve önerileri, örnek soru-cevaplar",
      "Envanter raporu ve iki PDF",
    ],
    dataTitle: "Veriler hakkında",
    data: [
      "Bahçeler, kişiler, ölçümler ve görüntüler sentetiktir; konum temsilîdir. Gerçek bir bahçeye ait değildir.",
      "Demoda hiçbir şey kaydedilmez: soru gönderme, davet ve onay düğmeleri kapalıdır.",
      "Oturum 3 saat sürer; sonra kendiliğinden kapanır ve hesap silinir.",
    ],
    privacyTitle: "Gizlilik",
    privacy: [
      "Sizden kişisel veri (ad, telefon, e-posta) istenmez. Oturumu açık tutmak için zorunlu bir oturum çerezi kullanılır.",
      "Kötüye kullanımı önlemek için IP adresinizin takma adlandırılmış bir özeti 48 saat tutulur (IPv6'da /64 öneki).",
      "Ham IP adresi oturum kaydında ve altyapı loglarında kısa süre kalır.",
      "Robot doğrulaması (Turnstile) Cloudflare tarafından sağlanır.",
    ],
    privacyLink: "Ayrıntılar: [Gizlilik ve çerez politikası](/gizlilik)",
    button: "Demoyu başlat",
    starting: "Demo hazırlanıyor…",
    opening: "Portal açılıyor…",
    endedTitle: "Demo süreniz doldu ya da demodan çıktınız",
    endedBody: "Örnek bahçeleri yeniden gezmek için yeni bir demo başlatabilirsiniz.",
    restart: "Demoyu yeniden başlat",
    signedInTitle: "Demo için önce çıkış yapın",
    signedInBody:
      "Gerçek hesabınızla giriş yapmış durumdasınız. Demo ayrı, geçici bir hesapla açılır; hesabınızdan çıkış yapıp yeniden deneyin.",
    signedInBack: "Hesabıma dön",
    errors: {
      invalid_input: "İstek geçersiz. Sayfayı yenileyip yeniden deneyin.",
      captcha_failed: "Robot doğrulaması geçilemedi. Yeniden deneyin.",
      captcha_missing: "Lütfen robot doğrulamasını tamamlayın.",
      rate_limited: "Bu bağlantıdan çok sayıda demo açıldı. Bir süre sonra yeniden deneyin.",
      demo_closed: "Demo şu anda kapalı. Daha sonra yeniden deneyin.",
      demo_capacity: "Demo şu anda dolu. Birkaç dakika sonra yeniden deneyin.",
      failed: "Demo açılamadı. Yeniden deneyin.",
      unavailable: "Demo hizmetine ulaşılamıyor. Daha sonra yeniden deneyin.",
      verify_failed: "Demo oturumu açılamadı. Sayfayı yenileyip yeniden deneyin.",
      signed_in:
        "Gerçek hesabınızla giriş yapmış durumdasınız. Demo için önce hesabınızdan çıkış yapın.",
    } satisfies Record<DemoStartError, string>,
  },
  shell: {
    gardens: "Bahçelerim (örnek)",
    label: "Demo",
  },
  banner: {
    label: "Demo bilgisi",
    // No suffix after the time: the Turkish dative follows how it is read
    // aloud (15:30'a, 18:00'e, 16:00'ya), so a fixed 'ye is wrong.
    text: (until: string) =>
      `Örnek bahçe · veriler ve görüntüler sentetik, konum temsilî · oturum bitişi ${until}`,
    short: (until: string) => `Örnek veri · bitiş ${until}`,
    startTour: "Turu başlat",
    signup: "Gerçek hesap aç",
    contact: "Bize ulaşın",
    exit: "Demodan çık",
  },
  site: {
    backToDemo: "Demoya dön",
    exit: "Demodan çık",
    exitAndContinue: "Demodan çıkıp devam et",
    inDemo: "Şu anda demo hesabındasınız.",
  },
  closed: {
    generic: closed("bu işlem yapılabilir"),
    questions: closed("uzmana soru sorabilir ve cevaplara yazabilirsiniz"),
    viewers: closed("hissedarlarınızı davet edebilir ve çıkarabilirsiniz"),
    boundary: closed("ölçülen sınırı onaylayabilirsiniz"),
    billing: closed("başvuru, teklif ve ödeme işlemleri yapılabilir"),
    images: "Bu demo oturumunun görüntü sınırına ulaşıldı. Yeni bir demo başlatabilirsiniz.",
    pdfLimit: "Bu demo oturumunun PDF sınırına ulaşıldı. Yeni bir demo başlatabilirsiniz.",
  },
  // Sample PDFs (§11.6). `keywords` is ASCII: the PDF Info dictionary is not
  // compressed, so a byte search finds it.
  pdf: {
    watermark: "ÖRNEK RAPOR – gerçek bir bahçeye ait değildir",
    footer: "Sentetik demo verisi",
    keywords: "orchadOS ornek rapor (sentetik demo verisi)",
  },
  howTile: {
    title: "Kendiniz görün",
    body: "Örnek bir bahçenin portalını hesap açmadan gezin: 360° gezi, sağlık haritası, karne ve raporlar. Veriler sentetiktir.",
    cta: "Demoyu dene",
  },
  tour: {
    label: "Rehberli tur",
    counter: (n: number, total: number) => `${n} / ${total}`,
    prev: "Geri",
    next: "İleri",
    finish: "Bitir",
    close: "Turu kapat",
    packages: "Paketleri gör",
    steps: {
      bahceler: {
        title: "Bahçeleriniz",
        body: 'Hesabınızdaki bahçeler burada. Her kartta son ziyaretin tarihi ve ağaç sınıflarının dağılımı var. Turu "Örnek Bahçe – Kuzey" ile sürdürüyoruz.',
      },
      gezi: {
        title: "360° bahçe gezisi",
        body: "Bahçede ziyaret günü çekilen panoramalarda gezin. Oklar komşu noktalara götürür, ağaç işaretçileri ağaç karnesini açar; zaman yolculuğu aynı noktanın bir yıl önceki görüntüsünü gösterir.",
      },
      harita: {
        title: "Sağlık haritası",
        body: "Her ağaç son ziyaretteki sınıfıyla haritada. Isı katmanı sorunların toplandığı yerleri gösterir; katmanları ve sınıf süzgeçlerini buradan açıp kapatabilirsiniz.",
      },
      karne: {
        title: "Parsel karnesi",
        body: "Sağlık puanı aynı mevsimdeki bir önceki ziyaretle karşılaştırılır. Boyutlar bölümü yapı (dişi/erkek, aşısız ağaçlar), bakım, zararlı belirtileri ve meyve yükünü geçen yılla birlikte özetler.",
      },
      bulgular: {
        title: "Bulgular ve uzman notları",
        body: "Uzmanın işaretlediği bulgular önem sırasıyla. Her birinde uzmanın açıklaması ve önerisi var; ağaca bağlı olanlar ağaç karnesine götürür.",
      },
      agac: {
        title: "Ağaç karnesi",
        body: "Tek bir ağacın sınıf ve ölçüm geçmişi, fotoğraf kanıtı ve uzman bulgusu. Hash doğrulaması, gördüğünüz fotoğrafın çekimden sonra değişmediğini tarayıcınızda denetler.",
      },
      ziyaret: {
        title: "Ziyaret seçimi",
        body: 'Önceki ziyareti seçerek haritayı o güne göre görün; karne her zaman son ziyareti özetler. Hangi ağaçların değiştiğini "değişenler" süzgeciyle bulabilirsiniz.',
      },
      envanter: {
        title: "Envanter raporu",
        body: "İlk ziyarette çıkarılan ağaç envanteri: yerler, eksik ve boş yerler, dişi/erkek ve yaş dağılımı, panorama güveni ve kapsama.",
      },
      pdf: {
        title: "PDF rapor",
        body: 'Karneyi PDF olarak indirip paylaşabilirsiniz. Demodaki PDF\'lerin her sayfasında "ÖRNEK RAPOR" filigranı bulunur.',
      },
      son: {
        title: "Tur bitti",
        body: "Kendi bahçeniz için bağımsız bir denetim ister misiniz? Gerçek hesap açarak başvurabilir ya da paketlere göz atabilirsiniz.",
      },
    },
  },
  // Paragraph of the privacy policy (§12), awaiting the lawyer like the rest
  // of the draft text (gizlilik-v1-taslak).
  privacy: [
    { kind: "h2", text: "Demo turu" },
    {
      kind: "ul",
      items: [
        "Demo turunda sizden kişisel veri (ad, telefon, e-posta) istenmez. Demo, birkaç saat sonra silinen geçici bir hesapla açılır; hesabın e-posta adresi rastgeledir ve teslim edilemez.",
        "Kötüye kullanımı önlemek için IP adresinizin takma adlandırılmış bir özeti (IPv6'da /64 önekinin özeti) 48 saat tutulur. Bu özet, anahtarına sahip olan tarafından adresle eşleştirilebileceği için kişisel veri sayılır.",
        "Ham IP adresi ve tarayıcı bilgisi, oturum kaydında hesap silinene kadar, altyapı loglarında ise sağlayıcının saklama süresi boyunca ([X] gün) kalır.",
        "Robot doğrulaması için [Cloudflare Turnstile], barındırma için [Supabase] (AB bölgesi) ve [Vercel] kullanılır; bu hizmetler verinin yurt dışına aktarılmasını içerir.",
        "Demoda yalnızca zorunlu oturum çerezleri kullanılır.",
      ],
    },
  ] satisfies LegalBlock[],
};

export type DemoTourStepId = keyof typeof demoText.tour.steps;

// The banner's and the closing tour card's label for the same action: without
// a main site or sign-up the demo ends on the contact page (DemoShell).
export function demoSignupLabel(signupNext: string): string {
  return signupNext === "/iletisim" ? demoText.banner.contact : demoText.banner.signup;
}
