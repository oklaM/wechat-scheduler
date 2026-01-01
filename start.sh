#!/bin/bash

set -e

echo "🚀 微信公众号定时服务启动脚本"
echo "================================"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查环境变量
check_env() {
    print_info "检查环境变量配置..."
    
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            print_warning ".env 文件不存在，正在从 .env.example 复制..."
            cp .env.example .env
            print_warning "请编辑 .env 文件并配置正确的环境变量"
            print_warning "配置完成后重新运行此脚本"
            exit 1
        else
            print_error ".env 文件和 .env.example 文件都不存在"
            exit 1
        fi
    fi
    
    # 检查必要的环境变量
    source .env
    
    if [ -z "$WECHAT_APPID" ] || [ "$WECHAT_APPID" = "your_wechat_appid_here" ]; then
        print_error "WECHAT_APPID 未配置或使用默认值"
        exit 1
    fi
    
    if [ -z "$WECHAT_SECRET" ] || [ "$WECHAT_SECRET" = "your_wechat_secret_here" ]; then
        print_error "WECHAT_SECRET 未配置或使用默认值"
        exit 1
    fi
    
    if [ -z "$COZE_AUTH_TOKEN" ] || [ "$COZE_AUTH_TOKEN" = "your_coze_auth_token_here" ]; then
        print_error "COZE_AUTH_TOKEN 未配置或使用默认值"
        exit 1
    fi
    
    print_success "环境变量检查通过"
}

# 检查依赖
check_dependencies() {
    print_info "检查系统依赖..."
    
    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js 未安装，请先安装 Node.js (>=16.0.0)"
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 16 ]; then
        print_error "Node.js 版本过低，需要 >=16.0.0，当前版本: $(node -v)"
        exit 1
    fi
    
    print_success "Node.js 版本: $(node -v)"
    
    # 检查 npm
    if ! command -v npm &> /dev/null; then
        print_error "npm 未安装"
        exit 1
    fi
    
    print_success "npm 版本: $(npm -v)"
    
    # 检查 Docker
    if command -v docker &> /dev/null; then
        print_success "Docker 版本: $(docker -v | cut -d' ' -f3 | cut -d',' -f1)"
    else
        print_warning "Docker 未安装，将使用 Node.js 直接运行"
    fi
    
    # 检查 PM2
    if command -v pm2 &> /dev/null; then
        print_success "PM2 版本: $(pm2 -v)"
    else
        print_warning "PM2 未安装，将使用 Node.js 直接运行"
    fi
}

# 安装依赖
install_dependencies() {
    print_info "安装项目依赖..."
    
    if [ ! -d "node_modules" ]; then
        npm install
        print_success "依赖安装完成"
    else
        print_info "依赖已存在，跳过安装"
    fi
}

# 创建日志目录
create_log_dir() {
    if [ ! -d "logs" ]; then
        mkdir -p logs
        print_success "创建日志目录"
    fi
}

# 启动方式选择
select_startup_mode() {
    echo ""
    echo "请选择启动方式:"
    echo "1) 直接运行 (Node.js)"
    echo "2) PM2 进程管理"
    echo "3) Docker 容器运行"
    echo "4) Docker Compose 完整服务"
    echo "5) 退出"
    echo ""
    read -p "请输入选择 (1-5): " choice
    
    case $choice in
        1)
            start_direct
            ;;
        2)
            start_pm2
            ;;
        3)
            start_docker
            ;;
        4)
            start_docker_compose
            ;;
        5)
            print_info "退出启动脚本"
            exit 0
            ;;
        *)
            print_error "无效选择"
            select_startup_mode
            ;;
    esac
}

# 直接运行
start_direct() {
    print_info "使用 Node.js 直接启动..."
    
    if [ "$NODE_ENV" = "development" ]; then
        if command -v nodemon &> /dev/null; then
            print_info "使用 nodemon 启动开发模式..."
            nodemon wechat-scheduler.js
        else
            print_warning "nodemon 未安装，使用普通模式启动..."
            node wechat-scheduler.js
        fi
    else
        node wechat-scheduler.js
    fi
}

# PM2 启动
start_pm2() {
    print_info "使用 PM2 启动..."
    
    if ! command -v pm2 &> /dev/null; then
        print_error "PM2 未安装，请先运行: npm install -g pm2"
        exit 1
    fi
    
    # 选择环境
    echo ""
    echo "请选择运行环境:"
    echo "1) 开发环境"
    echo "2) 生产环境"
    read -p "请输入选择 (1-2): " env_choice
    
    case $env_choice in
        1)
            pm2 start ecosystem.config.js --env development
            ;;
        2)
            pm2 start ecosystem.config.js --env production
            ;;
        *)
            print_error "无效选择，使用默认生产环境"
            pm2 start ecosystem.config.js --env production
            ;;
    esac
    
    print_success "PM2 启动完成"
    echo ""
    echo "常用 PM2 命令:"
    echo "  pm2 status          - 查看进程状态"
    echo "  pm2 logs           - 查看日志"
    echo "  pm2 restart        - 重启服务"
    echo "  pm2 stop           - 停止服务"
    echo "  pm2 delete         - 删除服务"
    echo ""
}

# Docker 启动
start_docker() {
    print_info "使用 Docker 启动..."
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker 未安装"
        exit 1
    fi
    
    # 构建镜像
    print_info "构建 Docker 镜像..."
    docker build -t wechat-scheduler .
    
    # 运行容器
    print_info "启动 Docker 容器..."
    docker run -d \
        --name wechat-scheduler \
        --env-file .env \
        -p 3000:3000 \
        -v $(pwd)/logs:/app/logs \
        --restart unless-stopped \
        wechat-scheduler
    
    print_success "Docker 容器启动完成"
    echo ""
    echo "常用 Docker 命令:"
    echo "  docker logs -f wechat-scheduler           - 查看日志"
    echo "  docker restart wechat-scheduler          - 重启容器"
    echo "  docker stop wechat-scheduler             - 停止容器"
    echo "  docker rm -f wechat-scheduler            - 删除容器"
    echo ""
}

# Docker Compose 启动
start_docker_compose() {
    print_info "使用 Docker Compose 启动完整服务..."
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose 未安装"
        exit 1
    fi
    
    # 启动服务
    if command -v docker-compose &> /dev/null; then
        docker-compose up -d
    else
        docker compose up -d
    fi
    
    print_success "Docker Compose 服务启动完成"
    echo ""
    echo "服务地址:"
    echo "  应用: http://localhost:3000"
    echo "  健康检查: http://localhost:3000/health"
    echo "  Prometheus: http://localhost:9090"
    echo "  Grafana: http://localhost:3001 (admin/admin123)"
    echo ""
    echo "常用 Docker Compose 命令:"
    if command -v docker-compose &> /dev/null; then
        echo "  docker-compose logs -f           - 查看日志"
        echo "  docker-compose restart           - 重启服务"
        echo "  docker-compose down              - 停止服务"
        echo "  docker-compose down -v           - 停止并删除数据"
    else
        echo "  docker compose logs -f           - 查看日志"
        echo "  docker compose restart           - 重启服务"
        echo "  docker compose down              - 停止服务"
        echo "  docker compose down -v           - 停止并删除数据"
    fi
    echo ""
}

# 主函数
main() {
    echo "开始初始化..."
    
    check_env
    check_dependencies
    install_dependencies
    create_log_dir
    
    print_success "初始化完成！"
    echo ""
    
    select_startup_mode
}

# 脚本入口
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi