"""
UsageLog Repository
提供用量日志的查询/统计能力
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.usage_log import UsageLog


class UsageLogRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _apply_filters(
        self,
        stmt,
        *,
        user_id: int,
        api_key_id: Optional[int] = None,
        start_at: Optional[datetime] = None,
        end_at: Optional[datetime] = None,
        config_type: Optional[str] = None,
        success: Optional[bool] = None,
        model_name: Optional[str] = None,
        endpoint: Optional[str] = None,
    ):
        stmt = stmt.where(UsageLog.user_id == user_id)
        if api_key_id is not None:
            stmt = stmt.where(UsageLog.api_key_id == api_key_id)
        if start_at is not None:
            stmt = stmt.where(UsageLog.created_at >= start_at)
        if end_at is not None:
            stmt = stmt.where(UsageLog.created_at <= end_at)
        if config_type:
            stmt = stmt.where(UsageLog.config_type == config_type)
        if success is not None:
            stmt = stmt.where(UsageLog.success == success)
        if model_name:
            stmt = stmt.where(UsageLog.model_name == model_name)
        if endpoint:
            stmt = stmt.where(UsageLog.endpoint == endpoint)
        return stmt

    async def list_logs(
        self,
        *,
        user_id: int,
        api_key_id: Optional[int] = None,
        limit: int = 50,
        offset: int = 0,
        start_at: Optional[datetime] = None,
        end_at: Optional[datetime] = None,
        config_type: Optional[str] = None,
        success: Optional[bool] = None,
        model_name: Optional[str] = None,
        endpoint: Optional[str] = None,
    ) -> List[UsageLog]:
        stmt = select(UsageLog)
        stmt = self._apply_filters(
            stmt,
            user_id=user_id,
            api_key_id=api_key_id,
            start_at=start_at,
            end_at=end_at,
            config_type=config_type,
            success=success,
            model_name=model_name,
            endpoint=endpoint,
        )
        stmt = stmt.order_by(UsageLog.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_logs(
        self,
        *,
        user_id: int,
        api_key_id: Optional[int] = None,
        start_at: Optional[datetime] = None,
        end_at: Optional[datetime] = None,
        config_type: Optional[str] = None,
        success: Optional[bool] = None,
        model_name: Optional[str] = None,
        endpoint: Optional[str] = None,
    ) -> int:
        stmt = select(func.count(UsageLog.id))
        stmt = self._apply_filters(
            stmt,
            user_id=user_id,
            api_key_id=api_key_id,
            start_at=start_at,
            end_at=end_at,
            config_type=config_type,
            success=success,
            model_name=model_name,
            endpoint=endpoint,
        )
        result = await self.db.execute(stmt)
        return int(result.scalar() or 0)

    async def get_stats(
        self,
        *,
        user_id: int,
        api_key_id: Optional[int] = None,
        start_at: Optional[datetime] = None,
        end_at: Optional[datetime] = None,
        config_type: Optional[str] = None,
        endpoint: Optional[str] = None,
    ) -> Dict[str, Any]:
        base_stmt = select(
            func.count(UsageLog.id).label("total_requests"),
            func.coalesce(
                func.sum(case((UsageLog.success.is_(True), 1), else_=0)), 0
            ).label("success_requests"),
            func.coalesce(
                func.sum(case((UsageLog.success.is_(False), 1), else_=0)), 0
            ).label("failed_requests"),
            func.coalesce(func.sum(UsageLog.input_tokens), 0).label("input_tokens"),
            func.coalesce(func.sum(UsageLog.output_tokens), 0).label("output_tokens"),
            func.coalesce(func.sum(UsageLog.total_tokens), 0).label("total_tokens"),
            func.coalesce(func.sum(UsageLog.quota_consumed), 0).label("total_quota_consumed"),
            func.coalesce(func.avg(UsageLog.duration_ms), 0).label("avg_duration_ms"),
        )
        base_stmt = self._apply_filters(
            base_stmt,
            user_id=user_id,
            api_key_id=api_key_id,
            start_at=start_at,
            end_at=end_at,
            config_type=config_type,
            endpoint=endpoint,
        )
        base_result = await self.db.execute(base_stmt)
        row = base_result.one()

        # 按 config_type 聚合
        by_config_stmt = select(
            UsageLog.config_type,
            func.count(UsageLog.id).label("total_requests"),
            func.coalesce(
                func.sum(case((UsageLog.success.is_(True), 1), else_=0)), 0
            ).label("success_requests"),
            func.coalesce(
                func.sum(case((UsageLog.success.is_(False), 1), else_=0)), 0
            ).label("failed_requests"),
            func.coalesce(func.sum(UsageLog.total_tokens), 0).label("total_tokens"),
            func.coalesce(func.sum(UsageLog.quota_consumed), 0).label("total_quota_consumed"),
        )
        by_config_stmt = self._apply_filters(
            by_config_stmt,
            user_id=user_id,
            api_key_id=api_key_id,
            start_at=start_at,
            end_at=end_at,
            config_type=config_type,
            endpoint=endpoint,
        ).group_by(UsageLog.config_type)
        by_config_rows = (await self.db.execute(by_config_stmt)).all()

        by_config: Dict[str, Any] = {}
        for r in by_config_rows:
            key = r.config_type or "unknown"
            total_reqs = int(r.total_requests or 0)
            success_reqs = int(r.success_requests or 0)
            by_config[key] = {
                "total_requests": total_reqs,
                "success_requests": success_reqs,
                "failed_requests": int(r.failed_requests or 0),
                "success_rate": round((success_reqs / total_reqs * 100), 1) if total_reqs > 0 else 0.0,
                "total_tokens": int(r.total_tokens or 0),
                "total_quota_consumed": float(r.total_quota_consumed or 0.0),
            }

        # 按 model 聚合（只返回 top 50，避免返回过大）
        by_model_stmt = select(
            UsageLog.model_name,
            func.count(UsageLog.id).label("total_requests"),
            func.coalesce(
                func.sum(case((UsageLog.success.is_(True), 1), else_=0)), 0
            ).label("success_requests"),
            func.coalesce(
                func.sum(case((UsageLog.success.is_(False), 1), else_=0)), 0
            ).label("failed_requests"),
            func.coalesce(func.sum(UsageLog.total_tokens), 0).label("total_tokens"),
            func.coalesce(func.sum(UsageLog.quota_consumed), 0).label("total_quota_consumed"),
        )
        by_model_stmt = self._apply_filters(
            by_model_stmt,
            user_id=user_id,
            api_key_id=api_key_id,
            start_at=start_at,
            end_at=end_at,
            config_type=config_type,
            endpoint=endpoint,
        ).group_by(UsageLog.model_name)
        by_model_stmt = by_model_stmt.order_by(
            func.sum(UsageLog.total_tokens).desc(),
            func.sum(UsageLog.quota_consumed).desc(),
        ).limit(50)
        by_model_rows = (await self.db.execute(by_model_stmt)).all()

        by_model: Dict[str, Any] = {}
        for r in by_model_rows:
            key = r.model_name or "unknown"
            total_reqs = int(r.total_requests or 0)
            success_reqs = int(r.success_requests or 0)
            by_model[key] = {
                "total_requests": total_reqs,
                "success_requests": success_reqs,
                "failed_requests": int(r.failed_requests or 0),
                "success_rate": round((success_reqs / total_reqs * 100), 1) if total_reqs > 0 else 0.0,
                "total_tokens": int(r.total_tokens or 0),
                "total_quota_consumed": float(r.total_quota_consumed or 0.0),
            }

        # 按 endpoint 聚合（返回 top 100，按请求数降序）
        by_endpoint_stmt = select(
            UsageLog.endpoint,
            func.count(UsageLog.id).label("total_requests"),
            func.coalesce(
                func.sum(case((UsageLog.success.is_(True), 1), else_=0)), 0
            ).label("success_requests"),
            func.coalesce(
                func.sum(case((UsageLog.success.is_(False), 1), else_=0)), 0
            ).label("failed_requests"),
            func.coalesce(func.sum(UsageLog.input_tokens), 0).label("input_tokens"),
            func.coalesce(func.sum(UsageLog.output_tokens), 0).label("output_tokens"),
            func.coalesce(func.sum(UsageLog.total_tokens), 0).label("total_tokens"),
            func.coalesce(func.sum(UsageLog.quota_consumed), 0).label("total_quota_consumed"),
            func.coalesce(func.avg(UsageLog.duration_ms), 0).label("avg_duration_ms"),
        )
        by_endpoint_stmt = self._apply_filters(
            by_endpoint_stmt,
            user_id=user_id,
            api_key_id=api_key_id,
            start_at=start_at,
            end_at=end_at,
            config_type=config_type,
            endpoint=endpoint,
        ).group_by(UsageLog.endpoint)
        by_endpoint_stmt = by_endpoint_stmt.order_by(
            func.count(UsageLog.id).desc()
        ).limit(100)
        by_endpoint_rows = (await self.db.execute(by_endpoint_stmt)).all()

        by_endpoint: Dict[str, Any] = {}
        for r in by_endpoint_rows:
            key = r.endpoint or "unknown"
            total_reqs = int(r.total_requests or 0)
            success_reqs = int(r.success_requests or 0)
            by_endpoint[key] = {
                "total_requests": total_reqs,
                "success_requests": success_reqs,
                "failed_requests": int(r.failed_requests or 0),
                "success_rate": round((success_reqs / total_reqs * 100), 1) if total_reqs > 0 else 0.0,
                "input_tokens": int(r.input_tokens or 0),
                "output_tokens": int(r.output_tokens or 0),
                "total_tokens": int(r.total_tokens or 0),
                "total_quota_consumed": float(r.total_quota_consumed or 0.0),
                "avg_duration_ms": float(r.avg_duration_ms or 0),
            }

        # 获取最近的请求记录（最多10条）
        recent_stmt = select(UsageLog)
        recent_stmt = self._apply_filters(
            recent_stmt,
            user_id=user_id,
            api_key_id=api_key_id,
            start_at=start_at,
            end_at=end_at,
            config_type=config_type,
            endpoint=endpoint,
        )
        recent_stmt = recent_stmt.order_by(UsageLog.created_at.desc()).limit(10)
        recent_result = await self.db.execute(recent_stmt)
        recent_logs = list(recent_result.scalars().all())

        recent_requests = [
            {
                "id": log.id,
                "endpoint": log.endpoint,
                "method": log.method,
                "model_name": log.model_name,
                "config_type": log.config_type,
                "success": log.success,
                "status_code": log.status_code,
                "duration_ms": log.duration_ms,
                "input_tokens": log.input_tokens,
                "output_tokens": log.output_tokens,
                "total_tokens": log.total_tokens,
                "quota_consumed": log.quota_consumed,
                "error_message": log.error_message,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in recent_logs
        ]

        # 计算总体成功率
        total_reqs = int(row.total_requests or 0)
        success_reqs = int(row.success_requests or 0)
        success_rate = round((success_reqs / total_reqs * 100), 1) if total_reqs > 0 else 0.0

        return {
            "total_requests": total_reqs,
            "success_requests": success_reqs,
            "failed_requests": int(row.failed_requests or 0),
            "success_rate": success_rate,
            "input_tokens": int(row.input_tokens or 0),
            "output_tokens": int(row.output_tokens or 0),
            "total_tokens": int(row.total_tokens or 0),
            "total_quota_consumed": float(row.total_quota_consumed or 0.0),
            "avg_duration_ms": float(row.avg_duration_ms or 0),
            "by_config_type": by_config,
            "by_model": by_model,
            "by_endpoint": by_endpoint,
            "recent_requests": recent_requests,
        }
