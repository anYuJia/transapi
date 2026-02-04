# 🔧 服务器部署：强制使用本地构建

## 问题原因

docker-compose.yml 同时配置了 `build` 和 `image`：

```yaml
services:
  web:
    build:
      context: ./AntiHub
      dockerfile: Dockerfile
    image: ghcr.io/zhongruan0522/antihub-web:latest
```

**Docker Compose 行为**：
- 如果本地已有 `ghcr.io/zhongruan0522/antihub-web:latest` 镜像
- 会优先使用已有镜像，**不会重新构建**

## 解决方案

### 方案 1: 强制重新构建（推荐）

```bash
# 删除旧镜像
docker compose down
docker rmi ghcr.io/zhongruan0522/antihub-web:latest
docker rmi ghcr.io/zhongruan0522/antihub-backend:latest
docker rmi ghcr.io/zhongruan0522/antihub-plugin:latest

# 强制重新构建
docker compose build --no-cache

# 启动服务
docker compose up -d
```

### 方案 2: 使用不同的镜像标签

修改 `.env` 文件：

```bash
# 使用本地构建标签
IMAGE_TAG=local-build

# 或使用版本号
IMAGE_TAG=v1.0.0
```

然后构建：

```bash
docker compose build
docker compose up -d
```

### 方案 3: 一键清理并重新构建

```bash
# 完整清理并重新构建
docker compose down -v --rmi all
docker compose up -d --build
```

## 验证是否使用了新镜像

### 1. 检查镜像创建时间

```bash
docker images | grep antihub
```

应该看到最新的创建时间。

### 2. 检查镜像大小

```bash
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
```

新构建的镜像大小应该更小：
- 前端: ~200MB (多阶段构建)
- 后端: ~350MB (单阶段构建)
- 插件: ~200MB (单阶段构建)

### 3. 检查基础镜像

```bash
# 检查前端镜像
docker inspect ghcr.io/zhongruan0522/antihub-web:latest | grep -A 5 "FROM"

# 应该看到 node:20-alpine
```

### 4. 进入容器检查

```bash
# 检查前端容器
docker compose exec web cat /etc/os-release
# 应该看到 Alpine Linux

# 检查后端容器
docker compose exec backend cat /etc/os-release
# 应该看到 Debian (slim)
```

## 部署脚本

创建一个部署脚本 `deploy.sh`：

```bash
#!/bin/bash
set -e

echo "🚀 开始部署 AntiHub..."

# 1. 停止并删除旧容器
echo "📦 停止旧容器..."
docker compose down

# 2. 删除旧镜像（可选）
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
sleep 10

# 6. 检查服务状态
echo "✅ 检查服务状态..."
docker compose ps

# 7. 显示镜像信息
echo "📊 镜像信息:"
docker images | grep antihub

echo "🎉 部署完成！"
```

使用方法：

```bash
chmod +x deploy.sh
./deploy.sh
```

## 为什么会使用旧镜像？

### 场景 1: 从镜像仓库拉取过
```bash
# 如果之前执行过
docker pull ghcr.io/zhongruan0522/antihub-web:latest

# Docker Compose 会优先使用这个镜像
```

### 场景 2: 之前构建过
```bash
# 如果之前执行过
docker compose build

# 再次执行时会使用缓存
```

### 场景 3: 镜像标签相同
```bash
# 如果镜像标签都是 latest
# Docker 无法区分是新构建还是旧镜像
```

## 最佳实践

### 1. 开发环境：使用本地构建

```yaml
# docker-compose.dev.yml
services:
  web:
    build:
      context: ./AntiHub
      dockerfile: Dockerfile
    image: antihub-web:dev  # 使用本地标签
```

### 2. 生产环境：使用镜像仓库

```yaml
# docker-compose.prod.yml
services:
  web:
    image: ghcr.io/zhongruan0522/antihub-web:v1.0.0  # 使用版本号
```

### 3. 使用版本号而不是 latest

```bash
# .env
IMAGE_TAG=v1.0.0  # 而不是 latest
```

### 4. 构建时使用 --no-cache

```bash
docker compose build --no-cache
```

## 快速命令参考

```bash
# 查看当前使用的镜像
docker compose images

# 查看镜像详细信息
docker compose config | grep image

# 强制重新构建
docker compose build --no-cache --pull

# 删除所有相关镜像
docker compose down --rmi all

# 完整清理并重新构建
docker compose down -v --rmi all && docker compose up -d --build
```

## 总结

**问题**: 服务器使用了旧镜像而不是重新构建

**原因**: Docker Compose 优先使用已存在的镜像

**解决**:
1. 删除旧镜像: `docker rmi <image>`
2. 强制重新构建: `docker compose build --no-cache`
3. 使用不同的标签: `IMAGE_TAG=local-build`

**验证**: 检查镜像创建时间和大小
