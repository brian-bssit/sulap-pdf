# RACI SULAP PDF

> **Status: BELUM DITETAPKAN.** Nama dan unit pemilik belum diberikan. Tabel di bawah hanya kerangka peran yang
> perlu diisi manajemen. Jangan menganggap kolom kosong sebagai persetujuan siapa pun.

R = Responsible (mengerjakan), A = Accountable (satu orang yang bertanggung jawab akhir), C = Consulted, I = Informed.

| Aktivitas | Pemilik produk | Tim pengembang | Infrastruktur/Cloud | Information Security | Compliance/Legal | Helpdesk |
|---|---|---|---|---|---|---|
| Prioritas fitur & roadmap | A | R | C | C | C | I |
| Merge rilis ke `main` (PR + CI hijau) | I | A/R | I | C | – | – |
| Deploy & rollback produksi | I | R | A | I | – | – |
| Perubahan infrastruktur (Cloud SQL, jaringan, IAP) | I | C | A/R | C | – | – |
| Pemberian/pencabutan role admin & auditor | A | R | – | C | I | – |
| Pemantauan alert & respons insiden | I | R | A | C | I | I |
| Insiden keamanan / dugaan kebocoran data | I | R | R | A | C | I |
| Peninjauan log audit berkala | I | – | – | R | A | – |
| Penetapan retensi audit & klasifikasi data | C | C | C | C | A/R | – |
| Pengujian pemulihan (restore drill) | I | C | A/R | I | I | – |
| Dukungan pengguna | I | C | – | – | – | A/R |

## Yang perlu diputuskan manajemen
- Nama pemilik produk dan pemilik layanan (satu orang A per baris).
- Siapa on-call dan jalur eskalasi di luar jam kerja.
- Siapa yang menyetujui perubahan role admin.
