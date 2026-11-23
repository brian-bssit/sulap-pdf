# Monitoring SULAP PDF (Cloud Logging + Cloud Monitoring)

Perintah di bawah dijalankan manusia (mengubah proyek GCP). Belum dijalankan/diverifikasi terhadap GCP;
sesuaikan `PROJECT`, `REGION`, dan saluran notifikasi. Di production aplikasi menulis **satu baris JSON per
kejadian** ke stdout (`ENVIRONMENT=production`), sehingga muncul sebagai `jsonPayload` di Cloud Logging.

## Bentuk log

| `jsonPayload.event` | Kapan | Field utama |
|---|---|---|
| `request` | tiap request selesai (health/ready hanya bila status ≥ 500) | `method`, `path` (tanpa query), `status`, `duration_ms`, `tool` (compress/merge/…), `request_id`, `user_id` |
| `audit` | tiap operasi/login/ubah role | `action`, `status`, `user_email`, `source_files`, `result_size`, `processing_ms`, `ip`, `detail` |

Semua baris punya `severity`, `message`, `request_id`, `user_id`. Header respons `X-Request-ID` sama dengan
`request_id` di log → user bisa melapor "request id X", lalu cari dengan:
```
resource.type="cloud_run_revision" AND resource.labels.service_name="sulap" AND jsonPayload.request_id="X"
```
Uvicorn access log dimatikan (`--no-access-log`); baris `request` menggantikannya.

## Metrik berbasis log
```bash
F='resource.type="cloud_run_revision" AND resource.labels.service_name="sulap" AND jsonPayload.event="request"'

gcloud logging metrics create sulap_http_5xx --project PROJECT \
  --description="Respons 5xx SULAP" --log-filter="$F AND jsonPayload.status>=500"

gcloud logging metrics create sulap_http_429 --project PROJECT \
  --description="Kuota/rate limit tercapai" --log-filter="$F AND jsonPayload.status=429"

gcloud logging metrics create sulap_ready_503 --project PROJECT \
  --description="/api/ready gagal" --log-filter="$F AND jsonPayload.path=\"/api/ready\" AND jsonPayload.status=503"
```
Latensi p95: pakai metrik bawaan Cloud Run `run.googleapis.com/request_latencies` (percentile 95), tanpa
metrik kustom. Untuk latensi per tool, buat metrik distribusi dari `jsonPayload.duration_ms`
(`--config-from-file` dengan `valueExtractor: EXTRACT(jsonPayload.duration_ms)`, label `tool`).

## Alert (usulan ambang)

| Alert | Kondisi | Catatan |
|---|---|---|
| 5xx | `sulap_http_5xx` > 5 dalam 5 menit | tinjau log `severity>=ERROR` + `request_id` |
| Latensi | p95 `request_latencies` > 60 s selama 10 menit | convert Office wajar lebih lambat; pantau per tool |
| 429 melonjak | `sulap_http_429` > 50 dalam 10 menit | kemungkinan satu user/skrip menghajar kuota, lihat `user_id` |
| Readiness | `sulap_ready_503` ≥ 1 dalam 5 menit | DB turun atau binary hilang dari image |

Membuat kebijakan dari berkas (contoh satu alert; ulangi per metrik):
```bash
cat > /tmp/sulap-5xx.json <<'JSON'
{
  "displayName": "SULAP 5xx",
  "combiner": "OR",
  "conditions": [{
    "displayName": "5xx > 5 / 5m",
    "conditionThreshold": {
      "filter": "metric.type=\"logging.googleapis.com/user/sulap_http_5xx\" resource.type=\"cloud_run_revision\"",
      "aggregations": [{"alignmentPeriod": "300s", "perSeriesAligner": "ALIGN_SUM"}],
      "comparison": "COMPARISON_GT", "thresholdValue": 5, "duration": "0s"
    }
  }],
  "notificationChannels": ["projects/PROJECT/notificationChannels/CHANNEL_ID"]
}
JSON
gcloud alpha monitoring policies create --project PROJECT --policy-from-file=/tmp/sulap-5xx.json
```

## Readiness di belakang IAP
`GET /api/ready` → `200 {"status":"READY","checks":{...}}` atau `503 NOT_READY` (hanya boolean: `db`, `qpdf`,
`libreoffice`). Layanan berada di belakang IAP, jadi Cloud Monitoring uptime check biasa tidak bisa memanggilnya.
Opsi: Cloud Scheduler dengan OIDC token (service account yang diizinkan IAP) memanggil `/api/ready` tiap menit;
alert memakai `sulap_ready_503`. Opsi lain: startup probe Cloud Run ke `/api/ready` (verifikasi sintaks flag
`--startup-probe` pada versi gcloud yang dipakai sebelum menambahkannya ke `cloudbuild.yaml`).
