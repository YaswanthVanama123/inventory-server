module.exports = {
  apps: [
    {
      name: 'inventory-backend',
      script: 'src/server.js',
      cwd: '/var/www/inventory-backend',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '700M',
      min_uptime: '30s',
      max_restarts: 10,
      restart_delay: 5000,
      kill_timeout: 10000,
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/root/.pm2/logs/inventory-backend-error.log',
      out_file: '/root/.pm2/logs/inventory-backend-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
