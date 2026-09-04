# Font Tambahan (Open License) — Requirements

## Overview
Fitur Edit PDF kini hanya punya 8 font Base-14 (Helvetica/Times/Courier + varian). Tambahkan font gratis/open-license yang **di-embed ke PDF output** agar tampil sama di semua viewer. Output tetap mandiri (stateless, tanpa simpan file).

## Glossary
- **Base-14**: 14 font standar PDF yang wajib ada di semua viewer — tak perlu embed.
- **Embed**: menyertakan file font (.ttf) ke dalam PDF supaya font non-standar tetap tampil.
- **WinAnsi**: encoding Latin-1 PDF (cukup untuk teks Indonesia; karakter di luar Latin-1 diganti `?`).

## Font (semua free / open license)
| Nama | License | Sumber (pinned) |
|---|---|---|
| Lato | SIL OFL 1.1 | google/fonts `ofl/lato/Lato-Regular.ttf` |
| DejaVu Sans | Bitstream Vera + public domain (free) | dejavu-fonts release 2.37 |
| DejaVu Serif | ditto | ditto |
| DejaVu Sans Mono | ditto | ditto |

TTF di-commit ke repo (`backend/pdf/fonts/`) agar deploy tak butuh internet. Lisensi disertakan (OFL.txt).

## Requirements
- [Req 1] User bisa memilih font tambahan dari dropdown Font di Edit PDF. WHEN user pilih font baru THEN teks yang ditaruh memakai font itu.
- [Req 2] Font tambahan di-embed utuh ke PDF output. WHEN file didownload THEN dibuka di viewer mana pun font tampil sama (tanpa warning "font not available").
- [Req 3] Font Base-14 lama tetap berfungsi & dikelompokkan terpisah di UI dari font open-license.
- [Req 4] Font baru dikenakan validasi whitelist yang sama (font tak dikenal → 400).
- [Req 5] Hanya font yang dipakai yang di-embed; font yang sama dipakai di banyak halaman hanya di-embed sekali (objek resource dibagi).
- [Req 6] Teks dalam font baru tetap searchable/extractable.

## Out of Scope (YAGNI)
- Bold/italic varian font baru (bold tetap via Helvetica-Bold / Times-Bold / DejaVu Sans Bold bila mudah).
- Subsetting font (full-embed diterima; ukuran naik hanya saat font itu dipakai).
- Font manager / upload font user.
