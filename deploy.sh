#!/bin/bash

set -e

echo "🚀 生产环境部署脚本"
echo "=================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 默认配置
DEPLOY_ENV="production"
BUILD_NUMBER=""
BACKUP_DIR="/opt/backups/wechat-scheduler"
APP_DIR="/opt/wechat-scheduler"
SERVICE_NAME="wechat-scheduler"

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--env)
            DEPLOY_ENV="$2"
            shift 2
            ;;
        -b|--build)
            BUILD_NUMBER="$2"
            shift 2
            ;;
        --backup-dir)
            BACKUP_DIR="$2"
            shift 2
            ;;
        --app-dir)
            APP_DIR="$2"
            shift 2
            ;;
        -h|--help)
            echo "使用方法: $0 [选项]"
            echo "选项:"
            echo "  -e, --env ENV           部署环境 (default: production)"
            echo "  -b, --build BUILD       构建版本号"
            echo "  --backup-dir DIR        备份目录 (default: /opt/backups/wechat-scheduler)"
            echo "  --app-dir DIR           应用目录 (default: /opt/wechat-scheduler)"
            echo "  -h, --help              显示帮助信息"
            exit 0
            ;;
        *)
            print_error "未知参数: $1"
            exit 1
            ;;
    esac
done

# 检查是否为 root 用户
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "此脚本需要 root 权限运行"
        exit 1
    fi
}

# 检查系统依赖
check_dependencies() {
    print_info "检查系统依赖..."
    
    # 检查必要的命令
    local deps=("docker" "docker-compose" "curl")
    for dep in "${deps[@]}"; do
        if ! command -v $dep &> /dev/null; then
            print_error "$dep 未安装"
            exit 1
        fi
    done
    
    print_success "系统依赖检查通过"
}

# 备份当前版本
backup_current() {
    print_info "备份当前版本..."
    
    if [ -d "$APP_DIR" ]; then
        local backup_name="backup-$(date +%Y%m%d-%H%M%S)"
        local backup_path="$BACKUP_DIR/$backup_name"
        
        mkdir -p "$BACKUP_DIR"
        
        # 备份应用目录
        cp -r "$APP_DIR" "$backup_path"
        
        # 备份 Docker 相关文件
        if [ -f "/etc/systemd/system/$SERVICE_NAME.service" ]; then
            cp "/etc/systemd/system/$SERVICE_NAME.service" "$backup_path/"
        fi
        
        # 备份 Docker Compose 文件
        if [ -f "/etc/$SERVICE_NAME/docker-compose.yml" ]; then
            cp "/etc/$SERVICE_NAME/docker-compose.yml" "$backup_path/"
        fi
        
        print_success "备份完成: $backup_path"
    else
        print_info "当前应用目录不存在，跳过备份"
    fi
}

# 停止当前服务
stop_services() {
    print_info "停止当前服务..."
    
    # 停止 Docker Compose 服务
    if [ -f "$APP_DIR/docker-compose.yml" ]; then
        cd "$APP_DIR"
        docker-compose down || true
    fi
    
    # 停止 systemd 服务
    if systemctl is-active --quiet $SERVICE_NAME; then
        systemctl stop $SERVICE_NAME
        systemctl disable $SERVICE_NAME
    fi
    
    # 清理旧的 Docker 容器和镜像
    docker system prune -f || true
    
    print_success "服务已停止"
}

# 部署新版本
deploy_new_version() {
    print_info "部署新版本..."
    
    # 创建应用目录
    mkdir -p "$APP_DIR"
    cd "$APP_DIR"
    
    # 从 Git 拉取最新代码（如果适用）
    if [ -d ".git" ]; then
        git pull origin main
    fi
    
    # 创建 .env 文件
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example .env
            print_warning "请编辑 $APP_DIR/.env 文件并配置正确的环境变量"
            exit 1
        else
            print_error ".env.example 文件不存在"
            exit 1
        fi
    fi
    
    # 构建 Docker 镜像
    print_info "构建 Docker 镜像..."
    docker build -t $SERVICE_NAME:latest .
    
    # 启动服务
    print_info "启动服务..."
    docker-compose up -d
    
    # 等待服务启动
    print_info "等待服务启动..."
    sleep 10
    
    # 健康检查
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        print_success "健康检查通过"
    else
        print_error "健康检查失败"
        docker-compose logs
        exit 1
    fi
    
    print_success "新版本部署完成"
}

# 配置 systemd 服务
setup_systemd_service() {
    print_info "配置 systemd 服务..."
    
    cat > /etc/systemd/system/$SERVICE_NAME.service << EOF
[Unit]
Description=Wechat Scheduler Service
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$APP_DIR
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable $SERVICE_NAME
    
    print_success "systemd 服务配置完成"
}

# 清理旧版本
cleanup_old_versions() {
    print_info "清理旧版本..."
    
    # 清理 Docker 旧镜像
    docker image prune -f
    
    # 清理旧的备份（保留最近 5 个）
    if [ -d "$BACKUP_DIR" ]; then
        cd "$BACKUP_DIR"
        ls -t | tail -n +6 | xargs -r rm -rf
    fi
    
    print_success "清理完成"
}

# 验证部署
verify_deployment() {
    print_info "验证部署..."
    
    # 检查服务状态
    if docker-compose ps | grep -q "Up"; then
        print_success "容器运行正常"
    else
        print_error "容器未正常运行"
        return 1
    fi
    
    # 检查健康端点
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        print_success "健康检查通过"
    else
        print_error "健康检查失败"
        return 1
    fi
    
    # 检查日志
    if docker-compose logs --tail=50 | grep -q "WechatScheduler"; then
        print_success "应用日志正常"
    else
        print_warning "应用日志异常"
    fi
}

# 显示部署信息
show_deployment_info() {
    echo ""
    echo "🎉 部署完成！"
    echo "=============="
    echo "环境: $DEPLOY_ENV"
    echo "应用目录: $APP_DIR"
    echo "备份目录: $BACKUP_DIR"
    echo ""
    echo "服务状态:"
    docker-compose ps
    echo ""
    echo "常用命令:"
    echo "  docker-compose logs -f              # 查看日志"
    echo "  docker-compose restart              # 重启服务"
    echo "  docker-compose down                 # 停止服务"
    echo "  systemctl status $SERVICE_NAME      # 查看 systemd 状态"
    echo "  systemctl restart $SERVICE_NAME     # 重启 systemd 服务"
    echo ""
    echo "健康检查: http://localhost:3000/health"
    echo "应用状态: http://localhost:3000/"
}

# 主函数
main() {
    print_info "开始部署到 $DEPLOY_ENV 环境..."
    
    check_root
    check_dependencies
    backup_current
    stop_services
    deploy_new_version
    setup_systemd_service
    cleanup_old_versions
    
    if verify_deployment; then
        show_deployment_info
        print_success "部署成功完成！"
    else
        print_error "部署验证失败，请检查日志"
        exit 1
    fi
}

# 脚本入口
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi