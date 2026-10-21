// Address of the operations notification list (?durum filter, ?sonuc result).
export const notificationsHref = (status?: string, result?: string) => {
  const query = new URLSearchParams();
  if (status) query.set("durum", status);
  if (result) query.set("sonuc", result);
  const qs = query.toString();
  return `/operasyon/bildirimler${qs ? `?${qs}` : ""}`;
};
