#!/bin/bash
set -e

echo "🚀 开始部署 AntiHub..."

# 1. 停止并删除旧容器
echo "📦 停止旧容器..."
docker compose down

# 2. 删除旧镜像
echo "🗑️  删除旧镜像..."
docker rmi ghcr.io/zhongruan0522/antihub-web:latest 2>/dev/null || true
docker rmi ghcr.io/zhongruan0522/antihub-backend:latest 2>/dev/null || true
docker rmi ghcr.io/zhongruan0522/antihub-plugin:latest 2>/dev/null || true

# 3. 重新构建
echo "🔨 重新构建镜像..."
docker compose build --no-cache

# 4. 启动服务
echo "▶️  启动服务..."
docker compose up -d

# 5. 等待服务启动
echo "⏳ 等待服务启动..."
sleep 15

# 6. 检查服务状态
echo "✅ 检查服务状态..."
docker compose ps

# 7. 显示镜像信息
echo "📊 镜像信息:"
docker images | grep antihub

echo "🎉 部署完成！"
echo ""
echo "访问地址:"
echo "  前端: http://localhost:3000"
echo "  后端: http://localhost:8000/api/docs"
