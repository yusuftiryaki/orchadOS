import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";

// The optional early-performance box of the quote page (docs/hukuk/kararlar.md
// H11 (a), contract Md. 8B/4). Binding wording: change it only together with
// the contract text, a new distance_sales version and a registry migration
// (docs/musteri-yonetimi.md "Sözleşme belgeleri (T04)").
export const EARLY_PERFORMANCE_TEXT =
  "Hizmete (envanter ve periyodik ziyaretler) 14 günlük cayma süresi dolmadan başlanmasını talep ediyorum. Hizmete başlandığında kanuni cayma hakkımın sona ereceğini; Şirket'in tanıdığı cayma hakkını kullanırsam yapılmış envanterin payının ve yapılmış ziyaretlerin bedelinin iade edilmeyeceğini biliyorum. Bu kutuyu işaretlemezsem envanter cayma süresinden sonra yapılır.";

// The box belongs to the contract: its version is the distance_sales version
// shown next to it.
export const EARLY_PERFORMANCE_VERSION = LEGAL_TEXT_VERSIONS.distance_sales;
