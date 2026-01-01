# 部署配置指南

## 概述

本项目使用 GitHub Actions 进行自动化 CI/CD 部署。为了确保安全性和灵活性，部署过程使用 SSH 连接到远程服务器进行。

## 必需的 GitHub Secrets

在 GitHub 仓库设置中添加以下 Secrets：

### 基础配置 Secrets（所有环境）

| Secret 名称           | 描述         | 示例值                     |
| --------------------- | ------------ | -------------------------- |
| `WECHAT_APPID`        | 微信应用ID   | `wx1234567890abcdef`       |
| `WECHAT_SECRET`       | 微信应用密钥 | `your_wechat_secret_here`  |
| `WECHAT_ACCESS_TOKEN` | 微信访问令牌 | `your_wechat_access_token` |
| `COZE_AUTH_TOKEN`     | Coze API令牌 | `your_coze_auth_token`     |

### 服务器连接 Secrets

| Secret 名称           | 描述               | 示例值                               |
| --------------------- | ------------------ | ------------------------------------ |
| `STAGING_HOST`        | Staging 服务器地址 | `staging.example.com`                |
| `STAGING_USER`        | SSH 用户名         | `ubuntu`                             |
| `STAGING_SSH_KEY`     | SSH 私钥           | `-----BEGIN RSA PRIVATE KEY-----...` |
| `STAGING_SSH_PORT`    | SSH 端口（可选）   | `22`                                 |
| `PRODUCTION_HOST`     | 生产服务器地址     | `prod.example.com`                   |
| `PRODUCTION_USER`     | SSH 用户名         | `ubuntu`                             |
| `PRODUCTION_SSH_KEY`  | SSH 私钥           | `-----BEGIN RSA PRIVATE KEY-----`    |
| `PRODUCTION_SSH_PORT` | SSH 端口（可选）   | `22`                                 |

### 环境特定配置（可选）

| Secret 名称                | 描述                    | 默认值                             |
| -------------------------- | ----------------------- | ---------------------------------- |
| `STAGING_CZE_URL`          | Staging环境 Coze URL    | `https://2kkf772qbd.coze.site/run` |
| `STAGING_SCHEDULE_TIME`    | Staging环境 调度时间    | `0 0 8 * * *`                      |
| `STAGING_AUTO_PUBLISH`     | Staging环境 自动发布    | `false`                            |
| `PRODUCTION_CZE_URL`       | Production环境 Coze URL | `https://2kkf772qbd.coze.site/run` |
| `PRODUCTION_SCHEDULE_TIME` | Production环境 调度时间 | `0 0 8 * * *`                      |
| `PRODUCTION_AUTO_PUBLISH`  | Production环境 自动发布 | `false`                            |

## SSH 密钥生成

```bash
# 生成 SSH 密钥对
ssh-keygen -t rsa -b 4096 -C "your-email@example.com"

# 将公钥复制到服务器
ssh-copy-id username@server-address
```

## 服务器要求

确保目标服务器满足以下要求：

1. **Docker 已安装**
2. **Docker Compose 可用**
3. **网络连通性**：能够从服务器访问 GitHub Container Registry
4. **端口可用**：
    - Staging: 3001
    - Production: 3000

## 环境变量配置

所有敏感环境变量（如微信API密钥、Coze令牌等）都通过 GitHub Secrets 提供，无需在服务器上创建 .env 文件。

CI/CD 流水线会在部署时自动从 GitHub Secrets 读取并传递给 Docker 容器。

## 部署流程

### 自动触发条件

- **Staging 部署**：推送到 `develop` 分支时自动触发
- **Production 部署**：推送到 `main` 分支时自动触发

### 部署步骤

1. **CI 测试**：运行代码质量检查
2. **安全扫描**：CodeQL 静态分析
3. **Docker 构建**：构建并推送镜像到 GitHub Container Registry
4. **远程部署**：SSH 到目标服务器拉取并启动新容器
5. **健康检查**：验证部署成功
6. **通知**：发送部署状态通知

## 故障排除

### 常见问题

1. **SSH 连接失败**
    - 检查服务器地址和端口
    - 验证 SSH 密钥是否正确
    - 确认服务器防火墙设置

2. **Docker 镜像拉取失败**
    - 检查网络连通性
    - 验证 GitHub Container Registry 访问权限

3. **端口占用**
    - 确保端口 3000/3001 未被其他服务占用
    - 检查容器是否正确停止

### 手动部署

如果自动部署失败，可以手动执行：

```bash
# 拉取最新镜像
docker pull ghcr.io/username/wechat-scheduler:latest

# 停止旧容器
docker stop wechat-scheduler || true
docker rm wechat-scheduler || true

# 启动新容器
docker run -d \
  --name wechat-scheduler \
  --env-file .env.production \
  --restart always \
  -p 3000:3000 \
  ghcr.io/username/wechat-scheduler:latest
```

## 监控

- **健康检查端点**：`http://localhost:3000/health`
- **日志查看**：`docker logs -f wechat-scheduler`
- **状态监控**：使用部署通知功能

## 安全注意事项

1. **永远不要在代码中硬编码敏感信息**
2. **定期轮换 SSH 密钥**
3. **使用最小权限原则**
4. **启用服务器防火墙**
5. **定期更新系统和 Docker**
