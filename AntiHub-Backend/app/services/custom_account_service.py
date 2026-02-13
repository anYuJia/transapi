"""
自定义账号服务

功能：
- 创建/列表/查询/删除自定义账号
- 加密 credentials（api_key + 可选 base_url）
- info_hidden 逻辑：隐藏时 base_url 存入加密 credentials，列字段置 NULL
- 导出凭据（仅 info_hidden=False 时允许）
- 选取可用账号供代理转发使用
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.custom_account_repository import CustomAccountRepository
from app.models.custom_account import CustomAccount
from app.utils.encryption import encrypt_api_key as encrypt_secret
from app.utils.encryption import decrypt_api_key as decrypt_secret

logger = logging.getLogger(__name__)


class CustomAccountService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = CustomAccountRepository(db)

    # ==================== 创建 ====================

    async def create_account(
        self,
        user_id: int,
        account_name: str,
        service_name: str,
        api_format: str,
        base_url: str,
        api_key: str,
        proxy_url: Optional[str] = None,
        models: Optional[List[str]] = None,
        info_hidden: bool = False,
    ) -> CustomAccount:
        # 构建 credentials JSON
        cred_data: Dict[str, Any] = {"api_key": api_key}
        if info_hidden:
            cred_data["base_url"] = base_url

        encrypted_cred = encrypt_secret(json.dumps(cred_data, ensure_ascii=False))

        # info_hidden 时 base_url 列置 NULL
        stored_base_url = None if info_hidden else base_url

        # models 转 JSON 字符串
        models_json = json.dumps(models, ensure_ascii=False) if models else None

        return await self.repo.create(
            user_id=user_id,
            account_name=account_name,
            service_name=service_name,
            api_format=api_format,
            credentials=encrypted_cred,
            base_url=stored_base_url,
            proxy_url=proxy_url,
            models=models_json,
            info_hidden=info_hidden,
        )

    # ==================== 列表/查询 ====================

    async def list_accounts(self, user_id: int) -> List[Dict[str, Any]]:
        accounts = await self.repo.list_by_user_id(user_id)
        return [self._account_to_response(acc) for acc in accounts]

    async def get_account(self, user_id: int, account_id: int) -> Optional[Dict[str, Any]]:
        acc = await self.repo.get_by_id_and_user_id(account_id, user_id)
        if not acc:
            return None
        return self._account_to_response(acc)

    # ==================== 导出凭据 ====================

    async def export_credentials(self, user_id: int, account_id: int) -> Optional[Dict[str, Any]]:
        """导出凭据。info_hidden=True 时拒绝（返回 None 由调用方返回 403）。"""
        acc = await self.repo.get_by_id_and_user_id(account_id, user_id)
        if not acc:
            return None

        if acc.info_hidden:
            raise PermissionError("该账号已开启信息隐藏，无法导出凭据")

        return self._decrypt_credentials(acc)

    # ==================== 更新 ====================

    async def update_status(self, user_id: int, account_id: int, new_status: int) -> Optional[CustomAccount]:
        return await self.repo.update_status(account_id, user_id, new_status)

    async def update_name(self, user_id: int, account_id: int, account_name: str) -> Optional[CustomAccount]:
        return await self.repo.update_name(account_id, user_id, account_name)

    async def update_models(self, user_id: int, account_id: int, models: Optional[List[str]]) -> Optional[CustomAccount]:
        models_json = json.dumps(models, ensure_ascii=False) if models else None
        return await self.repo.update_models(account_id, user_id, models_json)

    # ==================== 删除 ====================

    async def delete_account(self, user_id: int, account_id: int) -> bool:
        return await self.repo.delete(account_id, user_id)

    # ==================== 代理转发用 ====================

    async def select_active_account(
        self,
        user_id: int,
        allowed_account_ids: Optional[List[int]] = None,
    ) -> Optional[CustomAccount]:
        """选取一个可用的自定义账号（status=1，按 id ASC）。"""
        accounts = await self.repo.list_enabled_by_user_id(user_id)
        if not accounts:
            return None

        if allowed_account_ids is not None:
            allowed_set = set(allowed_account_ids)
            accounts = [a for a in accounts if a.id in allowed_set]

        return accounts[0] if accounts else None

    def get_decrypted_credentials(self, account: CustomAccount) -> Dict[str, Any]:
        """解密 credentials，返回 api_key + base_url（内部使用）。"""
        cred = self._decrypt_credentials(account)

        # 如果 info_hidden=False，base_url 在列字段里
        if "base_url" not in cred and account.base_url:
            cred["base_url"] = account.base_url

        return cred

    async def mark_last_used(self, account_id: int) -> None:
        await self.repo.update_last_used(account_id)

    # ==================== 内部方法 ====================

    def _decrypt_credentials(self, account: CustomAccount) -> Dict[str, Any]:
        raw = decrypt_secret(account.credentials)
        return json.loads(raw)

    @staticmethod
    def _parse_models(models_json: Optional[str]) -> Optional[List[str]]:
        if not models_json:
            return None
        try:
            parsed = json.loads(models_json)
            if isinstance(parsed, list):
                return parsed
        except (json.JSONDecodeError, TypeError):
            pass
        return None

    def _account_to_response(self, acc: CustomAccount) -> Dict[str, Any]:
        return {
            "id": acc.id,
            "user_id": acc.user_id,
            "account_name": acc.account_name,
            "service_name": acc.service_name,
            "api_format": acc.api_format,
            "base_url": acc.base_url,  # info_hidden 时为 None
            "proxy_url": acc.proxy_url,
            "models": self._parse_models(acc.models),
            "info_hidden": acc.info_hidden,
            "status": acc.status,
            "created_at": acc.created_at,
            "updated_at": acc.updated_at,
            "last_used_at": acc.last_used_at,
        }
