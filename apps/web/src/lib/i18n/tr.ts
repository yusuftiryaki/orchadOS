// Turkish UI strings. Every user-facing text lives here; components read it
// through `t` (src/lib/i18n/index.ts). A second language is a second file with
// the same shape (`Messages`).

export const tr = {
  app: {
    name: "orchadOS",
    tagline: "Antep fıstığı bahçeleri için bağımsız denetim",
  },
  sections: {
    portal: "Bahçelerim",
    uzman: "Uzman paneli",
    ofis: "Ofis",
    operasyon: "Operasyon",
  },
  login: {
    title: "Giriş",
    email: "E-posta",
    password: "Parola",
    submit: "Giriş yap",
    submitting: "Giriş yapılıyor…",
    invalidCredentials: "E-posta ya da parola hatalı.",
    missingFields: "E-posta ve parola gerekli.",
    methods: {
      password: "E-posta ve parola",
      phone: "Telefon (yakında)",
    },
  },
  nav: {
    logout: "Çıkış",
    sections: "Bölümler",
  },
  home: {
    noRoles: "Hesabınıza henüz bir rol atanmamış. Lütfen operasyon ekibiyle iletişime geçin.",
  },
  forbidden: {
    title: "Bu bölüme erişiminiz yok",
    body: "Hesabınızın rolleri bu sayfayı açmaya izin vermiyor.",
    back: "Ana sayfaya dön",
  },
  notFound: {
    title: "Sayfa bulunamadı",
    back: "Ana sayfaya dön",
  },
  parcels: {
    title: "Parseller",
    empty: "Görebileceğiniz parsel yok.",
    loadError: "Parseller yüklenemedi.",
    columns: {
      name: "Ad",
      location: "Konum",
      area: "Alan",
      trees: "Tahmini ağaç",
      status: "Durum",
    },
    areaUnit: "m²",
    status: {
      registered: "Kayıtlı",
      inventory_planned: "Envanter planlandı",
      inventory_done: "Envanter tamam",
      active_monitoring: "Aktif izleme",
      passive: "Pasif",
    },
  },
  parcel: {
    back: "Parsel listesi",
    boundaryVersion: (version: number) => `Sınır v${version}`,
    noBoundary: "Sınır yok",
    slotCount: (slots: number, trees: number) => `${slots} yer, ${trees} aktif ağaç`,
    legend: "Gösterim",
    selectHint: "Ayrıntı için haritada bir ağaca tıklayın.",
    emptySlot: "Boş yer",
  },
  tree: {
    title: "Ağaç",
    slotCode: "Yer kodu",
    slotKind: "Yer türü",
    sex: "Cinsiyet",
    graft: "Aşı",
    ageClass: "Yaş sınıfı",
    cultivar: "Çeşit",
    status: "Durum",
    health: "Son değerlendirme",
    firstSeen: "İlk görülme",
    unknown: "Bilinmiyor",
    none: "—",
    close: "Kapat",
    noTree: "Bu yerde aktif ağaç yok.",
    values: {
      slotKind: { row: "Sıra", interstitial: "Ara" },
      sex: { female: "Dişi", male: "Erkek", unknown: "Bilinmiyor" },
      graft: { grafted: "Aşılı", ungrafted: "Aşısız", unknown: "Bilinmiyor" },
      ageClass: {
        sapling: "Fidan",
        young: "Genç",
        productive: "Verimli",
        old: "Yaşlı",
        unknown: "Bilinmiyor",
      },
      status: { active: "Aktif", lost: "Kayıp" },
      health: {
        healthy: "Sağlıklı",
        attention: "Dikkat",
        problem: "Sorunlu",
        dead: "Kuru",
        absent: "Yok",
        unassessed: "Değerlendirilmedi",
      },
    },
  },
} as const;

export type Messages = typeof tr;
