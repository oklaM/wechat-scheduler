// 全局状态管理
class AppState {
    constructor() {
        this.serviceStatus = 'checking';
        this.lastExecution = null;
        this.nextExecution = null;
        this.executionLogs = [];
        this.isExecuting = false;
        this.startupTime = new Date();
    }

    updateStatus(status) {
        this.serviceStatus = status;
        this.renderStatus();
    }

    addLog(logEntry) {
        this.executionLogs.unshift(logEntry);
        if (this.executionLogs.length > 100) {
            this.executionLogs = this.executionLogs.slice(0, 100);
        }
        this.renderLogs();
    }

    clearLogs() {
        this.executionLogs = [];
        this.renderLogs();
    }

    renderStatus() {
        const statusElement = document.getElementById('serviceStatus');
        const indicatorElement = document.getElementById('statusIndicator');
        const lastExecutionElement = document.getElementById('lastExecution');
        const nextExecutionElement = document.getElementById('nextExecution');

        // 更新状态显示
        if (statusElement) {
            const statusMap = {
                checking: '检查中...',
                running: '运行中',
                stopped: '已停止',
                error: '错误'
            };
            statusElement.textContent = statusMap[this.serviceStatus] || '未知';
        }

        // 更新状态指示器
        if (indicatorElement) {
            indicatorElement.className = `status-indicator ${this.serviceStatus}`;
        }

        // 更新最后执行时间
        if (lastExecutionElement && this.lastExecution) {
            lastExecutionElement.textContent = new Date(this.lastExecution).toLocaleString('zh-CN');
        }

        // 计算下次执行时间
        if (nextExecutionElement) {
            nextExecutionElement.textContent = this.calculateNextExecution();
        }
    }

    renderLogs() {
        const logContainer = document.getElementById('logContainer');
        if (!logContainer) {
            return;
        }

        if (this.executionLogs.length === 0) {
            logContainer.innerHTML = `
                <div class="log-placeholder">
                    <p>等待任务执行或点击"立即执行任务"按钮...</p>
                </div>
            `;
            return;
        }

        const logHtml = this.executionLogs
            .map(
                log => `
            <div class="log-entry">
                <span class="log-timestamp">${new Date(log.timestamp).toLocaleString('zh-CN')}</span>
                <span class="log-level ${log.level}">${log.level.toUpperCase()}</span>
                <span class="log-message">${log.message}</span>
            </div>
        `
            )
            .join('');

        logContainer.innerHTML = logHtml;
        logContainer.scrollTop = 0;
    }

    calculateNextExecution() {
        // 简单的下次执行时间计算（基于 cron 表达式）
        // 这里可以解析 cron 表达式来准确计算下次执行时间
        const now = new Date();
        const next = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 临时：24小时后
        return next.toLocaleString('zh-CN');
    }
}

// 应用状态实例
const appState = new AppState();

// API 通信类
class ApiClient {
    constructor() {
        this.baseUrl = '';
    }

    async request(endpoint, options = {}) {
        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API 请求失败:', error);
            throw error;
        }
    }

    async getHealth() {
        return this.request('/health');
    }

    async executeTask() {
        return this.request('/execute', {
            method: 'POST'
        });
    }

    async getStatus() {
        return this.request('/status');
    }
}

// API 客户端实例
const apiClient = new ApiClient();

// UI 组件类
class UIManager {
    static showModal(title, message, showCancel = false) {
        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modalTitle');
        const modalMessage = document.getElementById('modalMessage');
        const modalCancel = document.getElementById('modalCancel');

        modalTitle.textContent = title;
        modalMessage.textContent = message;
        modalCancel.style.display = showCancel ? 'inline-flex' : 'none';

        modal.classList.add('show');

        return new Promise(resolve => {
            const confirmBtn = document.getElementById('modalConfirm');
            const cancelBtn = document.getElementById('modalCancel');
            const closeBtn = document.getElementById('closeModal');

            const cleanup = () => {
                modal.classList.remove('show');
                confirmBtn.removeEventListener('click', onConfirm);
                cancelBtn.removeEventListener('click', onCancel);
                closeBtn.removeEventListener('click', onCancel);
            };

            const onConfirm = () => {
                cleanup();
                resolve(true);
            };

            const onCancel = () => {
                cleanup();
                resolve(false);
            };

            confirmBtn.addEventListener('click', onConfirm);
            cancelBtn.addEventListener('click', onCancel);
            closeBtn.addEventListener('click', onCancel);
        });
    }

    static showLoading(show = true) {
        const loading = document.getElementById('loadingIndicator');
        if (loading) {
            if (show) {
                loading.classList.add('show');
            } else {
                loading.classList.remove('show');
            }
        }
    }

    static setButtonState(buttonId, disabled, text = null) {
        const button = document.getElementById(buttonId);
        if (button) {
            button.disabled = disabled;
            if (text) {
                button.innerHTML = text;
            }
        }
    }
}

// 事件处理类
class EventHandler {
    static async handleExecuteTask() {
        if (appState.isExecuting) {
            return;
        }

        const confirmed = await UIManager.showModal('确认执行', '确定要立即执行微信调度任务吗？', true);

        if (!confirmed) {
            return;
        }

        try {
            appState.isExecuting = true;
            UIManager.setButtonState('executeNowBtn', true, '<span class="btn-icon">⏳</span>执行中...');

            appState.addLog({
                timestamp: new Date().toISOString(),
                level: 'info',
                message: '开始执行任务...'
            });

            const result = await apiClient.executeTask();

            appState.addLog({
                timestamp: new Date().toISOString(),
                level: result.success ? 'success' : 'error',
                message: result.success ? `任务执行成功 (耗时: ${result.duration}ms)` : `任务执行失败: ${result.error}`
            });

            if (result.success) {
                appState.lastExecution = new Date().toISOString();
                appState.updateStatus('running');
            } else {
                appState.updateStatus('error');
            }

            await UIManager.showModal(
                result.success ? '执行成功' : '执行失败',
                result.success ? `任务已成功完成，耗时 ${result.duration}ms` : `任务执行失败: ${result.error}`,
                false
            );
        } catch (error) {
            appState.addLog({
                timestamp: new Date().toISOString(),
                level: 'error',
                message: `API 调用失败: ${error.message}`
            });

            appState.updateStatus('error');

            await UIManager.showModal('执行失败', `任务执行失败: ${error.message}`, false);
        } finally {
            appState.isExecuting = false;
            UIManager.setButtonState('executeNowBtn', false, '<span class="btn-icon">🚀</span>立即执行任务');
        }
    }

    static async handleRefreshStatus() {
        try {
            UIManager.setButtonState('refreshStatusBtn', true, '<span class="btn-icon">⏳</span>刷新中...');

            await apiClient.getHealth();
            const status = await apiClient.getStatus();

            appState.updateStatus('running');
            appState.lastExecution = status.lastExecution || null;

            appState.addLog({
                timestamp: new Date().toISOString(),
                level: 'info',
                message: '状态已刷新'
            });
        } catch (error) {
            appState.updateStatus('error');
            appState.addLog({
                timestamp: new Date().toISOString(),
                level: 'error',
                message: `状态刷新失败: ${error.message}`
            });
        } finally {
            UIManager.setButtonState('refreshStatusBtn', false, '<span class="btn-icon">🔄</span>刷新状态');
        }
    }

    static handleClearLogs() {
        appState.clearLogs();
        appState.addLog({
            timestamp: new Date().toISOString(),
            level: 'info',
            message: '日志已清空'
        });
    }

    static handleDownloadLogs() {
        const logs = appState.executionLogs
            .map(
                log => `[${new Date(log.timestamp).toLocaleString('zh-CN')}] ${log.level.toUpperCase()}: ${log.message}`
            )
            .join('\n');

        const blob = new Blob([logs], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wechat-scheduler-logs-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        appState.addLog({
            timestamp: new Date().toISOString(),
            level: 'info',
            message: '日志文件已下载'
        });
    }
}

// 系统信息管理
class SystemInfo {
    static updateSystemInfo() {
        const versionElement = document.getElementById('serviceVersion');
        const envElement = document.getElementById('environment');
        const startupElement = document.getElementById('startupTime');
        const scheduleElement = document.getElementById('scheduleExpression');

        if (versionElement) {
            versionElement.textContent = 'v1.0.0';
        }

        if (envElement) {
            const env = window.location.hostname === 'localhost' ? 'development' : 'production';
            envElement.textContent = env;
        }

        if (startupElement) {
            startupElement.textContent = appState.startupTime.toLocaleString('zh-CN');
        }

        if (scheduleElement) {
            scheduleElement.textContent = '0 0 8 * * *'; // 从后端获取实际值
        }
    }
}

// 初始化应用
class App {
    static async init() {
        // 绑定事件监听器
        this.bindEvents();

        // 初始化系统信息
        SystemInfo.updateSystemInfo();

        // 初始状态检查
        await this.checkInitialStatus();

        // 设置定时刷新
        this.setupPeriodicRefresh();

        console.log('微信调度器控制台已初始化');
    }

    static bindEvents() {
        // 执行任务按钮
        const executeBtn = document.getElementById('executeNowBtn');
        if (executeBtn) {
            executeBtn.addEventListener('click', EventHandler.handleExecuteTask);
        }

        // 刷新状态按钮
        const refreshBtn = document.getElementById('refreshStatusBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', EventHandler.handleRefreshStatus);
        }

        // 清空日志按钮
        const clearLogsBtn = document.getElementById('clearLogsBtn');
        if (clearLogsBtn) {
            clearLogsBtn.addEventListener('click', EventHandler.handleClearLogs);
        }

        // 下载日志按钮
        const downloadLogsBtn = document.getElementById('downloadLogsBtn');
        if (downloadLogsBtn) {
            downloadLogsBtn.addEventListener('click', EventHandler.handleDownloadLogs);
        }

        // 模态框关闭按钮
        const closeModal = document.getElementById('closeModal');
        if (closeModal) {
            closeModal.addEventListener('click', () => {
                document.getElementById('modal').classList.remove('show');
            });
        }
    }

    static async checkInitialStatus() {
        try {
            appState.updateStatus('checking');

            await apiClient.getHealth();
            const status = await apiClient.getStatus();

            appState.updateStatus('running');
            appState.lastExecution = status.lastExecution || null;

            appState.addLog({
                timestamp: new Date().toISOString(),
                level: 'success',
                message: '服务连接成功'
            });
        } catch (error) {
            appState.updateStatus('error');
            appState.addLog({
                timestamp: new Date().toISOString(),
                level: 'error',
                message: `服务连接失败: ${error.message}`
            });
        }
    }

    static setupPeriodicRefresh() {
        // 每30秒刷新一次状态
        setInterval(() => {
            EventHandler.handleRefreshStatus();
        }, 30000);
    }
}

// DOM 加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// 导出给全局使用
window.AppState = appState;
window.ApiClient = apiClient;
window.UIManager = UIManager;
window.EventHandler = EventHandler;
