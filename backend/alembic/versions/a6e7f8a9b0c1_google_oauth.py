"""Google OAuth (M8-T03) : google_id sur users, mot de passe optionnel.

- `google_id` : identifiant stable Google (claim `sub`), unique, null pour les
  comptes classiques.
- `hashed_password` devient nullable : un compte créé via Google n'a pas de
  mot de passe (le login classique le refuse explicitement).

Revision ID: a6e7f8a9b0c1
Revises: f5d6e7f8a9b0
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a6e7f8a9b0c1"
down_revision: Union[str, None] = "f5d6e7f8a9b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("google_id", sa.String(64), nullable=True))
    op.create_unique_constraint("uq_users_google_id", "users", ["google_id"])
    op.alter_column("users", "hashed_password", nullable=True)


def downgrade() -> None:
    # Les comptes Google-only n'ont pas de mot de passe : leur donner un hash
    # inutilisable plutôt que de violer le NOT NULL restauré.
    op.execute(
        "UPDATE users SET hashed_password = '!google-only' "
        "WHERE hashed_password IS NULL"
    )
    op.alter_column("users", "hashed_password", nullable=False)
    op.drop_constraint("uq_users_google_id", "users", type_="unique")
    op.drop_column("users", "google_id")
