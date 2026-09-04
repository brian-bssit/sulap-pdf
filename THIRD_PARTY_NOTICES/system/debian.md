# Debian GNU/Linux 12 (bookworm) + CPython runtime

## Debian 12
| | |
|:---|:---|
| **Versi** | 12 (bookworm), base image `python:3.12-slim` |
| **Lisensi** | DFSG; tiap paket berlisensi sendiri (mayoritas GPL/BSD/MIT/…) |
| **Sumber / URL** | https://www.debian.org/ · https://sources.debian.org/ |
| **Modifikasi** | Tidak ada. |

**SBOM OS penuh:** komponen OS/apt ditulis manual (paket eksplisit Dockerfile saja) di
`docs/sbom/docker-cyclonedx.json`. Dependensi OS transitif (libc, openssl, fontconfig,
poppler, …) **belum di-enumerasi** → status *pending*: generate `syft`/`trivy` atas image
final di CI untuk SBOM OS lengkap. Lihat `LICENSE_COMPLIANCE.md`.

## CPython (interpreter)
| | |
|:---|:---|
| **Versi** | 3.12.x di image (`python:3.12-slim`); venv lokal 3.12.13 |
| **Lisensi** | Python-2.0 (PSF License Agreement) |
| **Copyright** | © Python Software Foundation |
| **Sumber / URL** | https://www.python.org/ · https://github.com/python/cpython |
| **Modifikasi** | Tidak ada. |

**Teks lisensi:** https://docs.python.org/3/license.html (tidak disalin — interpreter dari base image resmi).
