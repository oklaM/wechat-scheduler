const cron = require('node-cron');
const axios = require('axios');
const winston = require('winston');
require('dotenv').config();

class WechatScheduler {
    constructor() {
        this.appid = process.env.WECHAT_APPID;
        this.secret = process.env.WECHAT_SECRET;
        this.cozeToken = process.env.COZE_AUTH_TOKEN;
        this.wechatAccessToken = process.env.WECHAT_ACCESS_TOKEN;
        this.scheduleTime = process.env.SCHEDULE_TIME || '0 0 8 * * *';
        this.cozeUrl = process.env.COZE_URL || 'https://2kkf772qbd.coze.site/run';
        this.autoPublish = process.env.AUTO_PUBLISH === 'true';

        this.logger = this.initLogger();

        this.validateConfig();
    }

    initLogger() {
        return winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston.format.combine(
                winston.format.timestamp({
                    format: 'YYYY-MM-DD HH:mm:ss'
                }),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            defaultMeta: { service: 'wechat-scheduler' },
            transports: [
                new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
                new winston.transports.File({ filename: 'logs/combined.log' }),
                new winston.transports.Console({
                    format: winston.format.combine(winston.format.colorize(), winston.format.simple())
                })
            ]
        });
    }

    validateConfig() {
        if (!this.appid || !this.secret || !this.cozeToken) {
            this.logger.error('配置错误：请检查 .env 文件中的 WECHAT_APPID, WECHAT_SECRET 和 COZE_AUTH_TOKEN 配置');
            process.exit(1);
        }

        this.logger.info('配置验证通过');
        this.logger.info(`定时任务时间: ${this.scheduleTime}`);
        this.logger.info(`自动发布: ${this.autoPublish}`);
    }

    async getWechatAccessToken() {
        if (this.wechatAccessToken && this.wechatAccessToken.trim()) {
            this.logger.info('使用环境变量配置的 WECHAT_ACCESS_TOKEN');
            return this.wechatAccessToken;
        }

        const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${this.appid}&secret=${this.secret}`;

        try {
            this.logger.info('正在获取微信 Access Token...');
            const response = await axios.get(url, {
                timeout: 10000
            });

            if (response.data.access_token) {
                this.logger.info('微信 Access Token 获取成功');
                return response.data.access_token;
            } else {
                throw new Error(`获取 Access Token 失败: ${JSON.stringify(response.data)}`);
            }
        } catch (error) {
            this.logger.error('获取微信 Access Token 失败:', error.message);
            throw error;
        }
    }

    async callCozeAPI(accessToken) {
        const data = {
            topic_keyword: '',
            wechat_config: {
                access_token: accessToken,
                appid: this.appid,
                appsecret: this.secret
            },
            auto_publish: this.autoPublish
        };

        const headers = {
            Authorization: `Bearer ${this.cozeToken}`,
            'Content-Type': 'application/json'
        };

        try {
            this.logger.info('正在调用 Coze API...');
            const response = await axios.post(this.cozeUrl, data, {
                headers,
                timeout: 30000
            });

            if (response.status === 200) {
                this.logger.info('Coze API 调用成功');
                return response.data;
            } else {
                throw new Error(`Coze API 调用失败: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            this.logger.error('调用 Coze API 失败:', error.message);
            if (error.response) {
                this.logger.error('响应数据:', error.response.data);
            }
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

            this.logger.info(`定时任务执行成功 - ${endTime.toLocaleString('zh-CN')} (耗时: ${duration}ms)`);
            this.logger.info('执行结果:', result);

            return { success: true, duration, result };
        } catch (error) {
            const endTime = new Date();
            const duration = endTime - startTime;

            this.logger.error('定时任务执行失败:', error.message);
            this.logger.error(`失败时间: ${endTime.toLocaleString('zh-CN')} (耗时: ${duration}ms)`);

            return { success: false, duration, error: error.message };
        }
    }

    startScheduler() {
        this.logger.info('微信公众号定时服务启动...');
        this.logger.info('APPID:', this.appid.substring(0, 10) + '...');
        this.logger.info(`定时表达式: ${this.scheduleTime}`);
        this.logger.info('----------------------------------------');

        if (!cron.validate(this.scheduleTime)) {
            this.logger.error(`无效的定时表达式: ${this.scheduleTime}`);
            process.exit(1);
        }

        cron.schedule(
            this.scheduleTime,
            async () => {
                await this.executeTask();
            },
            {
                scheduled: true,
                timezone: 'Asia/Shanghai'
            }
        );

        this.logger.info('定时任务已启动，等待执行...');
        this.logger.info('服务运行中，按 Ctrl+C 停止...');

        if (process.env.NODE_ENV === 'development') {
            process.stdin.once('data', async data => {
                const input = data.toString().trim().toLowerCase();
                if (input === 'y' || input === 'yes' || input === 'test') {
                    this.logger.info('开始测试执行...');
                    await this.executeTask();
                    this.logger.info('测试完成，服务继续运行...');
                }
            });
        }
    }
}

async function gracefulShutdown() {
    // eslint-disable-next-line no-console
    console.log('收到停止信号，正在优雅关闭...');
    process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

const http = require('http');

// 健康检查端点
function createHealthCheckServer() {
    const server = http.createServer((req, res) => {
        if (req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
                JSON.stringify({
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime()
                })
            );
        } else if (req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
                JSON.stringify({
                    name: 'Wechat Scheduler',
                    version: '1.0.0',
                    status: 'running'
                })
            );
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not Found' }));
        }
    });

    return server;
}

if (require.main === module) {
    const scheduler = new WechatScheduler();
    const port = process.env.PORT || 3000;

    // 启动健康检查服务器
    const healthServer = createHealthCheckServer();
    healthServer.listen(port, () => {
        scheduler.logger.info(`健康检查服务器运行在端口 ${port}`);
    });

    scheduler.startScheduler();
}

module.exports = WechatScheduler;
