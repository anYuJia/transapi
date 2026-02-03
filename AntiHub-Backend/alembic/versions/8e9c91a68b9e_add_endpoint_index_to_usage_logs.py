"""add_endpoint_index_to_usage_logs

Revision ID: 8e9c91a68b9e
Revises: c2d5e7f9a1b3
Create Date: 2026-02-02 19:51:02.808373

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8e9c91a68b9e'
down_revision: Union[str, None] = 'c2d5e7f9a1b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 为 usage_logs 表的 endpoint 字段添加索引
    op.create_index(
        'ix_usage_logs_endpoint',
        'usage_logs',
        ['endpoint'],
        unique=False
    )


def downgrade() -> None:
    # 删除 endpoint 索引
    op.drop_index('ix_usage_logs_endpoint', table_name='usage_logs')
