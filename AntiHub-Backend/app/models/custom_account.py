"""
自定义账号数据模型

说明：
- 允许用户添加任意 OpenAI 兼容 / Anthropic API 账号
- 凭证（api_key 等）使用 Fernet 加密后存储
- info_hidden=True 时 base_url 也加密存储，列字段置 NULL
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional, TYPE_CHECKING

from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class CustomAccount(Base):
    """自定义账号模型（支持 OpenAI 兼容 / Anthropic API）"""

    __tablename__ = "custom_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="关联的用户ID",
    )

    account_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="账号显示名称",
    )

    service_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="用户自定义的服务标签（如 DeepSeek、OpenRouter）",
    )

    api_format: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="openai_compatible",
        comment="协议格式：openai_compatible | anthropic",
    )

    base_url: Mapped[Optional[str]] = mapped_column(
        String(1024),
        nullable=True,
        comment="API 基础 URL（info_hidden=True 时为 NULL）",
    )

    proxy_url: Mapped[Optional[str]] = mapped_column(
        String(1024),
        nullable=True,
        comment="可选代理 URL",
    )

    models: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="JSON 数组字符串，如 [\"deepseek-chat\",\"deepseek-coder\"]",
    )

    info_hidden: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="隐藏敏感信息标志（开启后 API Key 和地址不可再查看）",
    )

    credentials: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Fernet 加密的 JSON（包含 api_key，info_hidden 时还含 base_url）",
    )

    status: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
        comment="账号状态：0=禁用，1=启用",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="创建时间",
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        comment="更新时间",
    )

    last_used_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="最后使用时间",
    )

    user: Mapped["User"] = relationship("User", back_populates="custom_accounts")

    def __repr__(self) -> str:
        return f"<CustomAccount(id={self.id}, user_id={self.user_id}, service_name='{self.service_name}')>"
