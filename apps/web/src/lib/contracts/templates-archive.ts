import type { ContractTemplate } from "./templates";

// Frozen earlier versions of the pre-information and the contract, copied
// verbatim (title and blocks) from legal.ts when the version was replaced
// (templates.ts). Never edited: the registry holds their hashes.

export const ONBILGI_V4: ContractTemplate = {
  title: "Ön Bilgilendirme Formu",
  blocks: [
    {
      kind: "p",
      text: "Bu form her teklifin (ilk, ek ve yenileme) onayından önce o teklifin bilgileriyle gösterilir ve ayrıca onaylanır.",
    },
    { kind: "h2", text: "1. Hizmet veren" },
    {
      kind: "ul",
      items: [
        "**Unvan:** OBA Bilişim Teknolojileri LTD. [tam unvan: ticaret sicilindeki gibi]",
        "**Adres:** [Adres]",
        "**Telefon:** [Telefon] · **E-posta:** [E-posta] · **KEP:** [KEP adresi]",
        "**MERSİS no:** [MERSİS] · **Vergi dairesi / no:** [ ]",
      ],
    },
    { kind: "h2", text: "2. Hizmetin temel nitelikleri" },
    {
      kind: "ul",
      items: [
        "Antep fıstığı bahçelerinin bağımsız denetimi: her bahçe için bir kez envanter (kullanım sınırı, ağaç haritası ve kodlama) ve paketteki sayıda periyodik ziyaret.",
        "Her ziyarette bahçe 360° kamera ve uydu konumlamayla taranır; ziraat mühendisi değerlendirir ve raporu imzalar. Raporlar portalda ve PDF olarak sunulur.",
        "Yapay zekâ yalnızca ön değerlendirme yapar ve **hastalık teşhisi koymaz.**",
        "Haritadaki sınır Sahip'in gösterdiği fiili kullanım sınırıdır; **tapu ya da mülkiyet sınırı iddiası taşımaz.** Sınırı siz gösterirsiniz ve envanterden sonra portalda onaylarsınız; sınırın doğruluğu sizin beyanınıza dayanır ve resmi ölçüm değildir.",
        "**Kapsam dışı:** bahçe bakımı, ilaçlama, budama; hastalık teşhisi ve laboratuvar analizi; verim ya da gelir tahmini ve garantisi; mülkiyet ve sınır tespiti; bekçilik.",
      ],
    },
    { kind: "h2", text: "3. Fiyat" },
    {
      kind: "ul",
      items: [
        "Toplam bedel, vergiler dahil olarak teklifte ve sipariş özetinde gösterilir: yıllık ziyaret sayısı × doğrulanan alan × dönüm ve ziyaret başı birim fiyat, bahçe başına en az ücret, ilk yıl envanter ücreti, varsa indirim, KDV.",
        "Teklif, üzerinde yazan son geçerlilik tarihine kadar değişmez.",
        {
          text: "**Üyelik dönemi içinde eklenen bahçe (ek teklif):** Hizmeti üyeliğinizin bitiş gününde biter ve fiyatı kalan döneme göre orantılanır. Teklif günü yürürlükte olan yayımlı fiyat listesi ve üyeliğinizin paketi kullanılır.",
          children: [
            "Ziyaret hakkı = yıllık ziyaret sayısı × kalan gün ÷ dönemin toplam günü; yarım yukarı yuvarlanır, en az 1 ziyarettir. Kalan gün, ek teklifte yazan başlangıç gününden dönemin bitişine kadar sayılır. Ziyaret hakkı teklifte sabitlenir; ödeme daha sonra yapılsa da değişmez.",
            "Ziyaret tutarı ziyaret hakkıyla hesaplanır. Bahçe başına en az ücret aynı oranla orantılanır. Envanter ücreti, envanter tek seferlik bir iş olduğu için tam alınır. Daha önce hizmetten çıkarılıp, son yayımlanmış envanterinin tarihinden itibaren 24 ay içinde yeniden eklenen ve sınırı ile ağaç düzeni esaslı biçimde değişmemiş bahçeden envanter ücreti alınmaz; bu süre geçmişse ya da yeni envanter gerekiyorsa envanter ücreti ek teklifte gerekçesiyle ayrı satır olarak gösterilir.",
            'Ek teklif hizmet dönemini (başlangıç ve üyeliğinizle ortak bitiş günü), ziyaret hakkını (ör. "2/4 ziyaret"), bahçe bazında envanteri ve son geçerlilik gününü gösterir. Son geçerlilik günü, dönemin bitişine en az 30 gün kalan son günü geçmez; ek teklif en geç o gün onaylanır ve ödenir.',
            "Ek teklif hesabı rakamla gösterir (kalan gün, ziyaret hakkı ve yuvarlama, ziyaret tutarı, orantılı en az ücret, envanter, KDV, toplam) ve dönemde kalan ziyaret pencerelerini yazar. Yuvarlamada 2,5 ve üstü yukarı, altı aşağı yuvarlanır. Bağlayıcı olan teklifteki toplamdır.",
            "Örnek (lansman fiyat listesi, Standart paket): 1 Kasım 2026–31 Ekim 2027 döneminde, yılda 4 ziyaretli pakette 1 Nisan 2027'de başlayan 15 dönümlük bahçe için 2 ziyaret ve envanter ücretiyle birlikte KDV dahil 13.920,00 TL; envanterle tam yıl 20.640,00 TL olurdu.",
          ],
        },
        "Teklifte yazan toplam bedel dışında Şirket'e ödeyeceğiniz başka bir ücret yoktur. Kartla ödemede ek ücret alınmaz. Havale ya da EFT ile ödemede kendi bankanızın alabileceği gönderim ücreti size aittir.",
      ],
    },
    { kind: "h2", text: "4. Ödeme ve ifa" },
    {
      kind: "ul",
      items: [
        "Teklifi onaylamak ödeme yükümlülüğü doğurur. Ödeme süresi içinde ödenmeyen siparişi Şirket iptal edebilir ya da süreyi uzatabilir; ödenmeyen sipariş için sizden bir bedel istenmez.",
        "Ödeme peşin ve tek çekimdir: kartla 3D Secure ile ([iyzico Ödeme Hizmetleri A.Ş.] üzerinden) ya da havale/EFT ile. Kart bilgileri Şirket'e ulaşmaz.",
        "Fatura ödemeden sonra elektronik olarak düzenlenir ve portalda sunulur.",
        "Hizmet yılı ödemenin tamamlandığı gün başlar. Ek siparişin hizmeti ödemenin tamamlandığı gün (teklifte daha ileri bir başlangıç günü yazıyorsa o gün) başlar ve üyelik döneminin bitiş gününde biter. Ödeme son ek gününden sonra ulaşır ya da dönem bu arada sona ererse ek sipariş başlamaz ve ödenen tutar iade edilir. Envanter ziyaretinin tarihi Sahip'le birlikte belirlenir; hizmete cayma süresi içinde başlanmasını istemediyseniz (5. bölüm) envanter cayma süresinden sonra yapılır. Periyodik ziyaretler sözleşmenin Ek-2'sindeki pencerelerde yapılır.",
        "Rapor her ziyaretten sonra en geç 15 iş günü içinde portalda yayımlanır.",
      ],
    },
    { kind: "h2", text: "5. Cayma hakkı" },
    {
      kind: "ul",
      items: [
        "Sahip, ödemenin tamamlandığı (siparişin onaylanıp etkinleştiği) günden itibaren **14 gün** içinde gerekçe göstermeden ve cezai şart ödemeden cayabilir; son gün dahildir. Kanuni cayma süresi sözleşmenin kurulduğu (teklifin onaylandığı) gün başlar; Şirket, Sahip lehine olarak süreyi ödemenin tamamlandığı günden başlatır. Hizmetin başlangıcı teklifte daha ileri bir gün olsa bile (örneğin yenilemede) süre ödeme gününden sayılır. Ek siparişte süre, ek siparişin ödemesinin tamamlandığı günden sayılır.",
        "Cayma bildirimi portaldan, [e-posta] ya da [KEP] adresine ya da [Adres]'e yazılı olarak yapılır. Aşağıdaki örnek cayma formu kullanılabilir; açık bir yazılı beyan da yeterlidir. Bildirimde bir bahçe belirtilmişse cayma yalnızca o bahçe için kullanılmış olur. Süre içinde gönderilen bildirim yeterlidir. Şirket bildirimin alındığını gecikmeksizin SMS ile ve portalda teyit eder.",
        'Cayma tek bir bahçe için de kullanılabilir: portalda bahçeyi hizmetten çıkarırken "Cayma hakkımı kullanıyorum" seçeneği **açıkça** seçilir. Bu seçenek yalnızca cayma süresi içinde gösterilir. "30 gün sonra" ya da "dönem sonunda" seçimi cayma bildirimi sayılmaz.',
        "Ödenen tutar, bildirimin ulaşmasından itibaren en geç **14 gün** içinde, ödemenin yapıldığı yöntemle iade edilir.",
        "**Hizmete cayma süresi içinde başlanması:** Teklifi onaylarken ayrı bir kutuyu işaretleyerek hizmete cayma süresi dolmadan başlanmasını isteyebilirsiniz. İstemezseniz envanter cayma süresinden sonra yapılır. Onayınızla hizmete başlandığında kanuni cayma hakkınız sona erer (Yönetmelik md. 15/1-(h)). Şirket'in tanıdığı cayma hakkı ise cayma süresinin sonuna kadar sürer; bu hakkı kullanırsanız yapılmış envanterin payı ve yapılmış ziyaretlerin bedeli iadeden düşülür.",
        "Cayma süresinden sonra bahçe bazında fesih ve iade: [İptal ve İade Politikası](/iade), 5. bölüm.",
      ],
    },
    { kind: "h2", text: "6. Şikâyet ve itiraz" },
    {
      kind: "ul",
      items: [
        "Şikâyetler [E-posta] ve [Telefon] üzerinden iletilir.",
        "Tüketici, Ticaret Bakanlığı'nca ilan edilen parasal sınırlar içinde yerleşim yerindeki ya da işlemin yapıldığı yerdeki tüketici hakem heyetine başvurabilir. Sınırların üzerindeki uyuşmazlıklarda tüketici mahkemesinde dava açmadan önce arabulucuya başvurmak zorunludur.",
      ],
    },
    { kind: "h2", text: "7. Kişisel veriler" },
    {
      kind: "p",
      text: "Kişisel veriler [KVKK Aydınlatma Metni](/kvkk)'ne göre işlenir. Ödeme bilgileri ödeme kuruluşuyla paylaşılır.",
    },
    { kind: "h2", text: "8. Örnek cayma formu" },
    {
      kind: "p",
      text: "(Mesafeli Sözleşmeler Yönetmeliği ekindeki formun uyarlamasıdır; kullanılması zorunlu değildir.)",
    },
    {
      kind: "ul",
      items: [
        "**Kime:** OBA Bilişim Teknolojileri LTD., [Adres], [E-posta], [KEP]",
        "Bu formla aşağıdaki hizmetin sunulmasına ilişkin sözleşmeden cayma hakkımı kullandığımı beyan ederim.",
        "**Sipariş numarası ve ödeme tarihi:** …",
        "**Cayma hakkına konu hizmet (bütün bahçeler ya da bahçenin adı):** …",
        "**Hizmetin bedeli:** …",
        "**Adı soyadı:** …",
        "**Adresi:** …",
        "**İmzası (yalnızca kâğıt üzerinde gönderilirse):** …",
        "**Tarih:** …",
      ],
    },
    {
      kind: "p",
      text: "Bu formun ve sözleşmenin size özgü kopyası onaydan sonra portalınızda (Hesabım › Sözleşmelerim) saklanır ve bağlantısı SMS ile gönderilir.",
    },
    {
      kind: "p",
      text: "Bu formu okudum ve sözleşme kurulmadan önce bilgilendirildiğimi teyit ederim.",
    },
  ],
};

export const MESAFELI_V4: ContractTemplate = {
  title: "Mesafeli Hizmet Sözleşmesi",
  blocks: [
    {
      kind: "p",
      text: "Bu sözleşme iki yolla kurulur: kâğıt üzerinde imzayla ya da portalda, teklifin elektronik ortamda onaylanmasıyla (mesafeli hizmet sözleşmesi, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği). Portalda kurulduğunda Sahip, onaydan önce [Ön Bilgilendirme Formu](/on-bilgilendirme)'nu okuduğunu ayrıca onaylar. Sitede \"Mesafeli hizmet sözleşmesi\" adıyla bu metin yayımlanır; ayrı bir sözleşme dosyası yoktur. Kâğıt üzerinde imza yalnızca Şirket'in işyerinde atılır; işyeri dışında sözleşme portalda kurulur.",
    },
    { kind: "h2", text: "Madde 1 – Taraflar" },
    {
      kind: "p",
      text: '**Hizmet veren:** OBA Bilişim Teknolojileri LTD. [tam unvan: ticaret sicilindeki gibi], [adres], [vergi dairesi/no], [KEP] ("Şirket")',
    },
    {
      kind: "p",
      text: '**Hizmet alan:** [Ad soyad], [T.C. kimlik no: yalnızca ödeme kuruluşu isterse], [adres], [telefon], [e-posta] ("Sahip"). Portalda kurulan sözleşmede bu bilgiler Sahip\'in hesabından ve fatura profilinden alınır.',
    },
    {
      kind: "p",
      text: '**Tacir Sahip:** Fatura profilinde şirket olarak (unvan ve vergi kimlik numarasıyla; tüzel kişi ya da ticari işletme adına) kayıtlı Sahip bu sözleşmede "tacir Sahip" sayılır. Diğer bütün Sahiplere tüketici hükümleri uygulanır. Bu sınıflandırma, tüketici sayılan Sahip\'in kanuni haklarını sınırlamaz.',
    },
    { kind: "h2", text: "Madde 2 – Konu" },
    {
      kind: "p",
      text: "Bu sözleşme, Sahip'in Ek-1'de listelenen bahçelerinin (her biri \"Bahçe\") Şirket tarafından bağımsız olarak, belirli aralıklarla denetlenmesini düzenler. Denetimin sonuçları uzman onaylı raporlar olarak Sahip'e sunulur. Tarafların hak ve yükümlülükleri bu sözleşmede belirtilmiştir.",
    },
    {
      kind: "p",
      text: "Üyelik dönemi içinde Madde 8D'ye göre eklenen bahçeler, ek teklifin Sahip tarafından onaylanmasıyla ve ek siparişin başladığı gün Ek-1'e girer; ayrıca bir imza gerekmez. Madde 12/3'e göre hizmetten çıkarılan bahçe Ek-1'de çıkış tarihiyle gösterilir. Ek-1 bunlar dışında değiştirilemez; geçmiş kayıtları silinmez. Bu sözleşmenin hükümleri, aksi yazılmadıkça ve sözleşmenin bütününe ilişkin hükümler (Madde 1, 9, 10, 13, 14, 15, 16) dışında, her Bahçe için ayrı ayrı uygulanır; bir Bahçe için yapılan fesih, cayma ya da yapılamayan ziyaret diğer bahçeleri etkilemez.",
    },
    { kind: "h2", text: "Madde 3 – Tanımlar" },
    {
      kind: "ul",
      items: [
        "**Envanter:** Bahçenin kullanım sınırının, ağaçlarının ve boş yerlerinin bir kez haritalanması ve kodlanması.",
        "**Periyodik ziyaret:** Bahçenin 360° kamera ve uydu konumlama ekipmanıyla taranması, seçilen ağaçlarda yakın plan çekimi.",
        "**Uzman:** Değerlendirmeyi yapan ve raporu imzalayan ziraat mühendisi.",
        "**Rapor:** Ziyaret sonuçlarının portalda ve PDF olarak sunulan, uzman imzalı özeti: ağaç ağaç sınıflar, bulgular ve öneriler.",
        "**Portal:** Sahip'in raporlara, haritaya, ağaç karnelerine ve görüntülere eriştiği web uygulaması.",
        "**Metodoloji:** Değerlendirmede kullanılan, sürümü raporda belirtilen ölçek ve kurallar.",
        "**Üyelik dönemi:** İlk siparişin (ya da yenilemenin) hizmet başlangıcından bitişine kadar geçen süre. Ek siparişler temel siparişle aynı gün biter; böylece aynı üyelik dönemindeki bütün bahçelerin hizmeti aynı gün biter. Sahip'in birden fazla üyelik dönemi olabilir (örneğin teklifte ayrı dönem yazıyorsa); her dönem kendi bitiş gününe göre yürür (Madde 12/2).",
        "**Ek sipariş:** Üyelik dönemi içinde yeni bir bahçe için verilen ve hizmeti üyelik döneminin bitiş gününde biten sipariş (Madde 8D).",
        "**Ziyaret hakkı:** Bir bahçe için siparişte yazan periyodik ziyaret sayısı. Tam yıllık siparişte paketteki yıllık ziyaret sayısıdır; ek siparişte Madde 8D/2'ye göre hesaplanır.",
        "**Çıkış günü:** Hizmetten çıkarılan bahçenin hizmette olmadığı ilk gün. Bahçenin son hizmet günü bir önceki gündür.",
      ],
    },
    { kind: "h2", text: "Madde 4 – Hizmetin kapsamı" },
    {
      kind: "ol",
      items: [
        "**Envanter:** Bir kez yapılır; tarihi taraflarca belirlenir.",
        "**Periyodik ziyaretler:** Yılda paketteki sayıda periyodik ziyaret yapılır; sayı teklifte yazar. Dört ziyaretli pakette kış, ilkbahar, yaz ve hasat pencerelerinde birer ziyaret yapılır. Ziyaret pencereleri Ek-2'dedir; kesin tarihler Şirket tarafından hava ve erişim koşullarına göre belirlenir ve Madde 8A/1'e göre önceden bildirilir.",
        "**Rapor:** Her ziyaretten sonra en geç 15 iş günü içinde portalda yayımlanır.",
        "**Kritik bulgu bildirimi:** Ağaç kaybı, hırsızlık izi, yangın riski gibi acil bir durum, uzman onayıyla raporu beklemeden bildirilir. Kritik bulgu bildirimi bekçilik ya da sürekli izleme hizmeti değildir; yalnızca ziyarette görülen bulgular için yapılır.",
        {
          text: "**Hizmetin kapsamında olmayanlar:**",
          children: [
            "Bahçede bakım, ilaçlama, budama gibi işlerin yapılması",
            "Hastalık teşhisi ve laboratuvar analizi",
            "Verim ya da gelir tahmini ve garantisi",
            "Mülkiyet ve sınır tespiti",
            "Bekçilik",
          ],
        },
      ],
    },
    { kind: "h2", text: "Madde 5 – Sahip'in yükümlülükleri" },
    {
      kind: "ol",
      items: [
        "Sahip, Bahçe'nin maliki, paydaşı (hisseli tapuda rızai taksimle kullandığı bölüm dahil), mirasçısı ya da malikin veya paydaşların izniyle Bahçe'yi kullanan kişi (vekil, kiracı, ortakçı) olduğunu ve Şirket personelinin Bahçe'ye girmesine izin vermeye yetkili olduğunu beyan eder; dayanağını başvuruda seçer. Şirket belge istemekle yükümlü değildir. Şüphe ya da itiraz halinde tapu kaydı, vekâletname, mirasçılık belgesi ya da kira sözleşmesi gibi dayanak belgesini görmek isteyebilir; görülen belgenin türü ve tarihi kaydedilir, kopyası saklanmaz. Beyanın gerçeğe aykırı olmasından doğan üçüncü kişi taleplerinden, Şirket'in kusuru bulunmadıkça Sahip sorumludur. Bir malik, paydaş ya da mirasçı itiraz ederse Madde 6/4 uygulanır.",
        "Şirket personelinin ziyaret pencerelerinde Bahçe'ye girmesine izin verir ve erişimi sağlar: kapı, anahtar, bekçi.",
        "Envanter ziyaretinde kullanım sınırını kendisi ya da yetkilendirdiği kişi aracılığıyla gösterir.",
        "Şirket'in bildirdiği ziyaret tarihini ve Şirket'in sağladığı kısa bilgilendirmeyi Bahçe'de çalışacak kişilere (işçi, yevmiyeci, bekçi) önceden iletir. Bu yükümlülük, Şirket'in Kanun md. 10'daki aydınlatma yükümlülüğünü ortadan kaldırmaz; Şirket ayrıca sahada bilgilendirme yapar (Madde 9/2).",
        "İletişim bilgilerindeki değişiklikleri bildirir.",
        "Sahip, sınırı gösterecek kişi ya da hissedar olarak bilgilerini Şirket'e verdiği kişileri, bilgilerinin hizmetin yürütülmesi amacıyla Şirket'e verildiği ve Şirket'in kendileriyle iletişime geçebileceği konusunda bilgilendirir. Erişim notuna bu amaçla gerekli olmayan kişisel bilgi yazmaz. Bu yükümlülük, Şirket'in bu kişileri ilk iletişimde bilgilendirme yükümlülüğünü ortadan kaldırmaz.",
      ],
    },
    { kind: "h2", text: "Madde 6 – Sınır ve konum bilgileri" },
    {
      kind: "ol",
      items: [
        "Haritada gösterilen sınır, Sahip'in ya da yetkilendirdiği kişinin gösterdiği **fiili kullanım sınırıdır**. Tapu sınırı, kadastro ölçümü, mülkiyet ya da kullanım hakkı tespiti değildir; resmi bir sınır belirlemez. Sınır ve mülkiyet uyuşmazlıklarında kanıt olarak sunulmak üzere hazırlanmamıştır. Bu ibare her raporda ve haritada yer alır.",
        "Sahip, gösterdiği ya da yetkilendirdiği kişiye gösterttiği sınırın fiilen kendi kullanımındaki alanı yansıttığını ve bu alana Şirket personelinin girmesine izin vermeye yetkili olduğunu beyan eder. Şirket bu beyanın doğruluğunu araştırmakla yükümlü değildir. Beyanın gerçeğe aykırı olmasından doğan üçüncü kişi taleplerinden, Şirket'in kusuru bulunmadıkça Sahip sorumludur.",
        "Envanterden sonra Sahip, sınırı ve ağaç listesini portalda inceler ve onaylar. Sahip sonradan bir hata fark ederse (örneğin komşu ağaçlarının envantere girmesi) portaldan bildirir. Hata eldeki verilerle ücretsiz düzeltilir; düzeltme için sahada ölçüm gerekiyorsa bu ölçüm sonraki periyodik ziyarette ücretsiz yapılır. Düzeltme sonucunda doğrulanan alan küçülürse kalan ziyaretlerin bedeli yeni alana göre yeniden hesaplanır ve fark iade edilir; alan büyürse o dönem için fark istenmez.",
        "Bahçe'nin sınırına ya da kullanımına üçüncü bir kişi itiraz ederse Şirket, uyuşmazlık konusu alanı uyuşmazlık çözülene kadar değerlendirme dışında bırakabilir; bu alan raporda \"değerlendirilmedi\" olarak gösterilir. İtiraz Bahçe'nin tamamını kapsıyorsa Şirket taramayı askıya alabilir. Askı ziyaret penceresinin sonuna kadar sürerse Şirket Bahçe'yi Madde 12/3'e göre hizmetten çıkarabilir; kullanılmayan ziyaretlerin bedeli iade edilir.",
        "Şirket, raporları ve haritayı sınır ve mülkiyet uyuşmazlıklarında taraflardan biri lehine kanıt ya da bilirkişi görüşü olarak düzenlemez; kanuni zorunluluklar saklıdır.",
      ],
    },
    { kind: "h2", text: "Madde 7 – Değerlendirmenin niteliği" },
    {
      kind: "ol",
      items: [
        "Raporlar, Bahçe'nin ziyaret tarihindeki **görünür durumunu** yansıtır. Ağaç sınıfları ve bulgular, görüntülere ve sahada yapılan gözlemlere dayanır.",
        "Değerlendirmelerde yapay zekâ ön değerlendirmesinden yararlanılabilir. Raporda yer alan her sonuç Uzman tarafından incelenir ve onaylanır.",
        "Değerlendirme hastalık teşhisi, laboratuvar analizi ya da verim garantisi değildir. Uzman önerilerini mesleki özenle verir; öneriler tavsiye niteliğindedir ve uygulanıp uygulanmayacağına Sahip karar verir.",
        'Görüntülerin alınamadığı ya da yetersiz kaldığı ağaçlar raporda "değerlendirilmedi" olarak belirtilir.',
        "Kullanılan metodoloji sürümü her raporda belirtilir.",
      ],
    },
    { kind: "h2", text: "Madde 8 – Ücret ve ödeme" },
    {
      kind: "ol",
      items: [
        "**Yıllık hizmet bedeli:** Teklifte yazan tutardır. Yıllık ziyaret sayısı, doğrulanan alan (dönüm) ve paketin dönüm ve ziyaret başı birim fiyatının çarpımıdır; bahçe başına en az ücret ve ilk yıl bir kez envanter ücreti eklenir. KDV ayrıca gösterilir. Teklif, geçerlilik süresi içinde değişmez. Teklifte her bahçe ayrı bir satırdır ve satırın tutarı ayrıca gösterilir. Üyelik dönemi içinde eklenen bahçenin bedeli Madde 8D'ye göre hesaplanır.",
        "**Ödeme:** Teklif onaylandıktan sonra peşin ve tek çekimdir: kartla (3D Secure, [ödeme kuruluşu: iyzico] üzerinden) ya da havale/EFT ile. Kart bilgileri Şirket'e ulaşmaz. Şirket, ödeme yöntemlerinin hiçbiri için toplam bedelin dışında ücret almaz; havale/EFT ile ödemede Sahip'in kendi bankasının alabileceği gönderim ücreti Sahip'e aittir. Hizmet, ödeme tamamlanmadan başlamaz. Ödeme siparişte yazan ödeme süresi içinde yapılmazsa Şirket ek süre vermeden siparişi iptal edebilir ya da ödeme süresini uzatabilir; uzatma Sahip'e bildirilir. Sahip de ödemeden önce siparişi bedelsiz iptal edebilir (Madde 8C/1). Sipariş iptal edilmedikçe süre geçtikten sonra yapılan ödeme kabul edilir ve sipariş etkinleşir; ek siparişte Madde 8D/5 ve 8D/6 saklıdır. Ödenmeyen sipariş için taraflar birbirinden bedel, faiz ya da tazminat istemez.",
        "**Belge:** Her ödeme için portalda bir makbuz verilir; makbuz fatura değildir. Fatura, ödemenin tamamlandığı gün ya da en geç 7 gün içinde, Sahip'in fatura profilindeki bilgilerle elektronik ortamda düzenlenir (e-Fatura mükellefi Sahip'e e-Fatura, diğerlerine e-Arşiv Fatura) ve portalda ve SMS bağlantısıyla iletilir. İadelerde vergi mevzuatına uygun düzeltme belgesi düzenlenir; her iadenin KDV payı ayrıca gösterilir.",
        '**Pilot dönemi:** [Şirket kararıyla doldurulur: "[başlangıç]–[bitiş] arasında kurulan sözleşmelerde ilk hizmet yılının bedeli ücretsizdir" ya da "… %[oran] indirimlidir"; envanter ücreti [alınmaz / …]]. Pilot sonunda ücretli döneme kendiliğinden geçilmez; devam için yenileme teklifi onaylanır ve ödenir. İndirim teklif satırında ayrıca gösterilir.',
        "**Hizmetin başlaması:** Hizmet yılı ödemenin tamamlandığı gün (teklifte daha ileri bir başlangıç günü yazıyorsa o gün) başlar ve bir yıl sürer. Bu süre üyelik dönemidir. Ek siparişin hizmeti Madde 8D'ye göre başlar ve üyelik döneminin bitiş gününde biter.",
      ],
    },
    { kind: "h2", text: "Madde 8A – Yapılamayan ziyaretler" },
    {
      kind: "ol",
      items: [
        "**Ziyaret tarihi:** Şirket her periyodik ziyaretin tarihini Sahip'e en az 3 gün önce SMS ya da telefonla bildirir. Sahip ziyaretten en geç 24 saat önce bir kez erteleme isteyebilir; ziyaret aynı pencere içinde yeniden planlanır.",
        "**Sahip'ten kaynaklanmayan nedenler:** Hava, Sahip'ten kaynaklanmayan erişim engelleri (yolun kapanması, sel, resmi yasak gibi), mücbir sebep ya da Şirket'ten kaynaklanan bir nedenle yapılamayan ziyaret aynı ziyaret penceresi içinde yeniden planlanır. Pencere içinde yapılamazsa o ziyaretin bedeli Sahip'e iade edilir. Ziyaret bedeli, Bahçe'nin teklif satırındaki tutardan envanter payı çıkarıldıktan sonra kalanın, o satırdaki ziyaret hakkına bölünmesiyle bulunur. Tam yıllık siparişte bu, yıllık bedelin (envanter ücreti hariç) paketteki yıllık ziyaret sayısına bölünmesidir. Şirket iadeyi Sahip'in talebini beklemeden başlatır; iade, ödemenin yapıldığı yöntemle ve pencerenin bitiminden sonra en geç 14 gün içinde yapılır. Sahip isterse, iade yerine ziyaret aynı üyelik dönemindeki bir sonraki pencereye aktarılır; aktarma Sahip'in portal ya da yazılı talebiyle yapılır ve dönemin son penceresinden sonraya aktarma yapılmaz.",
        "**Sahip'ten kaynaklanan nedenler:** Sahip'in Madde 5/2–3'teki yükümlülüklerini (erişimin sağlanması: kapı, anahtar, bekçi; sınırı gösterecek kişinin bulunması) bildirilen ziyaret gününde yerine getirmemesi nedeniyle ziyaret yapılamazsa Şirket durumu belgeler (zaman damgalı fotoğraf ve not), aynı gün Sahip'e bildirir ve aynı pencere içinde en az bir yeni tarih önerir. Önerilen tarihte de ziyaret aynı nedenle yapılamazsa ziyaret yapılmış sayılır ve iade yapılmaz. Pencere içinde yeni bir tarih önerilemiyorsa 2. fıkra uygulanır.",
        "Mücbir sebep halinde Madde 13 ve bu maddenin 2. fıkrası uygulanır.",
        "Bu madde uyarınca bir Bahçe için yapılmış iade, aynı Bahçe daha sonra hizmetten çıkarılırsa Madde 12/3'e göre hesaplanan iadeden düşülür. Bedeli bu maddeye göre iade edilmiş ziyaret, Madde 12/3'teki hesapta kullanılmamış ziyaret sayılır; düşme, aynı ziyaretin bedelinin iki kez iade edilmesini önler.",
        "Şirket, her ziyaret penceresinin ve hizmet döneminin sonunda yapılamayan ziyaretleri kendiliğinden tespit eder; Sahip'in talebini beklemeden bu maddeye göre iade eder ya da Sahip isterse aktarır.",
      ],
    },
    { kind: "h2", text: "Madde 8B – Cayma hakkı" },
    {
      kind: "ol",
      items: [
        "Sözleşme portalda kurulmuşsa Sahip, **14 gün** içinde hiçbir gerekçe göstermeden ve cezai şart ödemeden cayabilir. Kanuni cayma süresi sözleşmenin kurulduğu (teklifin onaylandığı) gün başlar; Şirket, Sahip lehine olarak süreyi ödemenin tamamlandığı (siparişin etkinleştiği) günden başlatır. Hizmetin başlangıcı teklifte daha ileri bir gün olsa bile (örneğin yenilemede) süre bu günden sayılır. Sürenin son günü ödeme gününden 14 gün sonraki gündür ve süreye dahildir; örneğin ödemesi 1 Mart'ta tamamlanan siparişte 15 Mart. Cayma süresi hizmet başlamadan dolmuşsa Sahip Bahçe'yi Madde 12/3'e göre hizmetten çıkarabilir; hiç ziyaret yapılmadığı için envanter payı dışındaki tutarın tamamı, envanter de yapılmadıysa satırın tamamı, ödenmiş ve başlamamış yenilemede satırın tamamı iade edilir. Ek siparişin cayma süresi Madde 8D/7'dedir.",
        "Cayma bildirimi portaldan, [e-posta] ya da [KEP] adresine ya da [Adres]'e yazılı olarak yapılır. Ek-7'deki örnek cayma formu kullanılabilir; açık bir yazılı beyan da yeterlidir. Bildirimde bir Bahçe belirtilmişse cayma yalnızca o Bahçe için kullanılmış olur. Süre içinde gönderilen bildirim yeterlidir. Şirket bildirimin alındığını gecikmeksizin SMS ile ve portalda teyit eder.",
        "Şirket, cayma bildiriminin kendisine ulaştığı günden itibaren en geç **14 gün** içinde tahsil ettiği tutarın tamamını, ödemenin yapıldığı yöntemle ve Sahip'e bir masraf yüklemeden iade eder; 4. fıkradaki kesintiler saklıdır.",
        "**Hizmete cayma süresi içinde başlanması:** Sahip, teklifi onaylarken ayrı ve işaretsiz bir kutuyu işaretleyerek hizmete (envanter ve periyodik ziyaretler) cayma süresi dolmadan başlanmasını talep edebilir. Bu talep yoksa Şirket cayma süresi bitmeden Bahçe'de envanter ve ziyaret yapmaz. Talep üzerine hizmete başlandığında Mesafeli Sözleşmeler Yönetmeliği md. 15/1-(h) uyarınca kanuni cayma hakkı sona erer. Şirket buna rağmen, cayma süresinin sonuna kadar Sahip'e aynı yollarla kullanılabilecek, sözleşmeden doğan bir cayma hakkı tanır; bu hak bütün bahçeler için ya da 5. fıkraya göre tek bir Bahçe için kullanılabilir. Bu hak kullanılırsa, envanter sayımı yapıldıysa envanterin payı ve yapılmış periyodik ziyaretlerin bedeli (Madde 8A/2'deki ziyaret bedeliyle) iadeden düşülür ve kalan tutar 3. fıkradaki gibi iade edilir. Düşülen tutar yapılmış hizmetin sözleşmedeki bedelidir, cezai şart değildir. Envanter payı Madde 12/3'teki gibi hesaplanır. Hizmete başlanmadan kullanılan caymada tahsil edilen tutarın tamamı iade edilir.",
        '**Tek bahçe için cayma:** Siparişte birden fazla Bahçe varsa Sahip cayma hakkını yalnızca bir Bahçe için de kullanabilir. Portalda Bahçe\'yi hizmetten çıkarırken "Cayma hakkımı kullanıyorum" seçeneğini **açıkça** seçer. Bu seçenek yalnızca cayma süresi içinde gösterilir; Bahçe aynı gün hizmetten çıkar ve o Bahçe\'nin satır tutarı 4. fıkradaki kesintilerle iade edilir. Madde 12/3\'teki zamanlama seçenekleri ("hemen", "30 gün sonra", "dönem sonunda") cayma bildirimi sayılmaz. Cayma süresi içinde başka bir zamanlama seçilirse portal, bu seçimin cayma bildirimi olmadığını ve cayma hakkının sürdüğünü gösterir.',
        "Sahip tacir Sahip ise (Madde 1), Şirket bu maddedeki cayma hakkını aynı koşullarla sözleşmeye dayanarak tanır.",
      ],
    },
    { kind: "h2", text: "Madde 8C – Ödeme sonrası iptal ve iade" },
    {
      kind: "ol",
      items: [
        "Ödemeden önce Sahip siparişi portaldan iptal edebilir; bir bedel doğmaz.",
        "Cayma süresinden sonra yapılan fesihte ve bahçe çıkarmada Madde 12/3 uygulanır.",
        "İade yöntemi ve süreleri [İptal ve İade Politikası](/iade)'nda yazılıdır.",
      ],
    },
    { kind: "h2", text: "Madde 8D – Dönem içinde bahçe ekleme" },
    {
      kind: "ol",
      items: [
        "**Ek sipariş:** Sahip üyelik dönemi içinde portaldan yeni bir bahçe için başvurabilir. Şirket alanı ve konumu doğrular ve **ek teklif** verir. Ek teklif üyeliğin paketiyle ve teklif günü yürürlükte olan yayımlı fiyat listesiyle hesaplanır. Ek siparişin hizmeti, ödemenin tamamlandığı gün (teklifte daha ileri bir başlangıç günü yazıyorsa o gün) başlar ve üyelik döneminin bitiş gününde biter. Eklenen bahçe Ek-1'e girer ve sonraki yenileme teklifine dahil edilir.",
        "**Ziyaret hakkı:** Paketteki yıllık ziyaret sayısı, kalan günün dönemin toplam gününe oranıyla çarpılır. Kalan gün, ek teklifte yazan başlangıç günü (teklif gününden önce olamaz) ile dönemin bitiş günü arasındaki gün sayısıdır (ikisi de dahil). Sonuç en yakın tam sayıya yuvarlanır, yarım yukarı yuvarlanır; en az 1, en çok yıllık ziyaret sayısıdır. Ziyaret hakkı ek teklifte yazılır ve sabittir; ödeme daha sonraki bir gün yapılsa da değişmez. Ek teklif hesabın adımlarını rakamla gösterir: kalan gün ve dönemin toplam günü, ham sonuç ve yuvarlanmış ziyaret hakkı (örneğin 2,35 → 2; 2,5 → 3), ziyaret tutarı, orantılı en az ücret ve hangisinin alındığı, envanter ücreti, KDV, toplam ve aynı bahçenin tam yıllık bedeli; ayrıca kullanılan fiyat listesinin adını ve dönemde kalan ziyaret pencerelerini yazar. Şirket ek teklifin başlangıç gününü, ziyaret hakkı dönemde kalan ziyaret pencerelerinin sayısını aşmayacak biçimde belirler. Sahip'ten teklifte yazan toplam dışında bir bedel istenmez.",
        "**Bedel:** Ziyaret tutarı, ziyaret hakkı × doğrulanan alan (dönüm) × paketin dönüm ve ziyaret başı birim fiyatıdır. Bahçe başına en az ücret aynı oranla (ziyaret hakkı ÷ yıllık ziyaret sayısı) orantılanır ve ikisinden büyük olanı alınır. Envanter ücreti, envanter tek seferlik bir iş olduğu için tam alınır. Daha önce hizmetten çıkarılıp, son yayımlanmış envanterinin tarihinden itibaren 24 ay içinde yeniden eklenen ve sınırı ile ağaç düzeni esaslı biçimde değişmemiş bahçeden envanter ücreti alınmaz; bu süre geçmişse ya da yeni envanter gerekiyorsa envanter ücreti ek teklifte gerekçesiyle ayrı satır olarak gösterilir. KDV ayrıca gösterilir.",
        {
          text: "**Örnek** (bilgi amaçlıdır; tutarlar lansman fiyat listesinin Standart paketinden alınmıştır, güncel fiyat ek teklifte yazar):",
          children: [
            "Üyelik dönemi 1 Kasım 2026–31 Ekim 2027 (365 gün). Paket yılda 4 ziyaret; birim fiyat 180,00 TL (dönüm·ziyaret), bahçe başına en az ücret 11.200,00 TL, envanter ücreti 6.000,00 TL (KDV hariç), KDV %20.",
            "15 dönümlük ek bahçenin hizmeti 1 Nisan 2027'de başlıyor. Kalan 214 gün: 4 × 214 ÷ 365 = 2,35 → **2 ziyaret**.",
            "Ziyaret tutarı 2 × 15 × 180,00 = 5.400,00 TL. Orantılı en az ücret 11.200,00 × 2 ÷ 4 = 5.600,00 TL; büyük olan 5.600,00 TL alınır. Yeni bahçe olduğu için envanter ücreti 6.000,00 TL eklenir. KDV dahil **13.920,00 TL**. Aynı bahçenin envanterle tam yıllık bedeli 20.640,00 TL olurdu.",
          ],
        },
        "**Son ek günü:** Ek teklif, dönemin bitişine (bitiş günü dahil) en az 30 gün kalan son güne kadar geçerlidir; örnekte 2 Ekim 2027. Ek teklif en geç bu gün onaylanır ve ödenir; bu günden sonra onaylanamaz ve kartla ödenemez. Daha sonra gelen bahçe, yenileme ödenip yeni dönem başlayınca yeni döneme tam yıl olarak eklenir.",
        "**Dönem kapanırsa:** Ödeme alındıktan sonra, ancak ek sipariş başlamadan önce üyelik dönemi sona ermiş ya da son ek günü geçmişse (örneğin geç kaydedilen bir havale ya da incelemede kalan bir kart ödemesi), ek sipariş başlamaz ve iptal edilir. Ödenen tutarın tamamı Madde 8B/3'teki gibi iade edilir. İptal Sahip'e SMS ile bildirilir; tutar en geç 14 gün içinde ödemenin yapıldığı yöntemle ve masrafsız iade edilir.",
        "**Ek siparişin niteliği, ödemesi ve cayma süresi:** Ek sipariş, bu sözleşmenin hükümlerine tabi; kendi teklifi, ön bilgilendirmesi, onayı, bedeli, ödemesi, makbuzu ve cayma süresi olan ayrı bir mesafeli sözleşmedir. Her ek teklif onayından önce Ön Bilgilendirme Formu o teklifin bilgileriyle gösterilir ve ayrıca onaylanır. Cayma süresi, Madde 8B/1'deki gibi ek siparişin ödemesinin tamamlandığı (ek siparişin etkinleştiği) günden itibaren 14 gündür; son gün dahildir. Ek siparişte cayma diğer siparişleri, diğer siparişlerde cayma ek siparişi etkilemez. Cayma Madde 8B'ye göre kullanılır.",
        "Ek sipariş, bu maddede yazılanlar dışında bu sözleşmenin hükümlerine tabidir.",
      ],
    },
    { kind: "h2", text: "Madde 9 – Kişisel veriler ve gizlilik" },
    {
      kind: "ol",
      items: [
        "Şirket, kişisel verileri Kişisel Verilerin Korunması Kanunu'na ve Ek-3'teki Aydınlatma Metni'ne uygun olarak işler.",
        "Görüntülerde Bahçe'de bulunan kişiler görünebilir. Bu görüntüler yalnızca hizmet amacıyla işlenir. Sahip, Sahip'in davet ettiği hissedarlar, Uzman, saha personeli ve Aydınlatma Metni'nde sayılan hizmet sağlayıcılar dışında kimseyle paylaşılmaz. Şirket görüntülerdeki kişilerin kimliğini tespit etmez. Tarama günü Bahçe girişine bilgilendirme levhası konur.",
        "Şirket, Sahip'e ait bilgileri ve raporları gizli tutar. Sahip'in yazılı izni olmadan üçüncü kişilere açıklamaz; kanuni zorunluluklar hariç.",
        "**Hissedarlar:** Sahip, portalda hissedarlarını izleyici olarak ekleyebilir. Hissedarlar Bahçe'nin raporlarını görür; Sahip'in fatura ve iletişim bilgilerini ve soru-cevaplarını görmez. Sahip, davet ettiği kişinin Bahçe'de hakkı bulunduğunu ve telefon numarasını Şirket'e vermeye yetkili olduğunu beyan eder. Şirket hissedarı ilk iletişimde Aydınlatma Metni hakkında bilgilendirir.",
        "Sahip, Madde 10/1 uyarınca paylaştığı görüntülerde tanınabilen kişiler bakımından kişisel verilerin korunmasına ilişkin mevzuata uymakla kendisi yükümlüdür.",
      ],
    },
    { kind: "h2", text: "Madde 10 – Fikri haklar ve verinin kullanımı" },
    {
      kind: "ol",
      items: [
        "Raporlar ve görüntüler, Sahip'in Bahçe'ye ilişkin kendi kullanımı için sunulur. Sahip bunları serbestçe kullanabilir ve paylaşabilir.",
        "Değerlendirme yöntemi, yazılım ve metodoloji Şirket'e aittir.",
        "Şirket, hizmetin ve değerlendirme yöntemlerinin geliştirilmesi (yapay zekâ ön değerlendirmesinin uzman kararlarıyla doğrulanması ve kalibrasyonu, metodoloji güncellemesi, kalite ölçümü dahil) amacıyla Bahçe'ye ait görüntüleri ve değerlendirmeleri yalnızca Şirket içinde, erişimi sınırlı olarak ve Sahip'in adı, iletişim ve tapu bilgileriyle ilişkilendirmeden kullanabilir (KVKK md. 5/2-f; Sahip itiraz edebilir). Bu veriler Şirket dışındaki kişilerle paylaşılmaz ve yayımlanmaz; yurt dışındaki hizmet sağlayıcıların kullanımı Aydınlatma Metni'ndeki güvencelere tabidir. Görüntülerin ya da Bahçe verilerinin Şirket dışına verilmesi, yayımlanması ya da tanıtımda (örneğin demo vitrininde) kullanılması Sahip'in ayrı yazılı açık rızasına bağlıdır. Konum ve kişi bağlantısı çıkarılarak tamamen anonim hale getirilmiş toplu istatistikler bu sınırlamaya tabi değildir.",
      ],
    },
    { kind: "h2", text: "Madde 11 – Sorumluluk" },
    {
      kind: "ol",
      items: [
        "Şirket hizmeti özenle ve metodolojiye uygun olarak yürütür; kusuruyla neden olduğu zarardan kanuna göre sorumludur.",
        "Şirket'in edimi, Bahçe'nin ziyaret tarihlerindeki görünür durumunun değerlendirilmesi ve raporlanmasıdır. Şirket, kendi kusurundan kaynaklanmayan şu sonuçlardan sorumlu değildir: Bahçe'deki ürün kaybı, hırsızlık, hastalık ve zararlıların kendisi ve sonuçları; Sahip'in önerileri uygulayıp uygulamamasının sonuçları; ziyaret aralarında oluşan ve ziyarette görülemeyen değişiklikler. Ziyaretler ve kritik bulgu bildirimi, Bahçe'deki her riskin tespit edileceğini garanti etmez.",
        "**Sahip tacir Sahip ise (Madde 1): Şirket'in hafif kusurundan doğan sorumluluğu, zararın doğduğu üyelik döneminde ilgili Bahçe için ödenen hizmet bedeliyle sınırlıdır ve dolaylı zararları (kâr kaybı, ürün değeri kaybı) kapsamaz. Bu sınırlama kast ve ağır kusurda, ölüm ve bedensel zararlarda uygulanmaz.**",
        "Tüketici Sahip bakımından kanunun emredici hükümleri saklıdır.",
      ],
    },
    { kind: "h2", text: "Madde 12 – Süre ve fesih" },
    {
      kind: "ol",
      items: [
        "Sözleşme, kurulduğu anda (portalda teklifin onaylanmasıyla, kâğıtta imzayla) yürürlüğe girer. Hizmet yılı Madde 8/5'e göre başlar ve 1 yıl sürer; bu süre bir yılı aşmaz. Ek siparişler bu sürenin sonunda biter (Madde 8D).",
        {
          text: "**Yenileme:** Hizmet yılı bitmeden en az 45 gün önce Şirket, Sahip'e portalda yenileme teklifi gönderir. Yeni dönemin fiyatı o gün yayımlı fiyat listesine göre hesaplanır.",
          children: [
            "Yenileme teklifi, o gün hizmette olan **bütün bahçeleri**, ek siparişle eklenenler dahil, tek teklifte kapsar. Hizmetten çıkmakta olan bahçe yenilemeye girmez. Sahip'in birden fazla üyelik dönemi varsa her dönemin yenileme teklifi ayrı verilir; Şirket, yenileme zamanında bahçeleri ek teklifle tek döneme toplamayı önerebilir.",
            "Sözleşme **kendiliğinden uzamaz ve kart otomatik olarak çekilmez.** Bu kural kâğıt üzerinde kurulan sözleşmeler için de geçerlidir. Sahip yenileme teklifini onaylayıp ödediğinde yeni hizmet yılı, önceki yılın bitişinin ertesi günü başlar.",
            "Yenileme, ayrı bir mesafeli sözleşmedir; onaydan önce Ön Bilgilendirme Formu o teklifin bilgileriyle gösterilir ve onaylanır, yeni bir cayma süresi başlar (Madde 8B/1).",
            "Sahip yenileme teklifini onaylamazsa hizmet yılın sonunda biter ve 4. fıkra uygulanır.",
          ],
        },
        {
          text: '**Fesih ve bahçe bazında çıkarma:** Sahip sözleşmeyi bütün bahçeler için ya da yalnızca bir Bahçe için dilediği zaman feshedebilir; fesih, Sahip\'in seçtiği çıkış gününde hüküm doğurur. Şirket ise yalnızca aşağıda sayılan sebeplerle feshedebilir. Bahçe bazında fesih "bahçe çıkarma"dır.',
          children: [
            {
              text: "**Talep:** Sahip portalda Bahçe'nin sayfasından ya da Hesabım › Bahçelerim'den talepte bulunur; nedenini ve zamanını **açıkça** seçer (varsayılan seçenek yoktur):",
              children: [
                "**hemen:** çıkış günü talep gününün ertesi günüdür;",
                "**30 gün sonra:** çıkış günü, talep gününden 30 gün sonrası ile Bahçe'nin hizmet döneminin bitişinin ertesi gününden hangisi önce geliyorsa odur;",
                "**dönem sonunda:** çıkış günü, Bahçe'nin hizmet döneminin bitişinin ertesi günüdür;",
                "**cayma hakkıyla bugün:** yalnızca cayma süresi içinde ve Madde 8B/5'e göre.",
              ],
            },
            "**Kendiliğinden hüküm:** Talep, Şirket'in onayını beklemeden çıkış gününde hüküm doğurur. Şirket çıkış tarihini teyit eder; tarih yalnızca Sahip'le anlaşarak değiştirilebilir ve Sahip'e SMS ile bildirilir. Sahip, çıkış gününe kadar talebini portaldan geri alabilir.",
            "**Şirket'in çıkarması:** Şirket bir Bahçe'yi yalnızca şu haklı sebeplerle hizmetten çıkarabilir: Bahçe'nin hizmet bölgesi dışında kalması; Sahip'in Madde 5'teki yükümlülüklerini esaslı biçimde ya da tekrar tekrar ihlal etmesi (örneğin iki ziyaret penceresi boyunca erişimin sağlanamaması); Sahip'in yetkisinin bulunmaması ya da Madde 6/4'teki üçüncü kişi itirazı; personelin güvenliğini tehdit eden bir durum; Bahçe'nin devri (satış); mükerrer kayıt; Şirket'in bölgede hizmeti bütünüyle sona erdirmesi. Şirket çıkarmayı en az 30 gün önceden Sahip'e SMS ile bildirir; güvenlik tehdidi, mükerrer kayıt, yetkisizlik ve üçüncü kişi itirazı hallerinde bildirim süresi aranmaz. Bahçe Sahip'le anlaşarak da hizmetten çıkarılabilir; bu durumda Sahip'in onayı yazılı olarak kaydedilir. Şirket'in çıkarmasında kullanılmayan bütün ziyaretlerin bedeli iade edilir; bildirim süresi içinde Şirket ziyaret yapmazsa o ziyaretler kullanılmamış sayılır. Bahçe'nin devrinde (satış) Madde 12/4'teki erişim süresi uygulanmaz.",
            "**Ödeme bekleyen sipariş:** Bahçe, ödemesi beklenen bir siparişte de yer alıyorsa (örneğin onaylanmış ama ödenmemiş bir yenileme), o sipariş iptal edilmeden ya da düzeltilmeden çıkarma talebi alınmaz. Portal, aynı işlemde bekleyen siparişi iptal etme seçeneği sunar.",
            "**Çıkış gününde:** Bahçe'nin bütün planlı ziyaretleri iptal edilir ve Bahçe pasif olur. Çıkış gününden önce yapılmış ziyaretlerin raporları yayımlanır. Bahçe'nin verileri çıkışla silinmez; 4. fıkradaki gibi saklanır.",
            {
              text: "**İade hesabı:** Bahçe'nin teklif satırı esas alınır ve tutarlar KDV dahildir.",
              children: [
                "Envanter payı = satır tutarı × envanter ücreti ÷ satırın KDV ve indirim öncesi tabanı.",
                "Ziyaret bedeli = (satır tutarı − envanter payı) ÷ satırdaki ziyaret hakkı (Madde 8A/2); kuruşa aşağı yuvarlanır.",
                "İade = satır tutarı − (envanter yapıldıysa) envanter payı − kullanılmış ziyaret sayısı × ziyaret bedeli; böylece yuvarlamadan kalan kuruş farkı Sahip lehine iadeye girer. Hiç ziyaret yapılmadıysa satır tutarının envanter payı dışındaki tamamı, envanter de yapılmadıysa satırın tamamı iade edilir.",
                "Bu Bahçe'nin satırı için daha önce yapılmış ya da başlatılmış ziyaret ve hizmet bedeli iadeleri, Madde 8A iadeleri dahil, sonuçtan düşülür. Madde 8A'ya göre bedeli iade edilmiş ziyaret bu hesapta kullanılmamış ziyaret sayılır. Fazla ödemenin iadesi gibi Şirket kaynaklı iadeler düşülmez. Sonuç sıfırdan küçükse iade yapılmaz.",
                "Her iadenin KDV payı ayrıca gösterilir.",
              ],
            },
            "**Kullanılmış sayılan ziyaret:** Bahçe'nin hizmet başlangıcı ile çıkış gününden önceki gün arasında yapılmış periyodik ziyaretlerdir. Şirket'in kendi gerektirdiği yeniden taramalar (görüntü kalitesi ya da kapsama nedeniyle işleme hattının ya da Uzman'ın istediği ek ziyaretler) sayılmaz. Aynı gün yapılmış iki tarama bir ziyaret sayılır. Ziyaret hakkından fazlası sayılmaz. Madde 8A/3'e göre yapılmış sayılan ziyaret de kullanılmış sayılır. Raporu yayımlanamayan (örneğin veri kaybı nedeniyle) ziyaret kullanılmış sayılmaz; bu durumda fark Şirket tarafından ayrıca iade edilir.",
            "**Dönemi biten satır:** Hizmet dönemi çıkış gününden önce bitmiş bir satır bu iadeye girmez; o dönemde yapılamayan ziyaretlerin bedeli Madde 8A'ya göre, Sahip'in talebi beklenmeden iade edilir. \"Dönem sonunda\" seçeneğinde de aynı kural uygulanır.",
            "**Ödenmiş yenileme:** Bahçe'nin henüz başlamamış, ödenmiş bir yenileme satırı varsa o satırın tutarının tamamı iade edilir.",
            "**Mükerrer kayıt:** Aynı bahçe Şirket'in hatasıyla iki kez kaydedilmişse fazla kaydın satır tutarının tamamı iade edilir; yalnızca yapılmış ziyaretler düşülür.",
            {
              text: "**Örnekler** (bilgi amaçlıdır):",
              children: [
                "Satır tutarı 17.280,00 TL (KDV dahil, envanter ücreti yok; örneğin 20 dönümlük bir bahçenin Standart paketle yenileme yılı), ziyaret hakkı 4, yapılmış ziyaret 1. Ziyaret bedeli 4.320,00 TL; iade 17.280,00 − 1 × 4.320,00 = **12.960,00 TL** (KDV payı 2.160,00 TL).",
                "Aynı satırda 1 ziyaret yapılmış, 1 ziyaret yapılamamış ve Madde 8A'ya göre 4.320,00 TL daha önce iade edilmiş. Hesap 17.280,00 − 1 × 4.320,00 = 12.960,00 TL; önceki iade 4.320,00 TL düşülür ve iade **8.640,00 TL** olur (KDV payı 1.440,00 TL). Toplam iade 12.960,00 TL'dir, yani yapılmamış üç ziyaretin bedeli.",
              ],
            },
            "**İade yöntemi:** İade hesabı çıkış gününde yapılır; iade, çıkış gününden itibaren en geç 14 gün içinde ödemenin yapıldığı yöntemle ödenir ([İptal ve İade Politikası](/iade)). İadenin bir bahçeye ayrılamayan kısmı varsa Şirket iadeyi elle inceler; süre değişmez.",
            "**Son bahçe:** Sahip'in son Bahçe'si hizmetten çıktığında sözleşme bütünüyle sona erer.",
          ],
        },
        {
          text: "**Sözleşme bir Bahçe için sona erdiğinde** (3. fıkraya göre çıkarma, son Bahçe'nin çıkmasıyla sona erme, süresinin dolması ve yenilenmemesi ya da Şirket'in feshi dahil):",
          children: [
            "Sahip ve davet ettiği hissedarlar, çıkış gününden itibaren 90 gün boyunca Bahçe'nin raporlarını portalda **salt okunur** olarak görür ve indirebilir. Bu sürede soru sorulamaz ve yeni hissedar eklenemez. Erişim süresi içinde yenileme teklifi onaylanıp ödenirse erişim yeniden tam açılır.",
            "Erişim süresi en az 14 gün ise, erişimin bitmesinden 7 gün önce Sahip'e SMS ile hatırlatma gönderilir.",
            "Süre sonunda şu erişimler kaldırılır: Sahip'in kendi erişimi, Sahip'in davet ettiği hissedarların erişimi ve Bahçe'de başka bir sahip kalmıyorsa bütün hissedarların erişimi.",
            "Bahçe'de hizmet alan başka bir sahip varsa onun erişimi kendi sözleşmesi süresince sürer; çıkan Sahip'in soruları, cevapları ve kendisine ait bilgileri ona açılmaz. Şirket, kendi sözleşmesi sürmeyen kişilerin erişimini ya da yazılı bir gerekçeyle (devir, uyuşmazlık, mükerrer kayıt) bütün erişimleri kaldırabilir.",
            "Bahçe'nin devrinde (satış) erişim süresi uygulanmaz ve erişim çıkış gününde kaldırılır. Daha kısa bir erişim süresi yalnızca devirde, mükerrer kayıtta ya da yazılı bir gerekçeyle uygulanır. Devirde Şirket, çıkış gününden önce Sahip'e raporlarını indirebileceğini SMS ile bildirir; sonrasında raporların bir kopyası Sahip'in talebi üzerine verilir. Bahçe'yi devralan kişi, önceki Sahip'in raporlarına ve verilerine erişemez; önceki Sahip'in yazılı izni saklıdır.",
            "Erişim süresinin bitmesi verilerin silinmesi değildir; veriler Aydınlatma Metni §7'deki süreler boyunca saklanır ve sürenin sonunda silinir ya da anonim hale getirilir.",
          ],
        },
      ],
    },
    { kind: "h2", text: "Madde 13 – Mücbir sebep" },
    {
      kind: "p",
      text: "Doğal afet, salgın, olağanüstü hava koşulları, resmi yasaklar ve erişimin engellenmesi gibi tarafların kontrolü dışındaki hallerde yükümlülükler, engel süresince askıya alınır. Mücbir sebep nedeniyle ziyaret penceresi içinde yapılamayan ziyaret için Madde 8A/2 uygulanır.",
    },
    { kind: "h2", text: "Madde 14 – Tebligat ve iletişim" },
    {
      kind: "p",
      text: "Taraflar, Madde 1'deki adreslerini tebligat adresi olarak kabul eder. Hizmete ilişkin bildirimler SMS, e-posta ya da portal üzerinden yapılır; iletişim tercihi WhatsApp olan Sahip'e de bildirimler şimdilik SMS olarak gönderilir. Hizmete ilişkin bildirimler tanıtım içermez.",
    },
    { kind: "h2", text: "Madde 15 – Uyuşmazlıklar" },
    {
      kind: "ol",
      items: [
        "Tüketici Sahip, uyuşmazlıklarda Ticaret Bakanlığı'nca her yıl ilan edilen parasal sınırlar içinde yerleşim yerindeki ya da tüketici işleminin yapıldığı yerdeki tüketici hakem heyetine başvurabilir. Bu sınırların üzerindeki uyuşmazlıklarda tüketici mahkemesinde dava açılmadan önce arabulucuya başvurulması zorunludur; dava, Sahip'in yerleşim yerindeki ya da Şirket'in yerleşim yerindeki tüketici mahkemesinde açılabilir.",
        "Tacir Sahip ile bu sözleşmeden doğan uyuşmazlıklarda Gaziantep mahkemeleri ve icra daireleri yetkilidir; dava şartı arabuluculuğa ilişkin hükümler saklıdır.",
      ],
    },
    { kind: "h2", text: "Madde 16 – Yürürlük" },
    {
      kind: "p",
      text: "Bu sözleşme 16 maddeden ve eklerden oluşur. Kâğıt üzerinde [Tarih]'te iki nüsha olarak imzalanmıştır; portalda kurulduğunda teklifin onaylandığı anda kurulur ve yürürlüğe girer. Onaylanan sözleşme ve Ön Bilgilendirme Formu, Sahip'e özgü bilgiler ve teklif satırlarıyla birlikte PDF olarak Sahip'in portalında \"Sözleşmelerim\" bölümünde değiştirilmeden saklanır ve indirilebilir; bağlantısı onaydan sonra Sahip'e SMS ile gönderilir. Şirket bu kayıtları onay tarihinden itibaren 10 yıl saklar ve portal erişimi sona ermiş olsa bile Sahip'in talebi üzerine bir kopyasını verir.",
    },
    { kind: "table", head: ["Şirket", "Sahip"], rows: [["[Ad, imza]", "[Ad, imza]"]] },
    { kind: "p", text: "**Ekler**" },
    {
      kind: "ul",
      items: [
        "**Ek-1:** Bahçe listesi. Her bahçe için: il, ilçe, köy; tapu referansı (varsa); kaba konum; sınırı gösterecek kişi; erişim notu; hizmet başlangıcı ve siparişi. Ek siparişle eklenen bahçeler eklendikleri tarih ve sipariş numarasıyla, hizmetten çıkarılan bahçeler çıkış tarihiyle gösterilir. Portalda güncel liste ve geçmişi Hesabım › Bahçelerim'dedir; her siparişin sözleşme kopyasında o tarihteki bahçe satırları yer alır.",
        "**Ek-2:** Ziyaret pencereleri. Kış: Aralık–Şubat · İlkbahar: Nisan–Mayıs · Yaz: Haziran–Temmuz · Hasat: Ağustos–Ekim.",
        "**Ek-3:** Kişisel verilerin işlenmesine ilişkin aydınlatma metni.",
        "**Ek-4:** Açık rıza ve ticari elektronik ileti onayı metni (isteğe bağlı; İYS kaydından sonra sorulur).",
        "**Ek-5:** Ön bilgilendirme formu (yalnızca portalda kurulan sözleşmede).",
        "**Ek-6:** İptal ve iade politikası.",
        "**Ek-7:** Örnek cayma formu. (Mesafeli Sözleşmeler Yönetmeliği ekindeki formun uyarlamasıdır; kullanılması zorunlu değildir.) Kime: OBA Bilişim Teknolojileri LTD., [Adres], [E-posta], [KEP]. Bu formla aşağıdaki hizmetin sunulmasına ilişkin sözleşmeden cayma hakkımı kullandığımı beyan ederim. Sipariş numarası ve ödeme tarihi: … Cayma hakkına konu hizmet (bütün bahçeler ya da bahçenin adı): … Hizmetin bedeli: … Adı soyadı: … Adresi: … İmzası (yalnızca kâğıt üzerinde gönderilirse): … Tarih: …",
      ],
    },
  ],
};
