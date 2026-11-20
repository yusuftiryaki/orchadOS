# services/kit-chip — kitin kimlik çipi (DS2431)

Tarama kiti, fişinin içindeki bir **DS2431** (1-Wire EEPROM, 128 bayt) ile kendini robota tanıtır. Robot (`yusuftiryaki/maraba`, eski adı `hoverboard`) kit takılınca çipi okur:
- kitin türünü ve seri numarasını,
- takılı donanımı,
- sensörlerin kalibrasyonunu.

Kalibrasyondan kitin frame'lerini (`kit_gnss`, `kit_cam360`, `kit_lidar`) statik TF olarak yayınlar. Kalibrasyonun asıl kaynağı orchadOS'tur; bu araç manifesti üretip çipe yazar.

**Sözleşme:** `maraba/docs/kit-soketi.md`, "Kimlik çipinin içeriği (manifest)" ve "Repolar arası sözleşme". Uyulan sürüm: **manifest şema 1**. Referans okuyucu `maraba/ros2/src/robot_kit/robot_kit/manifest.py`; belgeyle çelişirse dosya geçerlidir. Özet: [docs/arayuzler.md](../../docs/arayuzler.md#kit-kimlik-çipi).

## Komutlar

```bash
uv sync
uv run pytest                     # ortak test vektörleri + negatif testler + sahte sysfs
uv run orchados-kit write manifest.json --out kit.bin   # donanımsız: imajı dosyaya yaz
uv run orchados-kit write manifest.json --dry-run       # imajı hex olarak bas
sudo uv run orchados-kit write manifest.json            # bus'taki tek DS2431'e yaz
uv run orchados-kit read                                # çipteki manifesti göster
uv run orchados-kit read --image kit.bin                # bir imaj dosyasını göster
uv run orchados-kit from-calibration <uuid> --hw-rev 1.0 --gnss-link usb   # kalibrasyon kaydından (aşağıda)
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

`tests/vectors/kit_manifest_v1.json`, robot reposundaki `ros2/src/robot_kit/test/vectors/kit_manifest_v1.json` dosyasının **değiştirilmemiş kopyasıdır**: 3 vektör, robot reposunun commit'i `36f001a` (repo o zaman `hoverboard` adındaydı). Her vektör için iki şey sınanır:
- `encode(manifest)`, `image_hex` ile bayt bayt aynı;
- `decode(image)` aynı manifesti float32 düzeyinde geri veriyor.

**Bu dosyayı tek taraflı değiştirme.** Format değişirse iki repo birlikte değişir.

## Kalibrasyondan manifest

```bash
export SUPABASE_URL=… SUPABASE_ANON_KEY=… ORCHADOS_EMAIL=… ORCHADOS_PASSWORD=…
uv run orchados-kit from-calibration <kalibrasyon uuid> --hw-rev 1.0 --gnss-link usb --cap pps --dry-run
sudo -E uv run orchados-kit from-calibration <kalibrasyon uuid> --hw-rev 1.0 --gnss-link usb --cap pps
```

- **Ne okunur:** `public.calibration` kaydı, saha (`field_staff`) ya da operasyon (`ops`) kullanıcısıyla. Servis anahtarı kullanılmaz, satır bazlı yetki geçerli. Değerler repoya girmez.
- **Nereden gelir:** `calib_id` kaydın `chip_id`'sinden, pozlar `extrinsics.kit_mount`'tan, seri numarası rig'deki kit cihazından. `caps`, kalibre edilmiş frame'lerden çıkar. `pps` ve `cam360_ctrl` kablolamaya bağlı olduğu için `--cap` ile verilir. Ayrıntılı eşleme: [docs/arayuzler.md](../../docs/arayuzler.md#kit-kimlik-çipi).
- **Ne reddedilir:** pozu olmayan, süresi dolmuş, rig'inde o sensör olmayan ya da tek bir kit cihazına bağlanamayan kayıt; robotun reddedeceği her manifest.
- **Çıktı:** Manifest JSON olarak basılır (`--save-manifest` ile dosyaya da). Sonra `write` ile aynı yol izlenir: `--out`, `--dry-run` ya da çipe yazıp geri okuma.

Testler Supabase'i yerel bir sahte HTTP sunucusuyla taklit eder (`tests/test_calibration.py`). Yerel Supabase'e karşı elle denendi: seed rig'ine `kit_mount`'lu bir kayıt eklenip `--dry-run` çalıştırıldı, çıkan imaj robotun `manifest.py`'siyle çözüldü.
