// Texts of the fake checkout page (/odeme/sahte; local, CI and the test
// project only). See docs/musteri-yonetimi.md §8.6.
export const fakeCheckoutText = {
  title: "Sahte ödeme sayfası",
  notice: "Bu sayfa yalnızca test içindir. Kart bilgisi istenmez, para çekilmez.",
  amountLabel: "Tutar",
  currency: "TL",
  invalid: "Ödeme bağlantısı geçersiz.",
  approve: "Ödemeyi onayla",
  decline: "Kart reddedildi",
  review: "İncelemeye düşür",
} as const;
