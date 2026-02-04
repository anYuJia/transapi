# AntiHub Docker 构建和部署指南

本文档说明如何构建 Docker 镜像并部署 AntiHub 全栈应用。

## 目录结构

```
AntiHub-ALL/
├── AntiHub/              # Next.js 前端
├── AntiHub-Backend/      # FastAPI 后端
├── AntiHub-plugin/       # Node.js 插件服务
├── AntiHook/             # Go 工具
├── docker/               # Docker 相关脚本
├── docker-compose.yml    # 生产环境配置
└── .env                  # 环境变量配置
```

## 前置准备

### 1. 安装 Docker 和 Docker Compose

```bash
# 检查 Docker 版本
docker --version
docker compose version
```

### 2. 配置环境变量

复制示例配置文件并修改：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置以下必需的环境变量：

```bash
# 必需配置
JWT_SECRET_KEY=your-jwt-secret-key-here
PLUGIN_ADMIN_API_KEY=your-plugin-admin-api-key-here
PLUGIN_API_ENCRYPTION_KEY=your-32-byte-base64-encryption-key-here

# 数据库配置
POSTGRES_USER=antihub
POSTGRES_PASSWORD=your-secure-password
POSTGRES_DB=antihub

# 插件数据库配置
PLUGIN_DB_NAME=antigravity
PLUGIN_DB_USER=antigravity
PLUGIN_DB_PASSWORD=your-secure-password

# 管理员账号（首次启动自动创建）
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-admin-password

# 镜像配置（用于构建和推送）
IMAGE_OWNER=your-github-username
IMAGE_TAG=latest
```

### 3. 生成加密密钥

```bash
# 生成 Fernet 加密密钥（32字节 base64）
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

## 构建 Docker 镜像

### 方法一：使用 Docker Compose 构建（推荐）

在项目根目录创建 `docker-compose.build.yml`：

```yaml
services:
  web:
    build:
      context: ./AntiHub
      dockerfile: Dockerfile
    image: ghcr.io/${IMAGE_OWNER}/antihub-web:${IMAGE_TAG:-latest}

  backend:
    build:
      context: ./AntiHub-Backend
      dockerfile: Dockerfile
    image: ghcr.io/${IMAGE_OWNER}/antihub-backend:${IMAGE_TAG:-latest}

  plugin:
    build:
      context: ./AntiHub-plugin
      dockerfile: Dockerfile
    image: ghcr.io/${IMAGE_OWNER}/antihub-plugin:${IMAGE_TAG:-latest}
```

然后执行构建：

```bash
# 构建所有镜像
docker compose -f docker-compose.build.yml build

# 或者单独构建某个服务
docker compose -f docker-compose.build.yml build web
docker compose -f docker-compose.build.yml build backend
docker compose -f docker-compose.build.yml build plugin
```

### 方法二：使用 Docker 命令单独构建

```bash
# 构建前端镜像
cd AntiHub
docker build -t ghcr.io/${IMAGE_OWNER}/antihub-web:latest .

# 构建后端镜像
cd ../AntiHub-Backend
docker build -t ghcr.io/${IMAGE_OWNER}/antihub-backend:latest .

# 构建插件服务镜像
cd ../AntiHub-plugin
docker build -t ghcr.io/${IMAGE_OWNER}/antihub-plugin:latest .
```

## 推送镜像到 GitHub Container Registry

### 1. 登录 GitHub Container Registry

```bash
# 使用 GitHub Personal Access Token 登录
echo $GITHUB_TOKEN | docker login ghcr.io -u $GITHUB_USERNAME --password-stdin
```

### 2. 推送镜像

```bash
# 推送所有镜像
docker push ghcr.io/${IMAGE_OWNER}/antihub-web:latest
docker push ghcr.io/${IMAGE_OWNER}/antihub-backend:latest
docker push ghcr.io/${IMAGE_OWNER}/antihub-plugin:latest

# 或者使用标签版本
docker tag ghcr.io/${IMAGE_OWNER}/antihub-web:latest ghcr.io/${IMAGE_OWNER}/antihub-web:v1.0.0
docker push ghcr.io/${IMAGE_OWNER}/antihub-web:v1.0.0
```

## 部署应用

### 1. 使用 Docker Compose 部署

```bash
# 启动所有服务
docker compose up -d

# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f

# 查看特定服务的日志
docker compose logs -f web
docker compose logs -f backend
docker compose logs -f plugin
```

### 2. 访问应用

- **前端**: http://localhost:3000
- **后端 API**: http://localhost:8000
- **API 文档**: http://localhost:8000/api/docs

### 3. 数据库初始化

首次启动时，后端会自动运行数据库迁移：

```bash
# 查看后端日志确认迁移成功
docker compose logs backend | grep "alembic"
```

如果需要手动运行迁移：

```bash
docker compose exec backend alembic upgrade head
```

## 更新部署

### 1. 拉取最新镜像

```bash
docker compose pull
```

### 2. 重启服务

```bash
docker compose down
docker compose up -d
```

### 3. 仅重启特定服务

```bash
docker compose restart web
docker compose restart backend
docker compose restart plugin
```

## 备份和恢复

### 备份数据库

```bash
# 备份 PostgreSQL 数据
docker compose exec postgres pg_dump -U antihub antihub > backup_$(date +%Y%m%d).sql
docker compose exec postgres pg_dump -U antigravity antigravity > backup_plugin_$(date +%Y%m%d).sql

# 备份 Redis 数据
docker compose exec redis redis-cli SAVE
docker cp antihub-redis:/data/dump.rdb ./backup_redis_$(date +%Y%m%d).rdb
```

### 恢复数据库

```bash
# 恢复 PostgreSQL 数据
cat backup_20260204.sql | docker compose exec -T postgres psql -U antihub antihub

# 恢复 Redis 数据
docker cp backup_redis_20260204.rdb antihub-redis:/data/dump.rdb
docker compose restart redis
```

## 故障排查

### 查看服务状态

```bash
docker compose ps
docker compose logs --tail=100 -f
```

### 重启服务

```bash
# 重启所有服务
docker compose restart

# 重启特定服务
docker compose restart backend
```

### 清理并重新部署

```bash
# 停止并删除所有容器
docker compose down

# 删除数据卷（警告：会删除所有数据）
docker compose down -v

# 重新启动
docker compose up -d
```

### 进入容器调试

```bash
# 进入后端容器
docker compose exec backend sh

# 进入前端容器
docker compose exec web sh

# 进入插件容器
docker compose exec plugin sh

# 进入数据库容器
docker compose exec postgres psql -U antihub
```

## 生产环境建议

### 1. 使用外部数据库和 Redis

编辑 `.env` 文件：

```bash
# 使用外部 PostgreSQL
DATABASE_URL=postgresql+asyncpg://user:password@your-db-host:5432/antihub

# 使用外部 Redis
REDIS_URL=redis://your-redis-host:6379/0
```

然后使用 `docker-compose.core.yml` 部署（不包含 PostgreSQL 和 Redis）：

```bash
docker compose -f docker-compose.core.yml up -d
```

### 2. 配置反向代理

使用 Nginx 或 Caddy 作为反向代理：

```nginx
# Nginx 配置示例
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/ {
        proxy_pass http://localhost:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 3. 配置 HTTPS

```bash
# 使用 Certbot 获取 SSL 证书
certbot --nginx -d your-domain.com
```

### 4. 监控和日志

```bash
# 配置日志轮转
docker compose logs --tail=1000 > logs/app_$(date +%Y%m%d).log

# 使用 Docker stats 监控资源使用
docker stats
```

## 快速命令参考

```bash
# 构建镜像
docker compose -f docker-compose.build.yml build

# 启动服务
docker compose up -d

# 停止服务
docker compose down

# 查看日志
docker compose logs -f

# 重启服务
docker compose restart

# 更新镜像
docker compose pull && docker compose up -d

# 备份数据
docker compose exec postgres pg_dump -U antihub antihub > backup.sql

# 清理未使用的镜像
docker image prune -a
```

## 常见问题

### Q: 端口被占用怎么办？

修改 `.env` 文件中的端口配置：

```bash
WEB_PORT=3001
BACKEND_PORT=8001
POSTGRES_PORT=5433
```

### Q: 如何查看数据库连接？

```bash
docker compose exec postgres psql -U antihub -c "SELECT * FROM pg_stat_activity;"
```

### Q: 如何重置管理员密码？

```bash
docker compose exec backend python -c "from app.utils.admin_init import reset_admin_password; reset_admin_password('new_password')"
```

### Q: 镜像构建失败怎么办？

检查 Docker 日志并确保：
1. 网络连接正常
2. 有足够的磁盘空间
3. Docker 版本符合要求

```bash
docker system df  # 查看磁盘使用
docker system prune  # 清理未使用的资源
```

## 相关文档

- [CLAUDE.md](./CLAUDE.md) - 项目开发指南
- [README.md](./README.md) - 项目介绍
- [4-docs/](./4-docs/) - 详细文档
