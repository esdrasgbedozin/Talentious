"""partial unique index: one active cv_job per user (idempotency race guard)

Revision ID: c2a3b4d5e6f7
Revises: b1f2c3d4e5f6
Create Date: 2026-07-09
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c2a3b4d5e6f7"
down_revision: Union[str, None] = "b1f2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "uq_cv_jobs_one_active_per_user",
        "cv_jobs",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('queued', 'running')"),
    )


def downgrade() -> None:
    op.drop_index("uq_cv_jobs_one_active_per_user", table_name="cv_jobs")
