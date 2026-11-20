#!/bin/bash
# SULAP — GCP Infrastructure Setup
# Run once: chmod +x infra/setup.sh && ./infra/setup.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-bss-sandbox-project-1}"
REGION="asia-southeast2"
SERVICE="sulap"
DB_INSTANCE="sulap-db"
DB_NAME="sulap"
DB_USER="sulap"
DB_PASS="$(openssl rand -hex 16)"
JWT_SECRET="$(openssl rand -hex 32)"

echo "=== SULAP GCP Setup ==="
echo "Project: $PROJECT_ID"
echo "Region:  $REGION"
echo ""

# ── 1. Enable APIs ──
echo "[1/5] Enabling APIs..."
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --project="$PROJECT_ID"

# ── 2. Artifact Registry ──
echo "[2/5] Creating Artifact Registry..."
gcloud artifacts repositories create "$SERVICE" \
  --repository-format=docker \
  --location="$REGION" \
  --project="$PROJECT_ID" \
  2>/dev/null || echo "  (already exists)"

# ── 3. Cloud SQL ──
echo "[3/5] Creating Cloud SQL instance (3-5 min)..."
gcloud sql instances create "$DB_INSTANCE" \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --edition=enterprise \
  --region="$REGION" \
  --storage-size=10 \
  --storage-type=SSD \
  --project="$PROJECT_ID" \
  --activation-policy=ALWAYS \
  --backup-start-time=18:00 \
  --enable-point-in-time-recovery \
  --retained-backups-count=14 \
  --deletion-protection \
  2>/dev/null || echo "  (already exists)"

# Instance lama (dibuat dengan --no-backup / activation NEVER) → samakan; idempoten.
gcloud sql instances patch "$DB_INSTANCE" \
  --activation-policy=ALWAYS \
  --backup-start-time=18:00 \
  --enable-point-in-time-recovery \
  --retained-backups-count=14 \
  --deletion-protection \
  --project="$PROJECT_ID" \
  --quiet

gcloud sql databases create "$DB_NAME" \
  --instance="$DB_INSTANCE" \
  --project="$PROJECT_ID" \
  2>/dev/null || echo "  (already exists)"

gcloud sql users create "$DB_USER" \
  --instance="$DB_INSTANCE" \
  --password="$DB_PASS" \
  --project="$PROJECT_ID" \
  2>/dev/null || echo "  (already exists)"

# Get the public IP
echo "  Fetching instance IP..."
DB_IP=$(gcloud sql instances describe "$DB_INSTANCE" \
  --project="$PROJECT_ID" \
  --format='value(ipAddresses[0].ipAddress)')

# Allow Cloud Run egress — authorize 0.0.0.0/0 for sandbox (⚠️ lock down for production)
echo "  Authorizing 0.0.0.0/0 (sandbox — restrict for production!)..."
gcloud sql instances patch "$DB_INSTANCE" \
  --authorized-networks=0.0.0.0/0 \
  --project="$PROJECT_ID" \
  --quiet

DB_URL="postgresql+asyncpg://${DB_USER}:${DB_PASS}@${DB_IP}:5432/${DB_NAME}"

# ── 4. Secrets ──
echo "[4/5] Storing secrets in Secret Manager..."

create_or_update() {
  local name="$1" value="$2"
  if gcloud secrets describe "$name" --project="$PROJECT_ID" &>/dev/null; then
    echo -n "$value" | gcloud secrets versions add "$name" --data-file=- --project="$PROJECT_ID"
  else
    echo -n "$value" | gcloud secrets create "$name" --data-file=- --project="$PROJECT_ID"
  fi
}

create_or_update "sulap-db-url"      "$DB_URL"
create_or_update "sulap-jwt-secret"  "$JWT_SECRET"
create_or_update "sulap-google-id"   "692068716695-joen3hblb9n9cjb9ov6b7o4aj2ffu1fu.apps.googleusercontent.com"

# Placeholder — set after Cloud Run deploy
if ! gcloud secrets describe "sulap-frontend-url" --project="$PROJECT_ID" &>/dev/null; then
  echo -n "PENDING" | gcloud secrets create "sulap-frontend-url" --data-file=- --project="$PROJECT_ID"
fi

# ── 5. IAM for Cloud Run → Secret Manager ──
echo "[5/5] IAM bindings..."
SA="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"

for SECRET in sulap-db-url sulap-jwt-secret sulap-google-id sulap-frontend-url; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:$SA" \
    --role='roles/secretmanager.secretAccessor' \
    --project="$PROJECT_ID" \
    2>/dev/null || true
done

# ── Summary ──
echo ""
echo "========================================="
echo " SETUP COMPLETE"
echo "========================================="
echo ""
echo "Cloud SQL IP:     $DB_IP"
echo "DB Password:      $DB_PASS"
echo "JWT Secret:       $JWT_SECRET"
echo ""
echo "Next steps:"
echo ""
echo "  1. Build & deploy:"
echo "     gcloud builds submit --config cloudbuild.yaml ."
echo ""
echo "  2. After deploy, set the Cloud Run URL:"
echo "     URL=\$(gcloud run services describe $SERVICE --region $REGION --format='value(status.url)')"
echo "     echo -n \"\$URL\" | gcloud secrets versions add sulap-frontend-url --data-file=-"
echo ""
echo "  3. Add \$URL to Google OAuth Console:"
echo "     → APIs & Services → Credentials → Web client"
echo "     → Authorized JavaScript origins: \$URL"
echo ""
echo "  4. Redeploy to pick up FRONTEND_URL change:"
echo "     gcloud builds submit --config cloudbuild.yaml ."
