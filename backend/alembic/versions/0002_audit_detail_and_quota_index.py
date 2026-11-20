"""audit_logs.detail (JSONB) + indeks (user_id, executed_at) untuk kuota

Revision ID: 0002
Revises: 0001
"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS detail JSONB")
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_user_executed ON audit_logs (user_id, executed_at)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_audit_user_executed")
    op.execute("ALTER TABLE audit_logs DROP COLUMN IF EXISTS detail")
