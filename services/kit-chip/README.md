# services/kit-chip — kitin kimlik çipi (DS2431)

Tarama kiti, fişinin içindeki bir **DS2431** (1-Wire EEPROM, 128 bayt) ile kendini robota tanıtır. Robot (`yusuftiryaki/hoverboard`) kit takılınca çipi okur:
- kitin türünü ve seri numarasını,
- takılı donanımı,
- sensörlerin kalibrasyonunu.

Kalibrasyondan kitin frame'lerini (`kit_gnss`, `kit_cam360`, `kit_lidar`) statik TF olarak yayınlar. Kalibrasyonun asıl kaynağı orchadOS'tur; bu araç manifesti üretip çipe yazar.

**Sözleşme:** `hoverboard/docs/kit-soketi.md`, "Kimlik çipinin içeriği (manifest)" ve "Repolar arası sözleşme". Uyulan sürüm: **manifest şema 1**. Referans okuyucu `hoverboard/ros2/src/robot_kit/robot_kit/manifest.py`; belgeyle çelişirse dosya geçerlidir. Özet: [docs/arayuzler.md](../../docs/arayuzler.md#kit-kimlik-çipi).

## Komutlar

```bash
uv sync
uv run pytest                     # ortak test vektörleri + negatif testler + sahte sysfs
uv run orchados-kit write manifest.json --out kit.bin   # donanımsız: imajı dosyaya yaz
uv run orchados-kit write manifest.json --dry-run       # imajı hex olarak bas
sudo uv run orchados-kit write manifest.json            # bus'taki tek DS2431'e yaz
uv run orchados-kit read                                # çipteki manifesti göster
uv run orchados-kit read --image kit.bin                # bir imaj dosyasını göster
```

`manifest.json`, ortak test vektörlerindeki `manifest` biçimindedir (`tests/vectors/kit_manifest_v1.json`).

## Yazma

- **Çip yolu:** Linux w1 sysfs, `/sys/bus/w1/devices/2d-*/eeprom`. Kullanılan çekirdek sürücüsü `w1_ds2431`, family 0x2d. Robot da çipi aynı yoldan okur.
- **Tek çip şartı:** Bus'ta tam olarak bir DS2431 yoksa araç hiçbir şey yazmaz.
- **Doğrulama:** Yazdıktan sonra çip geri okunur ve bayt bayt karşılaştırılır, ardından `decode` ile çözülür. Uyuşmazlık hata verir.
- **Geçersiz manifest:** Robotun reddedeceği bir manifest hiç kodlanmaz (`validate`), çipe dokunulmaz.
- **Donanımsız kullanım:** `--out` ile 128 baytlık imaj dosyaya yazılır. Robot tarafının sahte çipi (`FileEeprom`) aynı dosyayı okur.

> **Donanımda denenmedi.** Yazma yolu sadece sahte bir sysfs dizini ile test edildi. Gerçek bir DS2431'e henüz hiçbir şey yazılmadı.

## Test vektörleri

`tests/vectors/kit_manifest_v1.json`, robot reposundaki `ros2/src/robot_kit/test/vectors/kit_manifest_v1.json` dosyasının **değiştirilmemiş kopyasıdır**: 3 vektör, hoverboard commit `36f001a`. Her vektör için iki şey sınanır:
- `encode(manifest)`, `image_hex` ile bayt bayt aynı;
- `decode(image)` aynı manifesti float32 düzeyinde geri veriyor.

**Bu dosyayı tek taraflı değiştirme.** Format değişirse iki repo birlikte değişir.

## Kalibrasyondan manifest

Henüz yok. Açık sorular `docs/arayuzler.md`'de ("Kit kimlik çipi"):
- orchadOS'taki kalibrasyon kaydında `kit_mount` frame'i ve eksen yönleri tanımlı değil;
- `calib_id` için uint32 bir kimlik yok.

Bu sorular netleşene kadar manifest elle (JSON) yazılır.
