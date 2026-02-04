#!/bin/bash

# AntiHub Docker 镜像构建脚本
# 用法: ./build.sh [web|backend|plugin|all] [tag]

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 默认配置
IMAGE_OWNER=${IMAGE_OWNER:-zhongruan0522}
IMAGE_TAG=${1:-latest}
SERVICE=${2:-all}

echo -e "${GREEN}=== AntiHub Docker 镜像构建 ===${NC}"
echo "镜像所有者: $IMAGE_OWNER"
echo "镜像标签: $IMAGE_TAG"
echo ""

# 构建前端
build_web() {
    echo -e "${YELLOW}>>> 构建前端镜像...${NC}"
    cd AntiHub
    docker build \
        --platform linux/amd64 \
        -t ghcr.io/${IMAGE_OWNER}/antihub-web:${IMAGE_TAG} \
        -f Dockerfile \
        .
    cd ..
    echo -e "${GREEN}✓ 前端镜像构建完成${NC}"
}

# 构建后端
build_backend() {
    echo -e "${YELLOW}>>> 构建后端镜像...${NC}"
    cd AntiHub-Backend
    docker build \
        --platform linux/amd64 \
        -t ghcr.io/${IMAGE_OWNER}/antihub-backend:${IMAGE_TAG} \
        -f Dockerfile \
        .
    cd ..
    echo -e "${GREEN}✓ 后端镜像构建完成${NC}"
}

# 构建插件服务
build_plugin() {
    echo -e "${YELLOW}>>> 构建插件服务镜像...${NC}"
    cd AntiHub-plugin
    docker build \
        --platform linux/amd64 \
        -t ghcr.io/${IMAGE_OWNER}/antihub-plugin:${IMAGE_TAG} \
        -f Dockerfile \
        .
    cd ..
    echo -e "${GREEN}✓ 插件服务镜像构建完成${NC}"
}

# 根据参数构建
case "$SERVICE" in
    web)
        build_web
        ;;
    backend)
        build_backend
        ;;
    plugin)
        build_plugin
        ;;
    all)
        build_web
        build_backend
        build_plugin
        ;;
    *)
        echo -e "${RED}错误: 未知的服务 '$SERVICE'${NC}"
        echo "用法: $0 [tag] [web|backend|plugin|all]"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}=== 构建完成 ===${NC}"
echo ""
echo "查看镜像:"
docker images | grep "antihub"
echo ""
echo "推送镜像到 GitHub Container Registry:"
echo "  docker push ghcr.io/${IMAGE_OWNER}/antihub-web:${IMAGE_TAG}"
echo "  docker push ghcr.io/${IMAGE_OWNER}/antihub-backend:${IMAGE_TAG}"
echo "  docker push ghcr.io/${IMAGE_OWNER}/antihub-plugin:${IMAGE_TAG}"
