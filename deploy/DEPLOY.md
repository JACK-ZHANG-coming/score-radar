# score-radar 部署指南

> 目标：将 score-radar（成绩管理后台系统）部署到自有服务器 `43.134.106.173`（Ubuntu 24.04），通过 `https://cjgl.zhangqiang.hk.cn` 对外提供服务。
> 以下所有命令均假设在**本地 macOS（darwin）终端**或**服务器 SSH 终端**执行，每条可直接复制。

## 双实例总览（2026-09-15 起本仓库支持两套独立部署）

| 实例 | 域名 | 代码目录 | 端口 | pm2 进程名 | 数据库 | nginx 配置 | pm2 配置 |
|---|---|---|---|---|---|---|---|
| cjgl（第一套） | cjgl.zhangqiang.hk.cn | /var/www/cjgl | 3000 | score-radar | /var/www/cjgl/server/data/score_radar.db | deploy/nginx/cjgl.zhangqiang.hk.cn.conf → sites-available/cjgl | deploy/pm2/ecosystem.config.js |
| **cjglzq（第二套）** | cjglzq.zhangqiang.hk.cn | /var/www/cjglzq | **3001** | **score-radar-zq** | /var/www/cjglzq/server/data/score_radar.db（全新空库自举） | deploy/nginx/cjglzq.zhangqiang.hk.cn.conf → sites-available/cjglzq | deploy/pm2/ecosystem-cjglzq.config.js |

**两实例五完全独立**：目录树 / 进程 / 端口 / JWT_SECRET / 数据库文件，互不复用互不共享；各自独立 LE 证书与 crontab 备份（cjgl 03:00、cjglzq 03:15 错峰）。对任一实例做增量更新时，**rsync 目标路径必须写对**（下表命令把 cjgl 全文中的 `cjgl` 相关标识替换为 cjglzq 系即可：路径 /var/www/cjgl→cjglzq、exclude 加 `deploy/pm2/ecosystem-cjglzq.config.js`、pm2 restart score-radar-zq）。

## 架构一览

```
浏览器
  │  https://cjgl.zhangqiang.hk.cn
  ▼
nginx（服务器 443，负责 SSL 终止 + 反代）
  │  http://127.0.0.1:3000
  ▼
Express 单进程（pm2 守护，server/src/index.js）
  ├── web/dist 静态文件（前端 Vue3 构建产物）
  ├── /api/*      业务接口（含 SPA 回退，非 /api 的 GET 深链回送 index.html）
  └── better-sqlite3（数据文件 server/data/score_radar.db）
```

- 端口占用：服务器上只需对外放行 **80/443**，3000 仅监听本机回环，不出公网。
- **若服务器上 3000 已被其他服务占用**：修改 `deploy/pm2/ecosystem.config.js` 中的 `PORT`，并同步修改 `deploy/nginx/cjgl.zhangqiang.hk.cn.conf` 中 `proxy_pass` 的端口。检查占用：`sudo ss -ltnp | grep :3000`。

---

## 步骤 0：DNS 解析

在 DNSPod / 腾讯云解析控制台为 `zhangqiang.hk.cn` 添加记录：

| 主机记录 | 记录类型 | 记录值 |
|---------|---------|-------|
| cjgl | A | 43.134.106.173 |

添加后本地验证（生效通常几分钟内，最长等 TTL）：

```bash
dig +short cjgl.zhangqiang.hk.cn
# 期望输出：43.134.106.173
```

## 步骤 1：本地构建前端

```bash
cd /Users/zhangqiang/Documents/GitHub/score-radar/web
npm install
npm run build
```

构建成功后会生成 `web/dist/`。

## 步骤 2：打包上传（rsync）

**首次部署**，数据目录不打包，让服务器自建全新数据库（首次启动 seed 会自动创建 admin 账号）：

```bash
cd /Users/zhangqiang/Documents/GitHub/score-radar
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude 'server/data' \
  --exclude 'web/node_modules' \
  --exclude '.git' \
  ./ root@43.134.106.173:/var/www/cjgl/
```

> **为什么排除 node_modules**：better-sqlite3 是平台相关原生二进制，本地 macOS 编译产物在 Linux 上无法运行，所有依赖必须在服务器上重新 `npm install`（见步骤 3）。

> **如果想带上本地已有数据**：先在本地停掉正在运行的 score-radar 服务，再单独拷数据库（避免拷到 WAL 未合并的中间状态）：
> ```bash
> # 本地（推荐用 sqlite3 在线备份，不要求停服）：
> sqlite3 /Users/zhangqiang/Documents/GitHub/score-radar/server/data/score_radar.db ".backup /tmp/score_radar.db"
> scp /tmp/score_radar.db root@43.134.106.173:/var/www/cjgl/server/data/score_radar.db
> ```
> 注意 WAL 模式下直接拷 `.db` 文件而不停服，可能丢失尚未 checkpoint 的写入；用 `sqlite3 .backup` 或停服后连 `-wal`/`-shm` 文件一起拷最安全。

## 步骤 3：服务器上安装依赖

SSH 登录服务器：

```bash
ssh root@43.134.106.173
```

确认 Node ≥ 18（服务器若已有 ai-manage/aitools 站点，Node 应已就绪）：

```bash
node -v
# 若未安装：
# curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
# sudo apt install -y nodejs
```

安装编译环境（better-sqlite3 需要编译原生模块，若 npm install 报 node-gyp 错误先执行）：

```bash
sudo apt update
sudo apt install -y build-essential python3
```

进入项目安装服务端依赖（**必须在服务器上执行**，不要上传本地 node_modules）：

```bash
mkdir -p /var/www/cjgl/server/data
cd /var/www/cjgl/server
npm install --omit=dev
```

## 步骤 4：PM2 启动并守护

```bash
# 若 pm2 未安装：
npm i -g pm2

cd /var/www/cjgl

# ！！！先把 deploy/pm2/ecosystem.config.js 中 JWT_SECRET 换成强随机值：
openssl rand -hex 32
vim deploy/pm2/ecosystem.config.js   # 用上面输出替换 CHANGE_ME_TO_RANDOM_64

# 启动
pm2 start deploy/pm2/ecosystem.config.js --env production

# 设置开机自启（按提示复制执行输出的 sudo 命令）
pm2 save
pm2 startup
```

验证：

```bash
pm2 status                    # score-radar 应为 online
pm2 logs score-radar --lines 20
curl http://127.0.0.1:3000/api/health
# 期望返回：{"code":0,"message":"ok"}
```

## 步骤 5：nginx 配置（两阶段：先 80 签证书，再开 443）

**nginx 部分与服务器上已有其他站点互不影响**。本服务器（ai-manage / aitools / birthday 等）走 `sites-available` + `sites-enabled` 软链结构，本站沿用同一惯例（conf.d 在该服务器为空目录，不用）。

```bash
# 1) 建 ACME webroot 目录（与代码目录 /var/www/cjgl 分离，避免混淆）
sudo mkdir -p /var/www/cjgl-webroot

# 2) 首次部署：先只上 80 配置（把源文件中 HTTPS:443 块整段注释掉）
sudo cp /var/www/cjgl/deploy/nginx/cjgl.zhangqiang.hk.cn.conf /etc/nginx/sites-available/cjgl
sudo ln -sf /etc/nginx/sites-available/cjgl /etc/nginx/sites-enabled/cjgl
# 编辑 /etc/nginx/sites-available/cjgl，将 server 443 整段注释（配置文件头有完整说明）
sudo nginx -t && sudo systemctl reload nginx

# 3) webroot 方式签发证书
sudo certbot certonly --webroot -w /var/www/cjgl-webroot -d cjgl.zhangqiang.hk.cn

# 4) 签发成功后，取消 443 块注释（配置内证书路径即为 Let's Encrypt 标准路径，无需改动）
sudo nginx -t && sudo systemctl reload nginx
```

> 本部署实例的线上状态（2026-09-15）：证书已于当日签发，有效期至 2026-12-14，`certbot renew --dry-run` 模拟续期通过，自动续期由 certbot systemd timer 负责。

## 步骤 6：验证清单

| 检查项 | 命令 / 操作 | 期望结果 |
|-------|------------|---------|
| 健康检查 | `curl https://cjgl.zhangqiang.hk.cn/api/health` | `{"code":0,"message":"ok"}` |
| 页面可访问 | 浏览器打开 `https://cjgl.zhangqiang.hk.cn` | 登录页 |
| 默认账号 | 用 `admin / admin123` 登录 | 进入系统 |
| 深链刷新 | 浏览器访问 `https://cjgl.zhangqiang.hk.cn/analysis/overview` 后按 F5 | 仍显示页面（SPA 回退），不是 JSON |
| API 404 | `curl https://cjgl.zhangqiang.hk.cn/api/nonexistent` | JSON `{"code":404,"message":"接口不存在"}` |
| Excel 导入（可选） | 系统内"试卷管理 → 导入 Excel" | 导入成功 |
| 进程守护 | `pm2 status` | score-radar 为 online |
| 证书自动续期 | `sudo certbot renew --dry-run` | dry run 成功 |

## 步骤 7：安全与后续运维

1. **JWT_SECRET 必须已换**：步骤 4 中若跳过了，现在补上（`openssl rand -hex 32` 生成，替换 ecosystem.config.js 中的值，然后 `cd /var/www/cjgl && pm2 delete score-radar && pm2 start deploy/pm2/ecosystem.config.js --env production` —— 环境变量改动需重启进程才生效）。
2. **admin 默认密码**：首次登录后立即通过系统内"修改密码"功能改掉 `admin123`。
3. **防火墙/安全组**：腾讯云安全组只需放行 22/80/443，**3000 不对外**（Express 只被 nginx 反代）。
4. **证书自动续期**：certbot 的 systemd timer 一般已自动生效，验证一次：
   ```bash
   sudo certbot renew --dry-run
   systemctl list-timers | grep certbot
   ```
5. **数据备份**（建议 cron 每日凌晨备份，保留 7 天）：
   ```bash
   # 先建备份目录（必须在 crontab 之前执行，否则首次备份会因目录不存在而失败）
   sudo mkdir -p /var/www/cjgl/backups

   sudo crontab -e
   # 加入一行（凌晨 3 点在线备份 sqlite，自动覆盖 7 天前旧备份；
   # mkdir -p 兜底确保目录存在，勿改 \% 的转义）：
   # 0 3 * * * mkdir -p /var/www/cjgl/backups && sqlite3 /var/www/cjgl/server/data/score_radar.db ".backup /var/www/cjgl/backups/score_radar_$(date +\%u).db"
   ```
6. **代码更新流程（增量）**：
   ```bash
   # 本地：
   cd /Users/zhangqiang/Documents/GitHub/score-radar/web && npm run build
   rsync -avz --delete \
     --exclude 'node_modules' \
     --exclude 'server/data' \
     --exclude 'web/node_modules' \
     --exclude '.git' \
     --exclude '.DS_Store' \
     --exclude '.workbuddy' \
     --exclude 'deploy/pm2/ecosystem.config.js' \
     ./ root@43.134.106.173:/var/www/cjgl/

   # 服务器：
   ssh root@43.134.106.173
   cd /var/www/cjgl/server && npm install --omit=dev   # 仅依赖变更时需要
   pm2 restart score-radar
   curl https://cjgl.zhangqiang.hk.cn/api/health
   ```

## 已知注意点汇总

- **better-sqlite3 平台相关**：本地 mac 的 node_modules 绝不能直接搬到 Linux，所有 rsync 排除规则里都包含 `node_modules`，依赖必须在服务器上 `npm install`。
- **native 模块编译失败**：`sudo apt install -y build-essential python3` 后重试。
- **3000 端口冲突**：改 ecosystem.config.js 与 nginx conf 两处端口，`pm2 restart` 后 reload nginx。
- **数据库文件**：`server/data/score_radar.db` 被 .gitignore 忽略，rsync 也排除，线上数据不会被部署覆盖。
- **⚠️ 增量部署勿覆盖 JWT_SECRET**：真实 JWT_SECRET 只保存在**服务器**的 `/var/www/cjgl/deploy/pm2/ecosystem.config.js`；仓库里的是占位值。rsync 增量部署时，`deploy/pm2/ecosystem.config.js` 会被服务器版覆盖目标之外——注意方向：本地→服务器方向同步会把**占位值覆盖掉服务器上的真实密钥**！增量更新时请对该文件加 `--exclude 'deploy/pm2/ecosystem.config.js'`，或同步后在服务器重新替换并 `pm2 restart score-radar`。
- **首次部署实录（2026-09-15）**：DNS（AliDNS/Google 双验生效）→ rsync → 服务器 npm install（better-sqlite3 编译通过）→ pm2 7.0.4 → 证书签发 → 443 启用，全程约 30 分钟。线上数据：1252 学生 / 227 成绩 / 4 批次（自本地 sqlite3 .backup 迁移）。
- **favicon 缺失**：`web/dist` 无 favicon.ico，浏览器标签页图标为空。后续可在 `web/public/` 放置 favicon 后重新 `npm run build` 并重新部署即可，不影响功能。
