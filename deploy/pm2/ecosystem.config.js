/**
 * score-radar PM2 进程配置
 *
 * 使用方式（在服务器项目根目录下执行）：
 *   pm2 start deploy/pm2/ecosystem.config.js --env production
 *
 * 注意：
 * 1. PORT=3000 若与服务器上其他服务冲突，请同步修改此处 PORT
 *    以及 deploy/nginx/cjgl.zhangqiang.hk.cn.conf 中的 proxy_pass 端口。
 * 2. JWT_SECRET 必须在部署时替换为强随机值，生成命令：
 *      openssl rand -hex 32
 */
module.exports = {
  apps: [
    {
      name: 'score-radar',
      cwd: __dirname + '/../../server',
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '200M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        JWT_SECRET: 'CHANGE_ME_TO_RANDOM_64'
      }
    }
  ]
};
