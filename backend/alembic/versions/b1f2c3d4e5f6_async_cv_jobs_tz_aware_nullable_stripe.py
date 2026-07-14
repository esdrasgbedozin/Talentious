"""async cv jobs, timezone-aware datetimes, nullable stripe_payment_id

Revision ID: b1f2c3d4e5f6
Revises: 0a59b3039eea
Create Date: 2026-07-09

Supports the M1 async CV generation pipeline:
- `career_passes.stripe_payment_id` becomes nullable (admin-granted passes).
- All datetime columns become TIMESTAMP WITH TIME ZONE (timezone-aware).
- New `cv_jobs` table backing asynchronous generation jobs.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b1f2c3d4e5f6"
down_revision: Union[str, None] = "0a59b3039eea"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (table, column) pairs migrated to timezone-aware timestamps.
_TS_COLUMNS = [
    ("users", "created_at"),
    ("user_profiles", "updated_at"),
    ("career_passes", "valid_until"),
    ("career_passes", "purchased_at"),
    ("generated_cvs", "created_at"),
    ("generated_cvs", "updated_at"),
]


def upgrade() -> None:
    # 1. stripe_payment_id nullable (admin-granted passes have no Stripe payment).
    op.alter_column(
        "career_passes",
        "stripe_payment_id",
        existing_type=sa.String(length=255),
        nullable=True,
    )

    # 2. Timezone-aware datetimes (interpret existing naive values as UTC).
    for table, column in _TS_COLUMNS:
        op.alter_column(
            table,
            column,
            type_=sa.DateTime(timezone=True),
            existing_type=sa.DateTime(),
            postgresql_using=f"{column} AT TIME ZONE 'UTC'",
        )

    # 3. cv_jobs table for asynchronous generation.
    # create_type=False: we create the enum explicitly below so create_table does
    # not try to create it a second time.
    job_status = postgresql.ENUM(
        "queued", "running", "succeeded", "failed", name="jobstatus", create_type=False
    )
    job_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "cv_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", job_status, nullable=False),
        sa.Column("progress_pct", sa.Integer(), nullable=True),
        sa.Column(
            "cv_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("generated_cvs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("cv_name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_cv_jobs_user_id", "cv_jobs", ["user_id"])
    op.create_index("ix_cv_jobs_status", "cv_jobs", ["status"])


def downgrade() -> None:
    op.drop_index("ix_cv_jobs_status", table_name="cv_jobs")
    op.drop_index("ix_cv_jobs_user_id", table_name="cv_jobs")
    op.drop_table("cv_jobs")
    postgresql.ENUM(name="jobstatus").drop(op.get_bind(), checkfirst=True)

    for table, column in _TS_COLUMNS:
        op.alter_column(
            table,
            column,
            type_=sa.DateTime(),
            existing_type=sa.DateTime(timezone=True),
        )

    op.alter_column(
        "career_passes",
        "stripe_payment_id",
        existing_type=sa.String(length=255),
        nullable=False,
    )
