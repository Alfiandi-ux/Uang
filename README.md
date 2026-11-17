# UANG

Catatan keuangan pribadi bergaya **neo-brutalism** yang berjalan sepenuhnya offline. Tanpa akun, tanpa server, tanpa pelacakan. Semua data tersimpan di perangkatmu.

Tersedia dalam bentuk **Aplikasi Android (.apk)** dan **Aplikasi Web / PWA**.

---

## 📱 Unduh Aplikasi Android (APK)

Kamu bisa langsung memasang UANG di HP Android **7.0 ke atas** tanpa perlu server atau Termux!

[![Download APK](https://img.shields.io/badge/Download-Uang.apk-2ea44f?style=for-the-badge&logo=android&logoColor=white)](https://github.com/Alfiandi-ux/Uang/releases/latest/download/Uang.apk)

👉 **[Unduh Uang.apk Versi Terbaru](https://github.com/Alfiandi-ux/Uang/releases/latest/download/Uang.apk)**

### Cara Pasang di Android:
1. Unduh berkas **`Uang.apk`** dari tautan di atas (atau melalui menu [Releases](https://github.com/Alfiandi-ux/Uang/releases)).
2. Buka berkas yang telah didownload (dari notifikasi browser atau aplikasi File Manager / Files).
3. Jika muncul dialog *"Demi keamanan, ponsel Anda tidak diizinkan menginstal aplikasi yang tidak dikenal dari sumber ini"*, ketuk **Setelan / Pengaturan**, lalu aktifkan **Izinkan dari sumber ini**.
4. Ketuk **Instal**.
5. Selesai! Aplikasi **UANG** akan muncul di layar utama / menu aplikasi HP dan siap digunakan offline kapan saja.

> **Catatan rilis v1.1.0:** mulai versi ini UANG memakai kunci rilis baru. Jika kamu pernah memasang v1.0.0, **ekspor cadangan JSON dulu**, lalu hapus aplikasi lama sebelum memasang APK baru karena tanda tangannya berbeda. Setelah itu pulihkan cadangan di v1.1.0.

### Menandatangani APK (untuk rilis)

Kunci rilis **tidak disimpan di repo**. Jangan pernah commit `android/keystore/` atau `android/keystore.properties`.

- Build lokal membaca `android/keystore.properties` (sudah diabaikan git), atau environment variable:
  `UANG_KEYSTORE_PATH`, `UANG_KEYSTORE_PASSWORD`, `UANG_KEY_ALIAS`, `UANG_KEY_PASSWORD`.
- GitHub Actions membaca secrets:
  `UANG_KEYSTORE_BASE64`, `UANG_KEYSTORE_PASSWORD`, `UANG_KEY_ALIAS`, `UANG_KEY_PASSWORD`.

Untuk melihat nilai yang perlu dimasukkan ke GitHub Secrets:

```bash
cd ~/uang
./android/scripts/signing-secrets.sh
```

Kalau perlu membuat kunci baru:

```bash
cd ~/uang/android
keytool -genkeypair -v -keystore keystore/release.jks -alias uang \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=UANG, OU=App, O=Alfiandi, C=ID"
```

Lalu isi `android/keystore.properties` seperti contoh di `android/keystore.properties.example`.

> Workflow hanya membuat GitHub Release saat kamu push tag `v*` (misalnya `v1.1.0`). Push ke `main` hanya menghasilkan artifact APK, tidak menimpa rilis lama.

---

## Fitur

- **Ringkasan bulanan** — total saldo, arus kas, tren pengeluaran, grafik enam bulan, komposisi kategori, sisa anggaran, dan transaksi terbaru.
- **Transaksi** — pengeluaran, pemasukan, dan transfer antar dompet. Bisa dicari, difilter, diedit, dan dihapus.
- **Anggaran** — batas pengeluaran per kategori, berlaku otomatis setiap bulan, lengkap dengan peringatan saat mendekati atau melewati batas.
- **Laporan** — pemasukan vs pengeluaran, rincian per kategori, pengeluaran teratas, rata-rata harian, dan catatan otomatis.
- **Dompet** — kelola tunai, bank, e-wallet, atau dompet lain. Saldo dihitung dari saldo awal ditambah seluruh transaksi.
- **Kategori** — tambah, ubah, atau hapus kategori pengeluaran dan pemasukan, lengkap dengan emoji dan warna.
- **Mode privat** — samarkan semua nominal dengan satu ketukan.
- **Tema** — terang, gelap, atau mengikuti sistem.
- **Data contoh** — coba aplikasi dengan transaksi, dompet, dan anggaran yang sudah terisi.
- **Cadangan** — ekspor/impor JSON untuk memindahkan data, plus ekspor CSV untuk spreadsheet.
- **PWA** — bisa dipasang ke layar utama dan dibuka tanpa internet setelah pertama kali dimuat.

---

## Menjalankan

Butuh Python 3 (sudah tersedia di Termux) atau server statis apa pun.

```bash
cd ~/uang
./serve.sh 8090
```

Buka **http://localhost:8090** di browser.

Port bisa diganti:

```bash
./serve.sh 8080
```

> Service worker dan pemasangan PWA memerlukan `http://localhost` atau HTTPS. Membuka `index.html` langsung lewat `file://` tidak akan mengaktifkan mode offline.

### Memasang sebagai aplikasi (PWA)

**Android / Chrome**

1. Buka aplikasi lewat `http://localhost:8090`.
2. Tekan tombol **Pasang aplikasi** di sidebar/pengaturan, atau menu browser → **Tambahkan ke layar utama**.
3. Setelah terpasang, aplikasi bisa dibuka tanpa server dan tanpa internet.

**Desktop**

Gunakan ikon **install** di address bar Chrome/Edge, atau menu → **Install UANG**.

---

## Pintasan keyboard

| Tombol | Aksi |
| --- | --- |
| `N` | Catat transaksi baru |
| `/` | Fokus ke pencarian transaksi |
| `Esc` | Tutup dialog |

Pintasan tidak aktif saat sedang mengetik di kolom input.

---

## Data & privasi

- Data disimpan di **localStorage** browser dengan kunci `uang.v1`.
- Tidak ada akun, server, analitik, atau permintaan jaringan selain memuat berkas aplikasi.
- APK tidak meminta izin **INTERNET** maupun penyimpanan. Ekspor cadangan memakai Storage Access Framework (Android 7–9) atau MediaStore Downloads (Android 10+).
- Backup sistem Android dimatikan (`allowBackup="false"`) agar data keuangan tidak ikut tersalin ke cloud secara otomatis.
- Menghapus data situs di browser akan **menghapus semua catatan**. Unduh cadangan JSON secara berkala.
- Cadangan JSON berisi seluruh transaksi, dompet, kategori, anggaran, dan pengaturan. Simpan di tempat aman.
- Impor akan **mengganti** seluruh data yang ada, bukan menggabungkannya.
- CSV berisi seluruh transaksi (atau satu bulan dari halaman Laporan) dan bisa dibuka di Excel, Google Sheets, atau LibreOffice.

**Tips:** gunakan **Pengaturan → Unduh cadangan JSON** sebelum mengganti perangkat, membersihkan browser, atau memuat data contoh.

---

## Struktur berkas

```
uang/
├── index.html                 # kerangka aplikasi + sprite ikon SVG
├── manifest.webmanifest       # metadata PWA & pintasan
├── sw.js                      # service worker (cache offline)
├── serve.sh                   # server lokal
├── icon.svg                   # ikon vektor
├── icon-*.png                 # ikon PWA (reguler & maskable)
├── README.md
├── android/                   # proyek WebView Android + build APK
└── assets/
    ├── styles.css             # sistem visual neo-brutalism + responsif
    ├── fonts/                 # Archivo & Space Mono (self-hosted)
    └── js/
        ├── app.js             # rute, tampilan, form, aksi, onboarding
        ├── store.js           # model data, perhitungan, demo, impor/ekspor
        ├── format.js          # format Rupiah, tanggal, bulan
        └── charts.js          # grafik SVG (batang, donat, sparkline)
```

---

## Pengembangan

Tidak ada dependensi atau langkah build. Cukup edit berkas lalu muat ulang halaman.

```bash
# cek sintaks JavaScript
node --check assets/js/app.js
node --check assets/js/store.js
node --check assets/js/format.js
node --check assets/js/charts.js
```

**Setelah mengubah aset**, naikkan versi cache di `sw.js`:

```js
const CACHE = 'uang-v1.1.0';
```

Lalu muat ulang halaman dua kali (atau tutup semua tab aplikasi) agar service worker baru mengambil alih. Tanpa menaikkan versi, browser bisa tetap menyajikan berkas lama dari cache.

### Catatan implementasi

- Rute berbasis hash: `#/ringkasan`, `#/transaksi`, `#/anggaran`, `#/laporan`, `#/dompet`, `#/pengaturan`, `#/lainnya`.
- State aplikasi disimpan sebagai satu objek JSON; setiap perubahan langsung ditulis ke localStorage.
- Data contoh dibuat relatif terhadap bulan berjalan dengan RNG deterministik, sehingga selalu terlihat wajar saat pertama dicoba.
- Semua nominal memakai format Rupiah tanpa desimal (`Rp 1.250.000`).
- Desain memakai bayangan offset keras, garis tebal, dan aksen pastel; mode gelap tetap mempertahankan kontras teks pada kartu berwarna.

### Batasan

- Satu perangkat, satu browser. Tidak ada sinkronisasi antarperangkat.
- Kapasitas localStorage umumnya sekitar 5 MB — cukup untuk puluhan ribu transaksi, tetapi bukan arsip jangka panjang tanpa cadangan.
- Pemasangan PWA dan mode offline memerlukan HTTPS atau `localhost`.
- APK membutuhkan Android 7.0+ (minSdk 24).

---

## Lisensi

Dibuat untuk penggunaan pribadi. Silakan ubah dan sesuaikan sesuai kebutuhanmu.
