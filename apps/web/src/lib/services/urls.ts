// Addresses of the service pages of the portal (IP15) and the result a
// redirect puts into the URL (`?bilgi=` / `?hata=`). Only known codes are
// read back (servicesText.notices / .errors).

type Result = { bilgi?: string; hata?: string };

function withResult(path: string, result?: Result): string {
  const params = new URLSearchParams();
  if (result?.bilgi) params.set("bilgi", result.bilgi);
  if (result?.hata) params.set("hata", result.hata);
  const query = params.toString();
  return query ? `${path}${path.includes("?") ? "&" : "?"}${query}` : path;
}

export const serviceHref = {
  list: (r?: Result) => withResult("/portal/hizmetler", r),
  request: (id: string, r?: Result) => withResult(`/portal/hizmetler/${id}`, r),
  newRequest: (parcelId: string, serviceTypeId: string, r?: Result) =>
    withResult(
      `/portal/hizmetler/yeni?parsel=${encodeURIComponent(parcelId)}&hizmet=${encodeURIComponent(serviceTypeId)}`,
      r,
    ),
};
