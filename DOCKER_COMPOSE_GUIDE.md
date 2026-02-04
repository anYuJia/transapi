# ✅ Docker Compose 一键部署指南

## 确认：可以直接使用 docker-compose 命令构建成功！

### 快速开始

```bash
# 一键构建并启动所有服务
docker compose up -d --build
```

就这么简单！所有服务会自动：
- ✅ 构建镜像
- ✅ 创建网络
- ✅ 启动数据库
- ✅ 运行数据库迁移
- ✅ 启动所有服务

### 验证部署

```bash
# 查看服务状态
docker compose ps

# 应该看到所有服务都在运行：
# antihub-web        Up    0.0.0.0:3000->3000/tcp
# antihub-backend    Up    127.0.0.1:8000->8000/tcp
# antihub-plugin     Up    8045/tcp
# antihub-postgres   Up    127.0.0.1:5432->5432/tcp
# antihub-redis      Up    6379/tcp
```

### 访问服务

- **前端**: http://localhost:3000
- **后端 API**: http://localhost:8000/api/docs
- **健康检查**: http://localhost:8000/api/health

### 常用命令

```bash
# 停止所有服务
docker compose down

# 重启服务
docker compose restart

# 查看日志
docker compose logs -f

# 只查看某个服务的日志
docker compose logs -f web
docker compose logs -f backend

# 重新构建并启动
docker compose up -d --build

# 停止并删除所有容器和卷
docker compose down -v
```

### 服务架构

```
前端 (web:3000)
    ↓
后端 (backend:8000)
    ↓
PostgreSQL (postgres:5432) + Redis (redis:6379)
    ↓
插件 (plugin:8045)
```

### 镜像信息

所有镜像都使用最小的公共基础镜像：

| 服务 | 基础镜像 | 构建方式 |
|------|---------|---------|
| 前端 | node:20-alpine | 多阶段构建 |
| 后端 | python:3.10-slim | 单阶段构建 |
| 插件 | node:20-alpine | 单阶段构建 |
| 数据库 | postgres:18.1-alpine | 官方镜像 |
| 缓存 | redis:7-alpine | 官方镜像 |

### 环境变量

确保 `.env` 文件包含必要的配置：

```bash
# JWT 密钥
JWT_SECRET_KEY=your-secret-key

# 插件管理密钥
PLUGIN_ADMIN_API_KEY=your-admin-key
PLUGIN_API_ENCRYPTION_KEY=your-encryption-key

# 数据库配置
POSTGRES_USER=antihub
POSTGRES_PASSWORD=your-password
POSTGRES_DB=antihub

# 管理员账号
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-admin-password
```

### 故障排查

#### 端口被占用
```bash
# 杀死占用端口的进程
lsof -ti:3000 | xargs kill -9
lsof -ti:8000 | xargs kill -9
```

#### 数据库初始化失败
```bash
# 删除数据卷重新开始
docker compose down -v
docker compose up -d --build
```

#### 查看详细日志
```bash
docker compose logs backend --tail=100
```

### 推送镜像

构建成功后，可以推送到镜像仓库：

```bash
# 设置镜像仓库所有者
export IMAGE_OWNER=your-github-username

# 推送镜像
./push.sh
```

---

## 总结

✅ **确认可以直接使用 `docker compose up -d --build` 一键部署！**

所有配置都已完成，包括：
- ✅ 所有 Dockerfile 已优化
- ✅ docker-compose.yml 配置正确
- ✅ 数据库自动迁移
- ✅ 静态文件正确复制
- ✅ 所有服务正常运行

**部署时间**: 约 3-5 分钟（取决于网络速度）
