# NEXLINK

Bio-link sederhana untuk mengumpulkan profil dan tautan penting dalam satu halaman. Dibuat menggunakan HTML, CSS, dan JavaScript tanpa framework, dengan penyimpanan data di browser melalui LocalStorage.

> **Status:** Prototipe frontend untuk pembelajaran dan penggunaan lokal. Belum menggunakan backend atau database online.

## Fitur

- Landing page, login, register, dashboard, dan profil publik.
- Edit nama, username, bio, dan foto profil.
- Tambah, edit, hapus, aktif/nonaktifkan, pin, dan atur urutan link dengan drag-and-drop.
- Preview profil langsung serta Preview Mode.
- Pilihan tema profil, gradient preset, dan warna latar kustom.
- QR Code profil yang dapat diunduh.
- Share profil menggunakan Web Share API jika tersedia, dengan fallback salin link.
- Statistik sederhana untuk kunjungan profil dan klik link.
- Toast notification untuk aksi pengguna.
- Dark mode dan tampilan responsive.
- Data profil, akun demo, tema, dan statistik disimpan di LocalStorage.

## Menjalankan secara lokal

1. Clone atau unduh repository ini.
2. Buka folder proyek di Visual Studio Code.
3. Pasang ekstensi **Live Server** jika belum tersedia.
4. Klik kanan `index.html`, lalu pilih **Open with Live Server**.
5. Pilih **Get started** untuk membuat akun lokal, atau login menggunakan akun yang dibuat.

Halaman utama proyek:

| File | Fungsi |
| --- | --- |
| `index.html` | Landing page |
| `login.html` | Halaman login |
| `register.html` | Halaman pendaftaran |
| `dashboard.html` | Editor profil, tautan, tema, QR, dan analytics |
| `profile.html` | Tampilan profil publik |
| `style.css` | Gaya dan layout responsive |
| `script.js` | Interaksi dan penyimpanan LocalStorage |

## Catatan penggunaan

- Data hanya tersedia pada browser dan origin yang sama. Menghapus data situs/browser akan menghapus profil serta statistik.
- Akun dan password pada demo disimpan secara lokal di browser. **Jangan gunakan password atau informasi sensitif sungguhan.**
- Link profil saat ini membuka halaman `profile.html` lokal. Untuk membagikannya kepada orang lain, deploy seluruh file proyek ke layanan hosting statis terlebih dahulu.
- QR Code dibuat menggunakan QRCode.js dari CDN, sehingga koneksi internet diperlukan agar library QR tersedia.
- Statistik kunjungan dan klik merupakan hitungan lokal sederhana, bukan analytics server-side.

## Teknologi

- HTML5
- CSS3
- JavaScript (Vanilla)
- LocalStorage
- [QRCode.js](https://github.com/davidshimjs/qrcodejs) melalui CDN untuk membuat QR Code

## Lisensi

Tambahkan file lisensi jika proyek ini akan didistribusikan atau digunakan oleh orang lain.
