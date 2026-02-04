# ============================================
# AntiHub Plugin - 简化版 Dockerfile
# ============================================
FROM node:20-alpine

WORKDIR /app

# 安装 PostgreSQL 客户端（用于数据库初始化）
RUN apk add --no-cache postgresql-client

# 复制文件并安装依赖
COPY package*.json ./
RUN npm ci --only=production

COPY . .

# 复制并设置 entrypoint 脚本权限
RUN chmod +x entrypoint.sh

# 设置环境变量
ENV NODE_ENV=production \
    PORT=8045

EXPOSE 8045

# 使用 entrypoint 脚本启动
ENTRYPOINT ["/app/entrypoint.sh"]
