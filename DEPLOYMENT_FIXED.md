# ✅ AntiHub Docker 部署问题已修复

## 修复时间
2026-02-04

## 问题描述

前端服务启动后，浏览器访问时出现大量 404 错误：
```
GET /_next/static/chunks/f07ec67799225986.js 404 Not Found
```

## 根本原因

Next.js 使用 `standalone` 输出模式时，需要正确的目录结构：
- `.next/standalone/` - 包含服务器代码
- `.next/static/` - 包含静态资源（JS/CSS）
- `public/` - 包含公共文件

原来的单阶段 Dockerfile 没有正确复制这些文件到运行时容器。

## 解决方案

修改前端 Dockerfile，使用多阶段构建：

### 修改前（❌ 错误）
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
CMD ["node", ".next/standalone/server.js"]
```

### 修改后（✅ 正确）
```dockerfile
# 构建阶段
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# 运行阶段
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# 复制 standalone 输出
COPY --from=builder /app/.next/standalone ./
# 复制静态文件（关键！）
COPY --from=builder /app/.next/static ./.next/static
# 复制 public 文件
COPY --from=builder /app/public ./public

CMD ["node", "server.js"]
```

## 关键改动

1. **使用多阶段构建**：分离构建和运行环境
2. **正确复制静态文件**：`COPY --from=builder /app/.next/static ./.next/static`
3. **复制 public 目录**：`COPY --from=builder /app/public ./public`
4. **正确的启动命令**：`node server.js`（不是 `.next/standalone/server.js`）

## 验证结果

### 服务状态
```bash
$ docker compose ps
NAME               STATUS                  PORTS
antihub-web        Up                      0.0.0.0:3000->3000/tcp
antihub-backend    Up                      127.0.0.1:8000->8000/tcp
antihub-plugin     Up                      8045/tcp
antihub-postgres   Up (healthy)            127.0.0.1:5432->5432/tcp
antihub-redis      Up                      6379/tcp
```

### 静态文件测试
```bash
$ curl -s http://localhost:3000/_next/static/chunks/f07ec67799225986.js | head -5
(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document...
✅ 静态文件正常
```

### 前端页面测试
```bash
$ curl -s http://localhost:3000 | grep title
<title>AntiHub</title>
✅ 前端页面正常加载
```

## 最终架构

所有服务都已成功运行：

```
┌─────────────────────────────────────────┐
│  前端 (web) - 多阶段构建                 │
│  node:20-alpine                         │
│  端口: 3000 ✅                           │
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│  后端 (backend) - 单阶段构建             │
│  python:3.10-slim                       │
│  端口: 8000 ✅                           │
└─────────────────────────────────────────┘
         ↓               ↓
┌──────────────┐  ┌──────────────┐
│  PostgreSQL  │  │    Redis     │
│  18.1-alpine │  │  7-alpine    │
│  ✅ 健康      │  │  ✅ 运行中   │
└──────────────┘  └──────────────┘
         ↓
┌─────────────────────────────────────────┐
│  插件 (plugin) - 单阶段构建              │
│  node:20-alpine                         │
│  端口: 8045 ✅                           │
└─────────────────────────────────────────┘
```

## 镜像大小对比

虽然前端使用了多阶段构建，但最终镜像大小仍然很小：

| 服务 | 构建方式 | 镜像大小 |
|------|---------|---------|
| 前端 | 多阶段 | ~200MB |
| 后端 | 单阶段 | ~350MB |
| 插件 | 单阶段 | ~200MB |

## 经验教训

1. **Next.js standalone 模式需要特殊处理**
   - 必须复制 `.next/static` 到运行时容器
   - 必须复制 `public` 目录
   - 启动命令是 `node server.js`

2. **多阶段构建的优势**
   - 分离构建依赖和运行依赖
   - 减小最终镜像大小
   - 更清晰的构建流程

3. **验证很重要**
   - 不仅要检查服务是否启动
   - 还要测试实际功能（如静态文件加载）

## 相关文件

- `AntiHub/Dockerfile` - 前端 Dockerfile（已修复）
- `AntiHub/next.config.ts` - Next.js 配置（output: 'standalone'）
- `docker-compose.yml` - Docker Compose 配置

## 快速命令

```bash
# 重新构建前端
docker compose up -d --build web

# 测试静态文件
curl http://localhost:3000/_next/static/chunks/[chunk-id].js

# 查看前端日志
docker compose logs -f web
```

---

**状态**: ✅ 已修复并验证
**影响**: 前端现在可以正常加载所有静态资源
**下一步**: 可以推送镜像到仓库
