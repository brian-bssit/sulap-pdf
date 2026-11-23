# SLO dan batas layanan SULAP PDF

> Angka di bawah adalah **usulan teknis** dari pengukuran lokal dan konfigurasi saat ini, bukan komitmen resmi.
> Target resmi (ketersediaan, jam dukungan) menunggu keputusan manajemen. Lihat juga `loadtest/README.md`.

## Batas teknis yang berlaku sekarang
| Hal | Nilai | Sumber |
|---|---|---|
| Ukuran file | 30 MB per file; gabung 2–10 file total 30 MB | `MAX_FILE_SIZE_MB` |
| Halaman | 200 untuk atur ulang, hapus halaman, dan edit | `MAX_PAGES_*` |
| Kuota per user | 10 operasi/menit, 200/hari | `RATE_LIMIT_PER_MIN`, `QUOTA_PER_DAY` |
| Waktu proses maks | 600 detik (Cloud Run) | `cloudbuild.yaml` |
| Konkurensi | 1 request per instance, maks 5 instance | `cloudbuild.yaml` |
| Sesi login | 8 jam | `JWT_EXPIRY_HOURS` |

## Pengukuran lokal (bukan produksi)
| Tool | p50 / p95 pada 5 user (ms) | p50 / p95 pada 20 user (ms) |
|---|---|---|
| Kompres | 33 / 62 | 140 / 930 |
| Gabung | 28 / 84 | 84 / 980 |
| Hapus halaman | 16 / 29 | 75 / 780 |
| Atur halaman (100 hlm) | 87 / 370 | 390 / 1400 |
| Konversi Office | 3600 / 4400 | 5300 / 6500 |

## Usulan SLO (untuk dibahas)
| Indikator | Usulan | Cara ukur |
|---|---|---|
| Ketersediaan | belum ditetapkan | rasio respons non-5xx (metrik `sulap_http_5xx`) |
| Latensi operasi PDF non-konversi | p95 < 5 detik untuk file ≤ 10 MB | `request_latencies` per tool |
| Latensi konversi Office | p95 < 30 detik | metrik distribusi `duration_ms` (lihat monitoring.md) |
| Tingkat kegagalan 5xx | < 1% | `sulap_http_5xx` / total |

## Keterbatasan yang perlu diketahui pengguna dan manajemen
- Maksimal 5 operasi bersamaan di seluruh bank. Konversi dokumen paling berat (±4–6 detik per dokumen); beban
  tinggi menumpuk di sini. Kapasitas dinaikkan lewat `max-instances` (keputusan biaya).
- Tidak ada antrean: permintaan yang melebihi kapasitas menunggu atau gagal.
- Layanan satu region (`asia-southeast2`); lihat [dr.md](dr.md).
