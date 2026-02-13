"""
自定义账号相关的 Pydantic Schema
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class CustomAccountCreateRequest(BaseModel):
    """创建自定义账号"""

    account_name: str = Field(..., description="账号显示名称")
    service_name: str = Field(..., description="服务标签（如 DeepSeek、OpenRouter）")
    api_format: str = Field(
        "openai_compatible",
        description="协议格式：openai_compatible | anthropic",
    )
    base_url: str = Field(..., description="API 基础 URL")
    api_key: str = Field(..., description="API Key")
    proxy_url: Optional[str] = Field(None, description="可选代理 URL")
    models: Optional[List[str]] = Field(None, description="模型列表")
    info_hidden: bool = Field(False, description="隐藏敏感信息（开启后不可再查看）")


class CustomAccountUpdateStatusRequest(BaseModel):
    """更新账号状态"""

    status: int = Field(..., description="0=禁用，1=启用")


class CustomAccountUpdateNameRequest(BaseModel):
    """重命名账号"""

    account_name: str = Field(..., description="账号显示名称")


class CustomAccountUpdateModelsRequest(BaseModel):
    """更新模型列表"""

    models: Optional[List[str]] = Field(None, description="模型列表")


class CustomAccountResponse(BaseModel):
    """自定义账号响应"""

    account_id: int = Field(..., alias="id")
    user_id: int
    account_name: str
    service_name: str
    api_format: str
    base_url: Optional[str] = None
    proxy_url: Optional[str] = None
    models: Optional[List[str]] = None
    info_hidden: bool = False
    status: int = 1
    created_at: datetime
    updated_at: datetime
    last_used_at: Optional[datetime] = None

    model_config = {"from_attributes": True, "populate_by_name": True}


class CustomAccountListResponse(BaseModel):
    """自定义账号列表响应"""

    success: bool = True
    data: List[CustomAccountResponse]


class CustomAccountCredentialsResponse(BaseModel):
    """凭据导出响应"""

    success: bool = True
    data: Dict[str, Any]
