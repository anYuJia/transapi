# ✅ 完成：现在每次都使用基础镜像构建

## 修改总结

### 问题
- 服务器部署时使用了私人镜像 `ghcr.io/zhongruan0522/antihub-*`
- 而不是从基础镜像（node:20-alpine, python:3.10-slim）重新构建

### 原因
docker-compose.yml 中的 `image` 字段指向了远程仓库：
```yaml
image: ghcr.io/zhongruan0522/antihub-web:latest
```

Docker Compose 会优先尝试从仓库拉取这个镜像。

### 解决方案
修改 `image` 字段为本地标签：
```yaml
image: antihub-web:latest  # 只使用本地构建
```

## 现在的配置

### docker-compose.yml（本地构建）
```yaml
services:
  web:
    build:
      context: ./AntiHub
      dockerfile: Dockerfile
    image: antihub-web:latest  # ✅ 本地标签

  backend:
    build:
      context: ./AntiHub-Backend
      dockerfile: Dockerfile
    image: antihub-backend:latest  # ✅ 本地标签

  plugin:
    build:
      context: ./AntiHub-plugin
      dockerfile: Dockerfile
    image: antihub-plugin:latest  # ✅ 本地标签
```

### docker-compose.push.yml（推送到仓库）
```yaml
services:
  web:
    build:
      context: ./AntiHub
      dockerfile: Dockerfile
    image: ghcr.io/zhongruan0522/antihub-web:latest  # 用于推送
```

## 验证结果

### 1. 镜像标签
```bash
$ docker images | grep antihub
antihub-web       latest    15d448ff49cf    197MB
antihub-backend   latest    2c1946a7f200    278MB
antihub-plugin    latest    dc53e503f502    185MB
```

✅ 使用本地标签，不是 `ghcr.io/*` 标签

### 2. 基础镜像
- 前端: node:20-alpine (~180MB)
- 后端: python:3.10-slim (~150MB)
- 插件: node:20-alpine (~180MB)

### 3. 服务状态
```bash
$ docker compose ps
NAME               STATUS
antihub-web        Up
antihub-backend    Up
antihub-plugin     Up
antihub-postgres   Up (healthy)
antihub-redis      Up
```

✅ 所有服务正常运行

## 部署流程

### 本地/服务器部署
```bash
# 1. 克隆代码
git clone <repo>
cd AntiHub-ALL

# 2. 配置环境变量
cp .env.example .env
vim .env

# 3. 构建并启动（会从基础镜像开始构建）
docker compose up -d --build

# 4. 验证
docker compose ps
docker images | grep antihub
```

### 推送到镜像仓库（可选）
```bash
# 1. 设置镜像仓库信息
export IMAGE_OWNER=your-username
export IMAGE_TAG=v1.0.0

# 2. 构建并推送
docker compose -f docker-compose.push.yml build
docker compose -f docker-compose.push.yml push

# 或使用脚本
./push-images.sh
```

## 关键命令

### 强制从基础镜像重新构建
```bash
# 删除旧镜像
docker rmi antihub-web:latest antihub-backend:latest antihub-plugin:latest

# 不使用缓存重新构建
docker compose build --no-cache

# 启动服务
docker compose up -d
```

### 检查使用的基础镜像
```bash
# 查看镜像历史
docker history antihub-web:latest | head -5

# 应该看到 node:20-alpine 作为基础层
```

### 清理旧的私人镜像
```bash
# 删除所有 ghcr.io 镜像
docker rmi $(docker images | grep ghcr.io/zhongruan0522 | awk '{print $3}')
```

## 文件说明

| 文件 | 用途 | 镜像标签格式 |
|------|------|-------------|
| `docker-compose.yml` | 本地构建和部署 | `antihub-*:latest` |
| `docker-compose.push.yml` | 推送到镜像仓库 | `ghcr.io/*/antihub-*:latest` |
| `deploy.sh` | 本地部署脚本 | 使用本地标签 |
| `push-images.sh` | 推送镜像脚本 | 使用远程标签 |

## 总结

✅ **已修复**：docker-compose.yml 现在只使用本地构建

✅ **验证**：
- 镜像标签为 `antihub-*:latest`（不是 `ghcr.io/*`）
- 从基础镜像（node:20-alpine, python:3.10-slim）构建
- 所有服务正常运行

✅ **部署命令**：
```bash
docker compose up -d --build
```

每次执行都会从基础镜像开始构建，不会使用私人镜像！
