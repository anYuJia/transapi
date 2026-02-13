"""
API密钥相关的数据模式
"""
from typing import Optional, Literal, List
from datetime import datetime
from pydantic import BaseModel, Field


APIKeyConfigType = Literal[
    "antigravity",
    "kiro",
    "qwen",
    "codex",
    "gemini-cli",
    "zai-tts",
    "zai-image",
    "custom",
]


class APIKeyCreate(BaseModel):
    """创建API密钥请求"""
    name: Optional[str] = Field(None, description="密钥名称，方便识别")
    config_type: APIKeyConfigType = Field(
        "antigravity",
        description="配置类型：antigravity / kiro / qwen / codex / gemini-cli / zai-tts / zai-image",
    )
    allowed_account_ids: Optional[List[int]] = Field(
        None,
        description="允许使用的账号ID列表；NULL=全部账号，[]=无账号，[1,2,3]=指定账号",
    )


class APIKeyResponse(BaseModel):
    """API密钥响应"""
    id: int
    user_id: int
    key: str = Field(..., description="API密钥")
    name: Optional[str] = None
    config_type: APIKeyConfigType = Field(
        ...,
        description="配置类型：antigravity / kiro / qwen / codex / gemini-cli / zai-tts / zai-image",
    )
    is_active: bool
    created_at: datetime
    last_used_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    allowed_account_ids: Optional[List[int]] = Field(
        None,
        description="允许使用的账号ID列表；NULL=全部账号",
    )

    model_config = {"from_attributes": True}


class APIKeyListResponse(BaseModel):
    """API密钥列表响应（不包含完整密钥）"""
    id: int
    user_id: int
    key_preview: str = Field(..., description="密钥预览（前8位）")
    name: Optional[str] = None
    config_type: APIKeyConfigType = Field(
        ...,
        description="配置类型：antigravity / kiro / qwen / codex / gemini-cli / zai-tts / zai-image",
    )
    is_active: bool
    created_at: datetime
    last_used_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    allowed_account_ids: Optional[List[int]] = Field(
        None,
        description="允许使用的账号ID列表；NULL=全部账号",
    )
    allowed_account_count: Optional[int] = Field(
        None,
        description="允许使用的账号数量；NULL=全部账号",
    )

    model_config = {"from_attributes": True}


class APIKeyUpdateStatus(BaseModel):
    """更新API密钥状态"""
    is_active: bool = Field(..., description="是否激活")


class APIKeyUpdateType(BaseModel):
    """更新API密钥类型"""
    config_type: APIKeyConfigType = Field(
        ...,
        description="配置类型：antigravity / kiro / qwen / codex / gemini-cli / zai-tts / zai-image",
    )


class APIKeyUpdateAccounts(BaseModel):
    """更新API密钥允许的账号"""
    allowed_account_ids: Optional[List[int]] = Field(
        None,
        description="允许使用的账号ID列表；NULL=全部账号，[]=无账号，[1,2,3]=指定账号",
    )


class AccountSummary(BaseModel):
    """账号摘要（用于账号选择列表）"""
    account_id: int = Field(..., description="账号ID")
    account_name: str = Field(..., description="账号名称")
    email: Optional[str] = Field(None, description="账号邮箱")
    status: int = Field(..., description="账号状态：0=禁用，1=启用")
