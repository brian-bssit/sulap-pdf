"""baseline: skema users + audit_logs sebelum Alembic

Idempoten: DB produksi yang dibuat oleh `create_all` sudah punya tabel ini → dilewati.

Revision ID: 0001
Revises:
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())

    if "users" not in existing:
        op.create_table(
            "users",
            sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
            sa.Column("google_sub", sa.String(255), nullable=False, unique=True),
            sa.Column("email", sa.String(255), nullable=False, unique=True),
            sa.Column("display_name", sa.String(255), nullable=False),
            sa.Column("picture_url", sa.Text, nullable=True),
            sa.Column("role", sa.String(20), nullable=False),
            sa.Column("is_active", sa.Boolean, nullable=False),
            sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )

    if "audit_logs" not in existing:
        op.create_table(
            "audit_logs",
            sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
            sa.Column("user_id", pg.UUID(as_uuid=True), nullable=True),
            sa.Column("user_email", sa.String(255), nullable=False),
            sa.Column("action", sa.String(50), nullable=False),
            sa.Column("source_files", pg.ARRAY(sa.Text), nullable=True),
            sa.Column("result_file", sa.String(255), nullable=True),
            sa.Column("file_sizes", pg.ARRAY(sa.BigInteger), nullable=True),
            sa.Column("result_size", sa.BigInteger, nullable=True),
            sa.Column("processing_ms", sa.Integer, nullable=True),
            sa.Column("status", sa.String(20), nullable=False),
            sa.Column("error_message", sa.Text, nullable=True),
            sa.Column("ip_address", pg.INET, nullable=True),
            sa.Column("user_agent", sa.Text, nullable=True),
            sa.Column("executed_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
        op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
        op.create_index("ix_audit_logs_executed_at", "audit_logs", ["executed_at"])


def downgrade() -> None:
    raise RuntimeError("Baseline tidak bisa di-downgrade: akan menghapus seluruh data users & audit_logs")
