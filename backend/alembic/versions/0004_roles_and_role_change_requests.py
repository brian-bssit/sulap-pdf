"""peran baru (dca_officer, dca_supervisor, super_admin) + tabel role_change_requests (dual control)

`admin` lama dimigrasikan ke `super_admin` agar tak ada yang kehilangan akses.

Revision ID: 0004
Revises: 0003
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE users SET role = 'super_admin' WHERE role = 'admin'")
    op.create_table(
        "role_change_requests",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("target_user_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("from_role", sa.String(20), nullable=False),
        sa.Column("to_role", sa.String(20), nullable=False),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column("requested_by", pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("decided_by", pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision_note", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ux_rcr_pending_target", "role_change_requests", ["target_user_id"],
        unique=True, postgresql_where=sa.text("status = 'PENDING'"),
    )


def downgrade() -> None:
    op.drop_index("ux_rcr_pending_target", table_name="role_change_requests")
    op.drop_table("role_change_requests")
    # Semua peran admin baru kembali ke `admin` (hak setara terbesar yang ada sebelum fitur ini).
    op.execute("UPDATE users SET role = 'admin' WHERE role IN ('super_admin', 'dca_officer', 'dca_supervisor')")
