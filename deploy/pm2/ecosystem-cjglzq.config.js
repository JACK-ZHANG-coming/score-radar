/**
 * score-radar 独立实例（cjglzq.zhangqiang.hk.cn）PM2 进程配置
 *
 * 与 cjgl 实例（deploy/pm2/ecosystem.config.js，score-radar @ 3000）完全独立：
 * 进程名 / 端口 / JWT_SECRET / 数据库均不同，互不复用、互不共享。
 *
 * 使用方式（在服务器 /var/www/cjglzq 下执行）：
 *   pm2 start deploy/pm2/ecosystem-cjglzq.config.js --env production
 *
 * 注意：
 * 1. PORT=3001 若被占用，需同步修改 deploy/nginx/cjglzq.zhangqiang.hk.cn.conf 的 proxy_pass。
 * 2. JWT_SECRET 部署时替换为强随机值（openssl rand -hex 32），
 *    并必须与 cjgl 实例的值不同；真实值只保留在服务器，仓库内恒为占位。
 */
module.exports = {
  apps: [
    {
      name: 'score-radar-zq',
      cwd: __dirname + '/../../server',
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '200M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        JWT_SECRET: 'CHANGE_ME_TO_RANDOM_64'
      }
    }
  ]
};
