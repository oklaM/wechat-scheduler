module.exports = {
    apps: [
        {
            name: 'wechat-scheduler',
            script: 'wechat-scheduler.js',
            instances: 1,
            autorestart: true,
            max_memory_restart: '512M',
            env: {
                NODE_ENV: 'development',
                LOG_LEVEL: 'debug'
            },
            env_production: {
                NODE_ENV: 'production',
                LOG_LEVEL: 'info'
            },
            error_file: './logs/err.log',
            out_file: './logs/out.log',
            log_file: './logs/combined.log',
            time: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true,
            kill_timeout: 5000,
            listen_timeout: 8000,
            shutdown_with_message: true,
            exp_backoff_restart_delay: 100,
            max_restarts: 10,
            min_uptime: '10s',
            health_check_grace_period: 3000,
            health_check_fatal_exceptions: true,
            watch: ['logs'],
            ignore_watch: ['node_modules', 'logs/*.log.*'],
            restart_delay: 4000
        }
    ]
};
