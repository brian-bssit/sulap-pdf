# Temuan: `npm audit --omit=dev` melaporkan severity high (sudah ada sebelum gelombang B)

Versi prod tidak berubah oleh penambahan devDependency (next 14.2.35, axios 1.19.0, react 18.3.1, pdfjs-dist 4.0.379 sama).
- axios 1.0.0–1.19.0 (high) — `npm audit fix` tersedia
- follow-redirects 1.16.0–1.16.1 (high, transitif axios)
- brace-expansion <=1.1.20 (high, DoS; transitif)

Usulan: naikkan axios ke versi terbaru yang aman + `npm audit fix`, jalankan `npm test`/build, regenerasi SBOM npm.
Job `audit` di usulan CI akan merah sampai ini beres (atau jadikan informatif).
