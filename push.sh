#!/bin/bash

# AntiHub Docker 镜像推送脚本
# 用法: ./push.sh [tag]

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 默认配置
IMAGE_OWNER=${IMAGE_OWNER:-zhongruan0522}
IMAGE_TAG=${1:-latest}

echo -e "${GREEN}=== AntiHub Docker 镜像推送 ===${NC}"
echo "镜像所有者: $IMAGE_OWNER"
echo "镜像标签: $IMAGE_TAG"
echo ""

# 检查是否已登录
if ! docker info | grep -q "Username"; then
    echo -e "${YELLOW}>>> 请先登录 GitHub Container Registry${NC}"
    echo "运行: echo \$GITHUB_TOKEN | docker login ghcr.io -u \$GITHUB_USERNAME --password-stdin"
    exit 1
fi

# 推送镜像
echo -e "${YELLOW}>>> 推送前端镜像...${NC}"
docker push ghcr.io/${IMAGE_OWNER}/antihub-web:${IMAGE_TAG}
echo -e "${GREEN}✓ 前端镜像推送完成${NC}"

echo -e "${YELLOW}>>> 推送后端镜像...${NC}"
docker push ghcr.io/${IMAGE_OWNER}/antihub-backend:${IMAGE_TAG}
echo -e "${GREEN}✓ 后端镜像推送完成${NC}"

echo -e "${YELLOW}>>> 推送插件服务镜像...${NC}"
docker push ghcr.io/${IMAGE_OWNER}/antihub-plugin:${IMAGE_TAG}
echo -e "${GREEN}✓ 插件服务镜像推送完成${NC}"

echo ""
echo -e "${GREEN}=== 推送完成 ===${NC}"
echo ""
echo "镜像地址:"
echo "  ghcr.io/${IMAGE_OWNER}/antihub-web:${IMAGE_TAG}"
echo "  ghcr.io/${IMAGE_OWNER}/antihub-backend:${IMAGE_TAG}"
echo "  ghcr.io/${IMAGE_OWNER}/antihub-plugin:${IMAGE_TAG}"
