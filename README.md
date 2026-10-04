# NEXLINK

Bio-link multi-pengguna untuk mengumpulkan profil dan tautan penting dalam satu halaman. Frontend tetap menggunakan HTML, CSS, dan JavaScript vanilla; akun serta profil disimpan di PostgreSQL melalui API Node.js.

## Fitur

- Landing page, register, login, dashboard, dan halaman profil publik di `/u/:username`.
- Password di-hash dengan bcrypt; autentikasi memakai session cookie `HttpOnly`.
- Isolasi profil berdasarkan akun di server.
- Edit profil, foto, link, urutan, status aktif, dan pin.
- Preview langsung, beberapa tema, preset gradient, dan warna latar kustom.
- QR Code profil yang dapat diunduh dan tombol berbagi profil.
- Analytics server-side untuk kunjungan profil dan klik link.
- Validasi input, pembatasan percobaan autentikasi, pemeriksaan origin, dan security headers.

## Jalankan dengan Docker (disarankan)

Prasyarat: Docker Desktop dengan Docker Compose.

1. Clone repository dan buka foldernya.
2. Salin file contoh environment:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Untuk pemakaian lokal, nilai bawaan `.env` dapat digunakan. Sebelum deployment sungguhan, ganti `POSTGRES_PASSWORD` dengan password acak yang kuat.
4. Build dan jalankan aplikasi serta PostgreSQL:

   ```powershell
   docker compose up --build -d
   ```

5. Buka [http://localhost:3000](http://localhost:3000).

Schema database dibuat otomatis saat volume PostgreSQL pertama kali diinisialisasi. Data bertahan pada volume Docker bernama `nexlink-postgres` saat container dihentikan atau diperbarui.

Untuk menghentikan aplikasi tanpa menghapus database:

```powershell
docker compose down
```

> `docker compose down -v` menghapus volume database dan semua data pengguna. Gunakan hanya jika memang ingin menghapus data.

## Jalankan tanpa Docker

Prasyarat: Node.js 20+, npm, dan PostgreSQL.

1. Buat database PostgreSQL bernama `nexlink`.
2. Salin `.env.example` menjadi `.env`, lalu sesuaikan `DATABASE_URL`.
3. Terapkan schema:

   ```powershell
   psql "postgres://nexlink:nexlink-local-password@localhost:5432/nexlink" -f db/schema.sql
   ```

4. Install dependency dan jalankan server:

   ```powershell
   npm install
   npm run dev
   ```

5. Buka [http://localhost:3000](http://localhost:3000).

Jangan buka `index.html` menggunakan `file://` atau Live Server saja. Aplikasi sekarang memerlukan API dan database yang dijalankan oleh `server.js`.

## Konfigurasi environment

| Variabel | Keterangan |
| --- | --- |
| `NODE_ENV` | Gunakan `production` untuk deployment. |
| `PORT` | Port HTTP aplikasi; default `3000`. |
| `DATABASE_URL` | Connection string PostgreSQL. |
| `DATABASE_SSL` | Set `true` jika koneksi PostgreSQL jarak jauh mewajibkan TLS. |
| `POSTGRES_PASSWORD` | Password database pada Docker Compose. Ganti sebelum deployment. |
| `COOKIE_SECURE` | Set `true` pada deployment HTTPS agar cookie hanya dikirim lewat TLS. |
| `TRUST_PROXY` | Set `true` hanya jika aplikasi berada di belakang satu reverse proxy tepercaya yang meneruskan host dan IP klien. |

File `.env` tidak boleh dimasukkan ke Git. Untuk deployment Compose, atur `COOKIE_SECURE=true`, gunakan password PostgreSQL acak berbentuk alfanumerik, serta biarkan `APP_BIND_ADDRESS=127.0.0.1` jika reverse proxy berjalan pada host yang sama. Aplikasi sebaiknya ditempatkan di belakang reverse proxy HTTPS seperti Caddy, Nginx, atau layanan platform hosting yang menyediakan TLS. Jangan mengekspos port aplikasi ke internet tanpa HTTPS.

## Endpoint utama

| Method | Endpoint | Keterangan |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Membuat akun dan profil. |
| `POST` | `/api/auth/login` | Login. |
| `POST` | `/api/auth/logout` | Mengakhiri sesi aktif. |
| `GET` | `/api/auth/me` | Memeriksa sesi pengguna. |
| `GET` / `PUT` | `/api/profile` | Membaca atau mengubah profil milik pengguna yang login. |
| `GET` | `/api/profiles/:username` | Membaca profil publik sekaligus mencatat kunjungan. |
| `POST` | `/api/profiles/:username/links/:linkId/click` | Mencatat klik link publik. |
| `GET` | `/api/health` | Memeriksa koneksi server dan database. |

## Struktur proyek

| File | Fungsi |
| --- | --- |
| `index.html`, `login.html`, `register.html`, `dashboard.html`, `profile.html` | Halaman antarmuka. |
| `style.css` | Desain responsive. |
| `script.js` | Interaksi frontend dan komunikasi API. |
| `server.js` | Web server dan API Node.js/Express. |
| `db/schema.sql` | Struktur tabel PostgreSQL. |
| `Dockerfile`, `docker-compose.yml` | Menjalankan aplikasi dan database dengan Docker. |

## Catatan sebelum peluncuran publik

- Ini merupakan fondasi MVP self-hosted, bukan layanan terkelola. Siapkan domain, HTTPS, backup database rutin, monitoring, dan kebijakan privasi sebelum mengundang banyak pengguna.
- Verifikasi email dan reset password belum disediakan; tambahkan provider email dan alur pemulihan akun sebelum digunakan sebagai layanan publik berskala besar.
- Analytics menghitung permintaan halaman dan klik secara sederhana. Bot, reload, atau trafik otomatis dapat memengaruhi angka.
- QR Code dibuat menggunakan QRCode.js melalui CDN, sehingga koneksi internet diperlukan untuk memuat library tersebut.
- Foto profil disimpan sebagai data pada PostgreSQL. Untuk skala lebih besar, gunakan object storage dan atur batas ukuran/retensi.

## Teknologi

- HTML5, CSS3, JavaScript vanilla
- Node.js 20+, Express, PostgreSQL
- bcryptjs, Helmet, express-rate-limit
- [QRCode.js](https://github.com/davidshimjs/qrcodejs) melalui CDN
