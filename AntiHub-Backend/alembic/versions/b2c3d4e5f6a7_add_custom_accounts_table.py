"""add_custom_accounts_table

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-02-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "custom_accounts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            comment="关联的用户ID",
        ),
        sa.Column(
            "account_name",
            sa.String(length=255),
            nullable=False,
            comment="账号显示名称",
        ),
        sa.Column(
            "service_name",
            sa.String(length=255),
            nullable=False,
            comment="用户自定义的服务标签（如 DeepSeek、OpenRouter）",
        ),
        sa.Column(
            "api_format",
            sa.String(length=50),
            nullable=False,
            server_default="openai_compatible",
            comment="协议格式：openai_compatible | anthropic",
        ),
        sa.Column(
            "base_url",
            sa.String(length=1024),
            nullable=True,
            comment="API 基础 URL（info_hidden=True 时为 NULL）",
        ),
        sa.Column(
            "proxy_url",
            sa.String(length=1024),
            nullable=True,
            comment="可选代理 URL",
        ),
        sa.Column(
            "models",
            sa.Text(),
            nullable=True,
            comment='JSON 数组字符串，如 ["deepseek-chat","deepseek-coder"]',
        ),
        sa.Column(
            "info_hidden",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
            comment="隐藏敏感信息标志（开启后 API Key 和地址不可再查看）",
        ),
        sa.Column(
            "credentials",
            sa.Text(),
            nullable=False,
            comment="Fernet 加密的 JSON（包含 api_key，info_hidden 时还含 base_url）",
        ),
        sa.Column(
            "status",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
            comment="账号状态：0=禁用，1=启用",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
            comment="创建时间",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
            comment="更新时间",
        ),
        sa.Column(
            "last_used_at",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="最后使用时间",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_custom_accounts_user_id", "custom_accounts", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_custom_accounts_user_id", table_name="custom_accounts")
    op.drop_table("custom_accounts")
