"""
API密钥管理路由
用户可以创建、查看、删除自己的API密钥
"""
from typing import List, Optional
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, get_redis, get_db_session
from app.cache import RedisClient
from app.models.user import User
from app.repositories.api_key_repository import APIKeyRepository
from app.repositories.usage_log_repository import UsageLogRepository
from app.schemas.api_key import (
    APIKeyCreate,
    APIKeyResponse,
    APIKeyListResponse,
    APIKeyUpdateStatus,
    APIKeyUpdateType,
    APIKeyUpdateAccounts,
    AccountSummary,
)



router = APIRouter(prefix="/api-keys", tags=["API密钥管理"])
logger = logging.getLogger(__name__)


@router.post(
    "",
    response_model=APIKeyResponse,
    summary="创建API密钥",
    description="为当前用户创建一个新的API密钥"
)
async def create_api_key(
    request: APIKeyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """创建新的API密钥"""
    try:
        repo = APIKeyRepository(db)
        api_key = await repo.create(
            user_id=current_user.id,
            name=request.name,
            config_type=request.config_type,
            allowed_account_ids=request.allowed_account_ids,
        )
        await db.commit()
        return APIKeyResponse.model_validate(api_key)
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"创建API密钥失败"
        )


@router.get(
    "",
    response_model=List[APIKeyListResponse],
    summary="获取API密钥列表",
    description="获取当前用户的所有API密钥（密钥只显示前8位）"
)
async def list_api_keys(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取用户的所有API密钥"""
    try:
        repo = APIKeyRepository(db)
        keys = await repo.get_by_user_id(current_user.id)

        # 转换为列表响应，只显示密钥前8位
        return [
            APIKeyListResponse(
                id=key.id,
                user_id=key.user_id,
                key_preview=key.key[:8] + "..." if len(key.key) > 8 else key.key,
                name=key.name,
                config_type=key.config_type,
                is_active=key.is_active,
                created_at=key.created_at,
                last_used_at=key.last_used_at,
                expires_at=key.expires_at,
                allowed_account_ids=key.allowed_account_ids,
                allowed_account_count=len(key.allowed_account_ids) if key.allowed_account_ids is not None else None,
            )
            for key in keys
        ]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取API密钥列表失败"
        )


@router.get(
    "/{key_id}",
    response_model=APIKeyResponse,
    summary="获取API密钥详情",
    description="获取指定API密钥的完整信息（包含完整密钥）"
)
async def get_api_key(
    key_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取API密钥详情"""
    try:
        repo = APIKeyRepository(db)
        api_key = await repo.get_by_id(key_id)
        
        if not api_key:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="API密钥不存在"
            )
        
        if api_key.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="无权访问此API密钥"
            )
        
        return APIKeyResponse.model_validate(api_key)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取API密钥失败"
        )


@router.patch(
    "/{key_id}/status",
    response_model=APIKeyResponse,
    summary="更新API密钥状态",
    description="启用或禁用指定的API密钥"
)
async def update_api_key_status(
    key_id: int,
    request: APIKeyUpdateStatus,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """更新API密钥状态"""
    try:
        repo = APIKeyRepository(db)
        api_key = await repo.update_status(
            key_id=key_id,
            user_id=current_user.id,
            is_active=request.is_active
        )
        
        if not api_key:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="API密钥不存在或无权访问"
            )
        
        await db.commit()
        return APIKeyResponse.model_validate(api_key)
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"更新API密钥状态失败"
        )


@router.patch(
    "/{key_id}/type",
    response_model=APIKeyResponse,
    summary="更新API密钥类型",
    description="修改指定API密钥的配置类型（config_type）"
)
async def update_api_key_type(
    key_id: int,
    request: APIKeyUpdateType,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: RedisClient = Depends(get_redis),
):
    """更新API密钥类型"""
    try:
        repo = APIKeyRepository(db)

        # 先读一次旧值用于审计日志（不要打印 key 明文）
        old_key = await repo.get_by_id(key_id)
        if not old_key or old_key.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="API密钥不存在或无权访问"
            )
        old_type = old_key.config_type

        api_key = await repo.update_type(
            key_id=key_id,
            user_id=current_user.id,
            config_type=request.config_type,
        )

        if not api_key:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="API密钥不存在或无权访问"
            )

        await db.commit()

        logger.info(
            "api_key config_type updated: user_id=%s key_id=%s from=%s to=%s",
            current_user.id,
            key_id,
            old_type,
            request.config_type,
        )

        # 清理 API Key 认证缓存，避免 config_type 变更后短时间内继续走旧路由
        try:
            await redis.delete(f"api_key_auth:{api_key.key}")
        except Exception:
            # Redis 不可用不应阻塞更新
            pass

        return APIKeyResponse.model_validate(api_key)
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"更新API密钥类型失败"
        )


@router.patch(
    "/{key_id}/accounts",
    response_model=APIKeyResponse,
    summary="更新API密钥允许的账号",
    description="修改指定API密钥可使用的账号列表"
)
async def update_api_key_accounts(
    key_id: int,
    request: APIKeyUpdateAccounts,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: RedisClient = Depends(get_redis),
):
    """更新API密钥允许的账号"""
    try:
        repo = APIKeyRepository(db)

        # 先读一次旧值用于审计日志
        old_key = await repo.get_by_id(key_id)
        if not old_key or old_key.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="API密钥不存在或无权访问"
            )
        old_accounts = old_key.allowed_account_ids

        api_key = await repo.update_allowed_accounts(
            key_id=key_id,
            user_id=current_user.id,
            allowed_account_ids=request.allowed_account_ids,
        )

        if not api_key:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="API密钥不存在或无权访问"
            )

        await db.commit()

        logger.info(
            "api_key allowed_accounts updated: user_id=%s key_id=%s from=%s to=%s",
            current_user.id,
            key_id,
            old_accounts,
            request.allowed_account_ids,
        )

        # 清理 API Key 认证缓存
        try:
            await redis.delete(f"api_key_auth:{api_key.key}")
        except Exception:
            pass

        return APIKeyResponse.model_validate(api_key)
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"更新API密钥账号失败"
        )


@router.get(
    "/config-accounts/{config_type}",
    response_model=List[AccountSummary],
    summary="获取指定类型的账号列表",
    description="获取当前用户指定配置类型的所有账号（用于账号选择）"
)
async def get_accounts_by_type(
    config_type: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取指定类型的账号列表"""
    try:
        accounts: List[AccountSummary] = []

        if config_type == "codex":
            from app.models.codex_account import CodexAccount
            from sqlalchemy import select
            result = await db.execute(
                select(CodexAccount)
                .where(CodexAccount.user_id == current_user.id)
                .order_by(CodexAccount.created_at.desc())
            )
            for acc in result.scalars().all():
                accounts.append(AccountSummary(
                    account_id=acc.id,
                    account_name=acc.account_name,
                    email=acc.email,
                    status=acc.status,
                ))

        elif config_type == "gemini-cli":
            from app.models.gemini_cli_account import GeminiCLIAccount
            from sqlalchemy import select
            result = await db.execute(
                select(GeminiCLIAccount)
                .where(GeminiCLIAccount.user_id == current_user.id)
                .order_by(GeminiCLIAccount.created_at.desc())
            )
            for acc in result.scalars().all():
                accounts.append(AccountSummary(
                    account_id=acc.id,
                    account_name=acc.account_name,
                    email=acc.email,
                    status=acc.status,
                ))

        elif config_type == "zai-tts":
            from app.models.zai_tts_account import ZaiTTSAccount
            from sqlalchemy import select
            result = await db.execute(
                select(ZaiTTSAccount)
                .where(ZaiTTSAccount.user_id == current_user.id)
                .order_by(ZaiTTSAccount.created_at.desc())
            )
            for acc in result.scalars().all():
                accounts.append(AccountSummary(
                    account_id=acc.id,
                    account_name=acc.account_name,
                    email=None,
                    status=acc.status,
                ))

        elif config_type == "zai-image":
            from app.models.zai_image_account import ZaiImageAccount
            from sqlalchemy import select
            result = await db.execute(
                select(ZaiImageAccount)
                .where(ZaiImageAccount.user_id == current_user.id)
                .order_by(ZaiImageAccount.created_at.desc())
            )
            for acc in result.scalars().all():
                accounts.append(AccountSummary(
                    account_id=acc.id,
                    account_name=acc.account_name,
                    email=None,
                    status=acc.status,
                ))

        elif config_type in ("antigravity", "kiro", "qwen"):
            # 这些类型由插件服务管理，暂不支持账号选择
            pass

        return accounts
    except Exception as e:
        logger.error(f"获取账号列表失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取账号列表失败"
        )


@router.delete(
    "/{key_id}",
    summary="删除API密钥",
    description="删除指定的API密钥"
)
async def delete_api_key(
    key_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """删除API密钥"""
    try:
        repo = APIKeyRepository(db)
        success = await repo.delete(key_id, current_user.id)

        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="API密钥不存在或无权删除"
            )

        await db.commit()
        return {"message": "API密钥已删除", "success": True}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"删除API密钥失败"
        )


def _parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    """解析 ISO8601 格式的日期时间字符串"""
    if not value:
        return None
    text = value.strip()
    if not text:
        return None
    # 支持 2026-01-14T12:00:00Z
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except Exception as e:
        raise ValueError("start_date/end_date 必须是 ISO8601 格式") from e
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


@router.get(
    "/{key_id}/usage/stats",
    summary="获取API密钥用量统计",
    description="获取指定API密钥的用量统计信息（从 Kiro 消费记录）"
)
async def get_api_key_usage_stats(
    key_id: int,
    start_date: Optional[str] = Query(None, description="开始时间（ISO8601）"),
    end_date: Optional[str] = Query(None, description="结束时间（ISO8601）"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session)
):
    """
    获取API密钥的用量统计（从 kiro_consumption_log 表）
    包括：
    - 总请求数
    - 成功/失败请求数
    - Token 用量
    - 配额消耗
    - 按 model、endpoint 分组的统计
    """
    try:
        # 验证 API Key 是否属于当前用户
        key_repo = APIKeyRepository(db)
        api_key = await key_repo.get_by_id(key_id)

        if not api_key:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="API密钥不存在"
            )

        if api_key.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="无权访问此API密钥"
            )

        # 调用插件 API 获取统计数据
        import httpx
        from app.core.config import settings

        plugin_url = f"{settings.plugin_api_base_url}/api/kiro/usage/by-api-key/{key_id}"
        params = {}
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date

        headers = {
            "Authorization": f"Bearer {settings.plugin_api_admin_key}"
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(plugin_url, params=params, headers=headers)

            if response.status_code != 200:
                logger.error(f"插件API调用失败: {response.status_code} - {response.text}")
                # 如果插件API失败，返回空数据
                return {
                    "success": True,
                    "data": {
                        "api_key_id": key_id,
                        "api_key_name": api_key.name,
                        "range": {
                            "start_date": start_date,
                            "end_date": end_date,
                        },
                        "total_requests": 0,
                        "success_requests": 0,
                        "failed_requests": 0,
                        "success_rate": 0.0,
                        "input_tokens": 0,
                        "output_tokens": 0,
                        "total_tokens": 0,
                        "total_quota_consumed": 0.0,
                        "avg_duration_ms": 0.0,
                        "by_config_type": {"kiro": {"total_requests": 0, "success_requests": 0, "failed_requests": 0, "success_rate": 0.0, "total_tokens": 0, "total_quota_consumed": 0.0}},
                        "by_model": {},
                        "by_endpoint": {},
                        "recent_requests": []
                    }
                }

            plugin_data = response.json()
            if not plugin_data.get("success"):
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="获取统计数据失败"
                )

            stats = plugin_data["data"]
            base_stats = stats["base"]

            # 计算成功率
            total_reqs = int(base_stats.get("total_requests") or 0)
            success_reqs = int(base_stats.get("success_requests") or 0)
            success_rate = round((success_reqs / total_reqs * 100), 1) if total_reqs > 0 else 0.0

            # 转换 by_model 数据格式
            by_model = {}
            for row in stats.get("by_model", []):
                model_name = row.get("model_id") or "unknown"
                model_total = int(row.get("total_requests") or 0)
                model_success = int(row.get("success_requests") or 0)
                by_model[model_name] = {
                    "total_requests": model_total,
                    "success_requests": model_success,
                    "failed_requests": int(row.get("failed_requests") or 0),
                    "success_rate": round((model_success / model_total * 100), 1) if model_total > 0 else 0.0,
                    "total_tokens": int(row.get("total_tokens") or 0),
                    "total_quota_consumed": float(row.get("total_quota_consumed") or 0.0)
                }

            # 转换 by_endpoint 数据格式
            by_endpoint = {}
            for row in stats.get("by_endpoint", []):
                endpoint_name = row.get("endpoint") or "unknown"
                endpoint_total = int(row.get("total_requests") or 0)
                endpoint_success = int(row.get("success_requests") or 0)
                by_endpoint[endpoint_name] = {
                    "total_requests": endpoint_total,
                    "success_requests": endpoint_success,
                    "failed_requests": int(row.get("failed_requests") or 0),
                    "success_rate": round((endpoint_success / endpoint_total * 100), 1) if endpoint_total > 0 else 0.0,
                    "input_tokens": int(row.get("input_tokens") or 0),
                    "output_tokens": int(row.get("output_tokens") or 0),
                    "total_tokens": int(row.get("total_tokens") or 0),
                    "total_quota_consumed": float(row.get("total_quota_consumed") or 0.0),
                    "avg_duration_ms": float(row.get("avg_duration_ms") or 0.0)
                }

            return {
                "success": True,
                "data": {
                    "api_key_id": key_id,
                    "api_key_name": api_key.name,
                    "range": {
                        "start_date": start_date,
                        "end_date": end_date,
                    },
                    "total_requests": total_reqs,
                    "success_requests": success_reqs,
                    "failed_requests": int(base_stats.get("failed_requests") or 0),
                    "success_rate": success_rate,
                    "input_tokens": int(base_stats.get("input_tokens") or 0),
                    "output_tokens": int(base_stats.get("output_tokens") or 0),
                    "total_tokens": int(base_stats.get("total_tokens") or 0),
                    "total_quota_consumed": float(base_stats.get("total_quota_consumed") or 0.0),
                    "avg_duration_ms": float(base_stats.get("avg_duration_ms") or 0.0),
                    "by_config_type": {
                        "kiro": {
                            "total_requests": total_reqs,
                            "success_requests": success_reqs,
                            "failed_requests": int(base_stats.get("failed_requests") or 0),
                            "success_rate": success_rate,
                            "total_tokens": int(base_stats.get("total_tokens") or 0),
                            "total_quota_consumed": float(base_stats.get("total_quota_consumed") or 0.0)
                        }
                    },
                    "by_model": by_model,
                    "by_endpoint": by_endpoint,
                    "hourly_model_stats": stats.get("hourly_model_stats", []),
                    "recent_requests": stats.get("recent_requests", [])
                },
            }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"获取API密钥用量统计失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取API密钥用量统计失败",
        )
