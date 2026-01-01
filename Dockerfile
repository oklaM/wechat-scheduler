# 多阶段构建
FROM node:18-alpine AS builder

WORKDIR /app

# 复制package文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production && npm cache clean --force

# 生产环境镜像
FROM node:18-alpine AS production

# 创建非root用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S wechat-scheduler -u 1001

WORKDIR /app

# 复制构建的依赖
COPY --from=builder /app/node_modules ./node_modules

# 复制应用代码
COPY --chown=wechat-scheduler:nodejs . .

# 创建日志目录
RUN mkdir -p logs && \
    chown -R wechat-scheduler:nodejs logs

# 切换到非root用户
USER wechat-scheduler

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node healthcheck.js

# 启动应用
CMD ["node", "wechat-scheduler.js"]