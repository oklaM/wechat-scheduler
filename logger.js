const winston = require('winston');
const path = require('path');
const fs = require('fs');

// 确保日志目录存在
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

class Logger {
    constructor(serviceName = 'app') {
        this.serviceName = serviceName;
        this.logger = this.createLogger();
    }

    createLogger() {
        const isProduction = process.env.NODE_ENV === 'production';
        const logLevel = process.env.LOG_LEVEL || 'info';

        const formats = [
            winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss'
            }),
            winston.format.errors({ stack: true }),
            winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'service'] })
        ];

        // 生产环境使用JSON格式，便于日志收集
        // 开发环境使用可读格式，便于调试
        const consoleFormat = isProduction ?
            winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ) :
            winston.format.combine(
                winston.format.colorize(),
                winston.format.printf((info) => {
                    const { timestamp, level, message, ...meta } = info;
                    let log = `${timestamp} [${level}]: ${message}`;
                    if (Object.keys(meta).length > 0) {
                        log += ` ${JSON.stringify(meta, null, 2)}`;
                    }
                    return log;
                })
            );

        const transports = [
            // 文件日志：所有级别
            new winston.transports.File({
                filename: path.join(logDir, 'combined.log'),
                level: logLevel,
                format: winston.format.combine(...formats, winston.format.json())
            }),
            // 文件日志：错误级别
            new winston.transports.File({
                filename: path.join(logDir, 'error.log'),
                level: 'error',
                format: winston.format.combine(...formats, winston.format.json())
            }),
            // 控制台日志
            new winston.transports.Console({
                level: logLevel,
                format: consoleFormat
            })
        ];

        return winston.createLogger({
            level: logLevel,
            defaultMeta: { service: this.serviceName },
            transports
        });
    }

    debug(message, meta = {}) {
        this.logger.debug(message, meta);
    }

    info(message, meta = {}) {
        this.logger.info(message, meta);
    }

    warn(message, meta = {}) {
        this.logger.warn(message, meta);
    }

    error(message, error = null, meta = {}) {
        if (error instanceof Error) {
            this.logger.error(message, {
                error: {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                    ...meta
                }
            });
        } else {
            this.logger.error(message, { error, ...meta });
        }
    }

    // 便捷方法：记录API错误
    apiError(operation, error, response = null) {
        let details = {
            operation,
            status: response?.status,
            statusText: response?.statusText,
            url: response?.config?.url,
            method: response?.config?.method
        };

        if (response?.data) {
            details.responseData = response.data;
        }

        this.error(`API调用失败: ${operation}`, error, details);
    }

    // 便捷方法：记录配置错误
    configError(missingConfigs = []) {
        this.error('配置错误', null, {
            missingConfigs,
            suggestion: '请检查 .env 文件或环境变量配置'
        });
    }
}

module.exports = Logger;