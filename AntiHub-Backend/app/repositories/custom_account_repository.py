"""
自定义账号数据仓储

约定：
- Repository 层不负责 commit()，事务由调用方（依赖注入的 get_db）统一管理
"""

from __future__ import annotations

from typing import Optional, Sequence

from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.custom_account import CustomAccount


class CustomAccountRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_by_user_id(self, user_id: int) -> Sequence[CustomAccount]:
        result = await self.db.execute(
            select(CustomAccount)
            .where(CustomAccount.user_id == user_id)
            .order_by(CustomAccount.id.asc())
        )
        return result.scalars().all()

    async def list_enabled_by_user_id(self, user_id: int) -> Sequence[CustomAccount]:
        result = await self.db.execute(
            select(CustomAccount)
            .where(CustomAccount.user_id == user_id, CustomAccount.status == 1)
            .order_by(CustomAccount.id.asc())
        )
        return result.scalars().all()

    async def get_by_id(self, account_id: int) -> Optional[CustomAccount]:
        result = await self.db.execute(
            select(CustomAccount).where(CustomAccount.id == account_id)
        )
        return result.scalar_one_or_none()

    async def get_by_id_and_user_id(self, account_id: int, user_id: int) -> Optional[CustomAccount]:
        result = await self.db.execute(
            select(CustomAccount).where(
                CustomAccount.id == account_id,
                CustomAccount.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        user_id: int,
        account_name: str,
        service_name: str,
        api_format: str,
        credentials: str,
        base_url: Optional[str] = None,
        proxy_url: Optional[str] = None,
        models: Optional[str] = None,
        info_hidden: bool = False,
        status: int = 1,
    ) -> CustomAccount:
        account = CustomAccount(
            user_id=user_id,
            account_name=account_name,
            service_name=service_name,
            api_format=api_format,
            credentials=credentials,
            base_url=base_url,
            proxy_url=proxy_url,
            models=models,
            info_hidden=info_hidden,
            status=status,
        )
        self.db.add(account)
        await self.db.flush()
        await self.db.refresh(account)
        return account

    async def update_status(self, account_id: int, user_id: int, status: int) -> Optional[CustomAccount]:
        await self.db.execute(
            update(CustomAccount)
            .where(CustomAccount.id == account_id, CustomAccount.user_id == user_id)
            .values(status=status)
        )
        await self.db.flush()
        return await self.get_by_id_and_user_id(account_id, user_id)

    async def update_name(self, account_id: int, user_id: int, account_name: str) -> Optional[CustomAccount]:
        await self.db.execute(
            update(CustomAccount)
            .where(CustomAccount.id == account_id, CustomAccount.user_id == user_id)
            .values(account_name=account_name)
        )
        await self.db.flush()
        return await self.get_by_id_and_user_id(account_id, user_id)

    async def update_models(self, account_id: int, user_id: int, models_json: Optional[str]) -> Optional[CustomAccount]:
        await self.db.execute(
            update(CustomAccount)
            .where(CustomAccount.id == account_id, CustomAccount.user_id == user_id)
            .values(models=models_json)
        )
        await self.db.flush()
        return await self.get_by_id_and_user_id(account_id, user_id)

    async def update_last_used(self, account_id: int) -> None:
        from sqlalchemy.sql import func
        await self.db.execute(
            update(CustomAccount)
            .where(CustomAccount.id == account_id)
            .values(last_used_at=func.now())
        )
        await self.db.flush()

    async def delete(self, account_id: int, user_id: int) -> bool:
        result = await self.db.execute(
            delete(CustomAccount).where(
                CustomAccount.id == account_id,
                CustomAccount.user_id == user_id,
            )
        )
        await self.db.flush()
        return (result.rowcount or 0) > 0
