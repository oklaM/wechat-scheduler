const cron = require('node-cron');
const axios = require('axios');
const Logger = require('./logger');
require('dotenv').config();

class WechatScheduler {
    constructor() {
        // 配置
        this.config = {
            appid: process.env.WECHAT_APPID,
            secret: process.env.WECHAT_SECRET,
            cozeToken: process.env.COZE_AUTH_TOKEN,
            wechatAccessToken: process.env.WECHAT_ACCESS_TOKEN,
            scheduleTime: process.env.SCHEDULE_TIME || '0 0 8 * * *',
            cozeUrl: process.env.COZE_URL || 'https://2kkf772qbd.coze.site/run',
            autoPublish: process.env.AUTO_PUBLISH === 'true',
            runOnStart: process.env.RUN_ON_START === 'true'
        };

        // 初始化日志器
        this.logger = new Logger('wechat-scheduler');

        // 验证配置
        this.validateConfig();

        // 任务实例
        this.task = null;

        // 执行记录
        this.lastExecutionTime = null;
    }

    validateConfig() {
        const requiredConfigs = [
            { key: 'appid', name: 'WECHAT_APPID' },
            { key: 'secret', name: 'WECHAT_SECRET' },
            { key: 'cozeToken', name: 'COZE_AUTH_TOKEN' }
        ];

        const missingConfigs = requiredConfigs
            .filter(config => !this.config[config.key] || this.config[config.key].trim() === '')
            .map(config => config.name);

        if (missingConfigs.length > 0) {
            this.logger.configError(missingConfigs);
            process.exit(1);
        }

        this.logger.info('配置验证通过');
        this.logger.info(`定时任务时间: ${this.config.scheduleTime}`);
        this.logger.info(`自动发布: ${this.config.autoPublish}`);
        this.logger.info(`启动时执行: ${this.config.runOnStart}`);
    }

    async getWechatAccessToken() {
        if (this.config.wechatAccessToken && this.config.wechatAccessToken.trim()) {
            this.logger.info('使用环境变量配置的 WECHAT_ACCESS_TOKEN');
            return this.config.wechatAccessToken;
        }

        const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${this.config.appid}&secret=${this.config.secret}`;

        try {
            this.logger.info('正在获取微信 Access Token...');
            const response = await axios.get(url, { timeout: 10000 });

            if (response.data.access_token) {
                this.logger.info('微信 Access Token 获取成功');
                return response.data.access_token;
            } else {
                throw new Error(`获取 Access Token 失败: ${JSON.stringify(response.data)}`);
            }
        } catch (error) {
            this.logger.apiError('获取微信 Access Token', error, error.response);
            throw error;
        }
    }

    async callCozeAPI(accessToken) {
        const data = {
            topic_keyword: '',
            wechat_config: {
                access_token: accessToken,
                appid: this.config.appid,
                appsecret: this.config.secret
            },
            auto_publish: this.config.autoPublish
        };

        const headers = {
            Authorization: `Bearer ${this.config.cozeToken}`,
            'Content-Type': 'application/json'
        };

        try {
            this.logger.info('正在调用 Coze API...');
            const response = await axios.post(this.config.cozeUrl, data, {
                headers,
                timeout: 600000 // 10 minutes timeout for long-running Coze API
            });

            if (response.status === 200) {
                this.logger.info('Coze API 调用成功');
                return response.data;
            } else {
                throw new Error(`Coze API 调用失败: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            this.logger.apiError('调用 Coze API', error, error.response);
            throw error;
        }
    }

    async executeTask() {
        const startTime = new Date();
        this.logger.info(`开始执行定时任务 - ${startTime.toLocaleString('zh-CN')}`);

        try {
            const accessToken = await this.getWechatAccessToken();
            const result = await this.callCozeAPI(accessToken);

            const endTime = new Date();
            const duration = endTime - startTime;

            // 记录执行时间
            this.lastExecutionTime = startTime.toISOString();

            this.logger.info(`定时任务执行成功 - ${endTime.toLocaleString('zh-CN')} (耗时: ${duration}ms)`);
            this.logger.info('执行结果:', result);

            return { success: true, duration, result };
        } catch (error) {
            const endTime = new Date();
            const duration = endTime - startTime;

            // 即使失败也记录执行时间
            this.lastExecutionTime = startTime.toISOString();

            this.logger.error(`定时任务执行失败 - ${endTime.toLocaleString('zh-CN')} (耗时: ${duration}ms)`, error);

            return { success: false, duration, error: error.message };
        }
    }

    startScheduler() {
        this.logger.info('微信公众号定时服务启动...');
        this.logger.info(`定时表达式: ${this.config.scheduleTime}`);
        this.logger.info(`启动时立即执行: ${this.config.runOnStart}`);
        this.logger.info('----------------------------------------');

        // 验证cron表达式
        if (!cron.validate(this.config.scheduleTime)) {
            this.logger.error(`无效的定时表达式: ${this.config.scheduleTime}`);
            process.exit(1);
        }

        // 启动定时任务
        this.task = cron.schedule(
            this.config.scheduleTime,
            async () => {
                await this.executeTask();
            },
            {
                scheduled: false
            }
        );

        this.task.start();
        this.logger.info('定时任务已启动，等待执行...');
        this.logger.info('服务运行中，按 Ctrl+C 停止...');

        // 如果配置了启动时立即执行
        if (this.config.runOnStart) {
            this.logger.info('配置了启动时立即执行，正在执行...');
            setTimeout(async () => {
                try {
                    await this.executeTask();
                } catch (error) {
                    this.logger.error('启动时立即执行失败', error);
                }
            }, 2000);
        }

        // 启动健康检查
        this.startHealthCheck();
    }

    startHealthCheck() {
        // 健康检查服务器由底部的 createHealthCheckServer 函数创建
        // 这里不需要额外处理
    }

    stopScheduler() {
        if (this.task) {
            this.task.stop();
            this.logger.info('定时任务已停止');
        }
    }
}

// Web服务器和API路由
function createWebServer(scheduler) {
    const http = require('http');
    const fs = require('fs');
    const path = require('path');
    const url = require('url');

    // 静态文件映射
    const staticFiles = {
        '/': 'public/index.html',
        '/styles.css': 'public/styles.css',
        '/script.js': 'public/script.js',
        '/favicon.ico': null // 可以添加favicon
    };

    // MIME类型映射
    const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.ico': 'image/x-icon',
        '.svg': 'image/svg+xml'
    };

    // 获取MIME类型
    function getMimeType(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        return mimeTypes[ext] || 'text/plain; charset=utf-8';
    }

    // 读取静态文件
    function serveStaticFile(filePath, res) {
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('File Not Found');
                return;
            }

            const mimeType = getMimeType(filePath);
            res.writeHead(200, {
                'Content-Type': mimeType,
                'Cache-Control': 'max-age=3600'
            });
            res.end(data);
        });
    }

    // 处理API请求
    function handleApiRequest(req, res, pathname) {
        const method = req.method;

        // 设置CORS头
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        // 健康检查接口
        if (pathname === '/health') {
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-cache'
            });
            res.end(
                JSON.stringify({
                    status: 'ok',
                    service: 'wechat-scheduler',
                    timestamp: new Date().toISOString(),
                    version: '1.0.0'
                })
            );
            return;
        }

        // 获取服务状态
        if (pathname === '/status' && method === 'GET') {
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-cache'
            });
            res.end(
                JSON.stringify({
                    status: scheduler.task ? 'running' : 'stopped',
                    lastExecution: scheduler.lastExecutionTime || null,
                    scheduleTime: scheduler.config.scheduleTime,
                    autoPublish: scheduler.config.autoPublish,
                    runOnStart: scheduler.config.runOnStart,
                    timestamp: new Date().toISOString()
                })
            );
            return;
        }

        // 立即执行任务
        if (pathname === '/execute' && method === 'POST') {
            req.on('data', _chunk => {
                // 读取请求体数据但不处理
            });

            req.on('end', async () => {
                try {
                    const result = await scheduler.executeTask();
                    res.writeHead(200, {
                        'Content-Type': 'application/json; charset=utf-8'
                    });
                    res.end(JSON.stringify(result));
                } catch (error) {
                    res.writeHead(500, {
                        'Content-Type': 'application/json; charset=utf-8'
                    });
                    res.end(
                        JSON.stringify({
                            success: false,
                            error: error.message
                        })
                    );
                }
            });
            return;
        }

        // API路径未找到
        res.writeHead(404, {
            'Content-Type': 'application/json; charset=utf-8'
        });
        res.end(
            JSON.stringify({
                error: 'API endpoint not found',
                path: pathname
            })
        );
    }

    // 处理静态文件请求
    function handleStaticRequest(req, res, pathname) {
        if (pathname === '/') {
            serveStaticFile('public/index.html', res);
            return;
        }

        const filePath = staticFiles[pathname];
        if (filePath) {
            serveStaticFile(filePath, res);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('File Not Found');
        }
    }

    // 创建HTTP服务器
    return http.createServer((req, res) => {
        const parsedUrl = url.parse(req.url);
        const pathname = parsedUrl.pathname;

        scheduler.logger.info(`${req.method} ${pathname}`);

        // API请求
        if (
            pathname.startsWith('/api/') ||
            pathname === '/health' ||
            pathname === '/status' ||
            pathname === '/execute'
        ) {
            handleApiRequest(req, res, pathname);
        } else if (pathname === '/' || staticFiles[pathname]) {
            handleStaticRequest(req, res, pathname);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not Found');
        }
    });
}

// 如果直接运行此文件，则启动服务
if (require.main === module) {
    const scheduler = new WechatScheduler();
    const port = process.env.PORT || 3000;

    // 启动Web服务器
    const webServer = createWebServer(scheduler);
    webServer.listen(port, () => {
        scheduler.logger.info(`Web服务器运行在端口 ${port}`);
        scheduler.logger.info(`控制台地址: http://localhost:${port}`);
        scheduler.logger.info(`API健康检查: http://localhost:${port}/health`);
    });

    scheduler.startScheduler();
}

module.exports = WechatScheduler;
