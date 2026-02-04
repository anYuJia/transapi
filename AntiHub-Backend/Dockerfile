# ============================================
# AntiHub-Backend - 简化版 Dockerfile
# ============================================
FROM python:3.10-slim

WORKDIR /app

# 复制依赖文件
COPY pyproject.toml ./

# 安装依赖（使用 uv，只安装依赖不安装项目本身）
RUN pip install --no-cache-dir uv && \
    uv pip install --system --no-cache \
    fastapi==0.104.1 \
    uvicorn[standard]==0.24.0 \
    sqlalchemy==2.0.23 \
    asyncpg==0.29.0 \
    alembic==1.12.1 \
    redis==5.0.1 \
    pyjwt==2.8.0 \
    passlib[bcrypt]==1.7.4 \
    cryptography==41.0.7 \
    httpx==0.25.2 \
    pydantic==2.5.2 \
    pydantic-settings==2.1.0 \
    python-dotenv==1.0.0 \
    python-multipart==0.0.6

# 复制应用代码
COPY . .

# 设置环境变量
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# 暴露端口
EXPOSE 8000

# 启动命令（先运行数据库迁移，再启动服务）
CMD ["sh", "-c", "alembic upgrade head || alembic stamp head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
