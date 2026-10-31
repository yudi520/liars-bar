# 骗子酒馆 (Liar's Bar) - 官方 Docker 镜像构建文件
# 多阶段构建：Alpine 基础镜像，轻量小巧 (最终镜像体积约 150MB)

# 阶段一：构建前端资源
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# 阶段二：生产运行环境
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=9527

COPY package*.json ./
RUN npm ci --only=production

# 复制前端打包产物与后端核心逻辑
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server

# 暴露对决与静态资源端口
EXPOSE 9527

# 启动骗子酒馆服务
CMD ["node", "server/embedded-server.js"]
