# Tasks — Kontrol Akses

Urutan: Gelombang 0 dulu (kerentanan), lalu A, lalu B. Tiap gelombang diakhiri checkpoint dan bukti.

## Gelombang 0 — Perbaikan segera
- [x] 0.1 Perbaiki path traversal di `serve_frontend` + tes (varian `..%2f`, `%2e%2e/`, absolut, `.html`, direktori) [R0.1]
- [x] 0.2 Matikan `/docs` `/redoc` `/openapi.json` di production + tes [R0.2]
- [x] 0.3 `safe_tool_error` di compress/convert/dll.; hapus awalan `[kode]` di UI; tes tak ada `/tmp` di pesan [R0.3]
- [x] 0.4 Audit `LOGOUT` + reload penuh saat logout [R0.4]
- [x] 0.5 `pool_pre_ping`, `pool_recycle` [R0.5]
- [x] 0.6 `npm audit fix` / pembaruan axios; `pip-audit`; regenerasi SBOM [R0.6]
- [x] 0.7 Dokumen matriks role, kode error, hardening image; endpoint CSV user [R0.7]
- [x] **Checkpoint 0** — pytest, vitest, tsc, lint, e2e lulus; ulangi `curl --path-as-is` (harus 404)

## Gelombang A — Sesi
- [x] A1 Migrasi 0003 (`session_id`, `last_seen_at`) + model [R2]
- [x] A2 `auth/session.py`, token dengan `sid`/`auth_time`, pemeriksaan di `get_current_user`, header `X-Auth-Reason` [R1, R2]
- [x] A3 `POST /api/auth/ping`; audit login/ganti-sesi/idle [R4]
- [x] A4 Tes unit + integrasi (Postgres): idle, sesi diganti, batas 8 jam, token lama [R1–R3]
- [x] A5 `IdleGuard.tsx`, interceptor `x-auth-reason`, strings, halaman login [R1, R3]
- [x] A6 e2e Playwright: dua konteks browser (login kedua menendang pertama); idle dengan waktu dipercepat [R1, R2]
- [x] **Checkpoint A**

## Gelombang B — Peran dan dual control
- [x] B1 `auth/roles.py` + migrasi 0004 (data + tabel) + model [R5]
- [x] B2 Ganti dependency admin/auditor lama dengan `require_roles` di seluruh router [R6]
- [x] B3 `role_service`: invarian, request/approve/reject/cancel + tes unit murni (tabel kebenaran invarian) [R7–R11]
- [x] B4 Endpoint + audit + tes integrasi Postgres (maker≠approver, ganda, race) [R7–R12]
- [x] B5 Frontend: tipe role, `UserManagement`, `RoleRequests`, strings, nav [R13]
- [x] B6 e2e: Officer mengajukan → Supervisor menyetujui; Officer tak bisa menyetujui; Super Admin langsung [R6–R9]
- [x] B7 Dokumen `docs/ops/matriks-role.md`, runbook (pemulihan bila tanpa Supervisor), README
- [x] **Checkpoint B**

## Penutup
- [x] Z1 Perbarui `docs/security/baseline-checklist-evaluation.md` (status butir 7, 32, 33, 35, 38, 41, 42, 49, 52, 54, 66, 69, 75, 77, 78) dengan bukti
- [x] Z2 `@verifier` bukti penuh

## Catatan Gelombang A
- Klien memaksa keluar tepat di `IDLE_TIMEOUT_SECONDS`; server jadi pengaman cadangan dengan kelonggaran 60 detik (`IDLE_GRACE_SECONDS`) agar jeda ping tak mengeluarkan user aktif lebih awal.
- Saat peringatan tampil hanya tombol "Tetap masuk" yang memperpanjang sesi (gerakan pointer biasa tidak), supaya dialog tidak lenyap di tengah klik.
- Aktivitas dibagi antar-tab lewat localStorage; operasi yang berjalan (unggah/proses) dihitung aktivitas.
- e2e memakai `IDLE_TIMEOUT_SECONDS=20`. `npx playwright test` memakai build lama; selalu jalankan `npm run test:e2e` setelah mengubah frontend.

## Catatan Gelombang B
- Tes Postgres dual control ada di `backend/tests/db` (di-SKIP tanpa `TEST_DATABASE_URL`; DB diisi ulang tiap tes).
- Semua perubahan role diserialkan advisory lock (`pg_advisory_xact_lock`) + `SELECT … FOR UPDATE` pada pengajuan; dua persetujuan bersamaan: satu menang, satu 409 (diuji).
- `dev-login` kini hanya menerima role yang dikenal (400 bila tidak).
