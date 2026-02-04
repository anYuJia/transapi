#!/bin/bash
set -e

echo "🚀 构建并推送镜像到仓库..."

# 读取镜像所有者和标签
IMAGE_OWNER=${IMAGE_OWNER:-zhongruan0522}
IMAGE_TAG=${IMAGE_TAG:-latest}

echo "📦 镜像配置:"
echo "  所有者: $IMAGE_OWNER"
echo "  标签: $IMAGE_TAG"
echo ""

# 1. 构建镜像
echo "🔨 构建镜像..."
docker compose -f docker-compose.push.yml build --no-cache

# 2. 推送镜像
echo "📤 推送镜像到 ghcr.io..."
docker compose -f docker-compose.push.yml push

echo "✅ 推送完成！"
echo ""
echo "推送的镜像:"
echo "  ghcr.io/$IMAGE_OWNER/antihub-web:$IMAGE_TAG"
echo "  ghcr.io/$IMAGE_OWNER/antihub-backend:$IMAGE_TAG"
echo "  ghcr.io/$IMAGE_OWNER/antihub-plugin:$IMAGE_TAG"
