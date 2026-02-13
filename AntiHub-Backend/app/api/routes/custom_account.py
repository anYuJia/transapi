"""
自定义账号管理 API

功能：
- 创建/列表/详情/删除自定义账号
- 启用/禁用、重命名、更新模型列表
- 导出凭据（info_hidden 时拒绝）
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session
from app.models.user import User
from app.schemas.custom_account import (
    CustomAccountCreateRequest,
    CustomAccountUpdateStatusRequest,
    CustomAccountUpdateNameRequest,
    CustomAccountUpdateModelsRequest,
    CustomAccountResponse,
)
from app.services.custom_account_service import CustomAccountService


router = APIRouter(prefix="/api/custom", tags=["自定义账号管理"])
logger = logging.getLogger(__name__)


def get_custom_account_service(
    db: AsyncSession = Depends(get_db_session),
) -> CustomAccountService:
    return CustomAccountService(db)


def _serialize_account(data: dict) -> dict:
    return CustomAccountResponse.model_validate(data).model_dump(by_alias=False)


@router.post(
    "/accounts",
    summary="创建自定义账号",
    description="添加一个自定义 API 账号（OpenAI 兼容 / Anthropic）",
)
async def create_account(
    request: CustomAccountCreateRequest,
    current_user: User = Depends(get_current_user),
    service: CustomAccountService = Depends(get_custom_account_service),
):
    try:
        if request.api_format not in ("openai_compatible", "anthropic"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="api_format 必须是 openai_compatible 或 anthropic",
            )

        account = await service.create_account(
            user_id=current_user.id,
            account_name=request.account_name,
            service_name=request.service_name,
            api_format=request.api_format,
            base_url=request.base_url,
            api_key=request.api_key,
            proxy_url=request.proxy_url,
            models=request.models,
            info_hidden=request.info_hidden,
        )
        resp = await service.get_account(current_user.id, account.id)
        return {"success": True, "message": "创建成功", "data": resp}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"创建自定义账号失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"创建自定义账号失败: {str(e)}",
        )


@router.get(
    "/accounts",
    summary="列出自定义账号",
    description="获取当前用户的所有自定义账号",
)
async def list_accounts(
    current_user: User = Depends(get_current_user),
    service: CustomAccountService = Depends(get_custom_account_service),
):
    try:
        accounts = await service.list_accounts(current_user.id)
        return {"success": True, "data": accounts}
    except Exception as e:
        logger.error(f"列出自定义账号失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"列出自定义账号失败: {str(e)}",
        )


@router.get(
    "/accounts/{account_id}",
    summary="获取自定义账号详情",
)
async def get_account(
    account_id: int,
    current_user: User = Depends(get_current_user),
    service: CustomAccountService = Depends(get_custom_account_service),
):
    try:
        account = await service.get_account(current_user.id, account_id)
        if not account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="账号不存在或无权访问",
            )
        return {"success": True, "data": account}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取自定义账号失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取自定义账号失败: {str(e)}",
        )


@router.get(
    "/accounts/{account_id}/credentials",
    summary="导出凭据",
    description="导出账号凭据（info_hidden 账号不允许导出）",
)
async def export_credentials(
    account_id: int,
    current_user: User = Depends(get_current_user),
    service: CustomAccountService = Depends(get_custom_account_service),
):
    try:
        cred = await service.export_credentials(current_user.id, account_id)
        if cred is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="账号不存在或无权访问",
            )
        return {"success": True, "data": cred}
    except PermissionError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(e),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"导出凭据失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"导出凭据失败: {str(e)}",
        )


@router.put(
    "/accounts/{account_id}/status",
    summary="启用/禁用账号",
)
async def update_status(
    account_id: int,
    request: CustomAccountUpdateStatusRequest,
    current_user: User = Depends(get_current_user),
    service: CustomAccountService = Depends(get_custom_account_service),
):
    try:
        account = await service.update_status(current_user.id, account_id, request.status)
        if not account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="账号不存在或无权操作",
            )
        resp = await service.get_account(current_user.id, account.id)
        return {"success": True, "message": "状态已更新", "data": resp}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新状态失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"更新状态失败: {str(e)}",
        )


@router.put(
    "/accounts/{account_id}/name",
    summary="重命名账号",
)
async def update_name(
    account_id: int,
    request: CustomAccountUpdateNameRequest,
    current_user: User = Depends(get_current_user),
    service: CustomAccountService = Depends(get_custom_account_service),
):
    try:
        account = await service.update_name(current_user.id, account_id, request.account_name)
        if not account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="账号不存在或无权操作",
            )
        resp = await service.get_account(current_user.id, account.id)
        return {"success": True, "message": "名称已更新", "data": resp}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"重命名失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"重命名失败: {str(e)}",
        )


@router.put(
    "/accounts/{account_id}/models",
    summary="更新模型列表",
)
async def update_models(
    account_id: int,
    request: CustomAccountUpdateModelsRequest,
    current_user: User = Depends(get_current_user),
    service: CustomAccountService = Depends(get_custom_account_service),
):
    try:
        account = await service.update_models(current_user.id, account_id, request.models)
        if not account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="账号不存在或无权操作",
            )
        resp = await service.get_account(current_user.id, account.id)
        return {"success": True, "message": "模型列表已更新", "data": resp}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新模型列表失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"更新模型列表失败: {str(e)}",
        )


@router.delete(
    "/accounts/{account_id}",
    summary="删除自定义账号",
)
async def delete_account(
    account_id: int,
    current_user: User = Depends(get_current_user),
    service: CustomAccountService = Depends(get_custom_account_service),
):
    try:
        success = await service.delete_account(current_user.id, account_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="账号不存在或无权删除",
            )
        return {"success": True, "message": "账号已删除"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除自定义账号失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"删除自定义账号失败: {str(e)}",
        )
