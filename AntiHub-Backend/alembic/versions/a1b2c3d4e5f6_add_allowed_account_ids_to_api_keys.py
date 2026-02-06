"""add_allowed_account_ids_to_api_keys

Revision ID: a1b2c3d4e5f6
Revises: 8e9c91a68b9e
Create Date: 2026-02-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "8e9c91a68b9e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "api_keys",
        sa.Column(
            "allowed_account_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            comment="允许使用的账号ID列表（JSON数组）；NULL=全部账号，[]=无账号，[1,2,3]=指定账号",
        ),
    )


def downgrade() -> None:
    op.drop_column("api_keys", "allowed_account_ids")
