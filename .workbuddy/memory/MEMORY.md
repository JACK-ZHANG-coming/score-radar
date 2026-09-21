# MEMORY.md - score-radar 项目长期笔记

## 部署·双实例 cjgl + cjglzq（2026-09-15 均已上线,未 commit）
- **cjglzq 第二实例**：/var/www/cjglzq、端口 3001、pm2 score-radar-zq、独立 JWT_SECRET、**全新自举库**（不含旧站二次导入数据）；证书至 2026-12-14；crontab 03:15 备份错峰。cross-write 实证隔离（写入只落新库），旧站基线 1252/395/7/1 验证未动。students 接口字段是 exam_no 蛇形。
- **http2/default 站点告警**：Ubuntu default 站点 443 无 http2 与两新站 `listen 443 ssl http2` 重定义告警，用户拍板保留 http2（告警无害、SNI 命中不受影响）；去掉则 h2 降级 1.1。根治需统一 default 声明，未动。
- 仓库新增：deploy/nginx/cjglzq...conf + deploy/pm2/ecosystem-cjglzq.config.js（独立配置文件防 rsync 互覆盖）；DEPLOY.md 双实例总览表。增量更新两站时 exclude 列表要加入对方的配置文件。
- **线上事实**：https://cjgl.zhangqiang.hk.cn 可访问，HTTP/2+LE 证书（至 2026-12-14，自动续期 dry-run 通过）。形态：nginx(sites-available/cjgl 软链，80:ACME+301/443:反代) → 127.0.0.1:3000 Express(pm2 7.0.4 守护,score-radar)。代码 **/var/www/cjgl**（服务器惯例 /var/www/<站点名>，非 /www/wwwroot），ACME webroot 独立 **/var/www/cjgl-webroot**。
- 数据已迁：1252 学生/227 成绩/4 批次（本地 sqlite3 .backup 在线备份，WAL 安全）。admin/admin123 已可登录。
- **增量部署铁律：rsync 必加 --exclude 'deploy/pm2/ecosystem.config.js'**（真实 JWT_SECRET 仅存服务器该文件，本地是占位值，方向覆盖会泄密钥失效/重置为占位）。变更后 pm2 restart + curl health 验证。
- 教训：部署前先摸清服务器实际约定（本例 conf.d 空目录、无 /www/wwwroot，与文档假设不符）；SSH 多行内联脚本引号易碎→本地生成+scp；certbot dry-run 6 证书约 3 分钟需后台/宽超时。
- SPA 回退已带上线：深链刷新 /analysis/overview 返回页面；`listen 443 ssl http2;` 行内写法（nginx 1.24.0 兼容）线上 h2 实证生效。

## 学生成绩分析模块·路由骨架(2026-09-12 交付,未 commit)
- 一级路由 'analysis'(redirect /analysis/overview,icon TrendCharts)置于 'scores' 之前,五个二级:overview 成绩分析总览/failures 不及格管理/top-students 优生管理/abnormal-profiles 异常学生画像/progress-profiles 进步学生画像;占位页 web/src/views/analysis/*.vue(el-card+el-empty 纯模板,无 script)。
- Layout menus 支持 children 分组(el-sub-menu);点击一级标题→router.push(children[0].path) 的 handleGroupClick 挂在 #title 插槽内 div.sub-menu-title 上。**教训:@click 挂 el-sub-menu 根元素会被二级项冒泡劫持(两级 push 竞争,前者 cancelled,四个非首位二级页点不进)——必须挂 title 插槽内层,与二级 ul 平级兄弟分支,事件路径不交叉**。
- 折叠态补丁:EP 原生 .el-menu--collapse 直接子 span 隐藏规则因 span 被 div 包裹失配,需补 .el-menu--collapse .sub-menu-title span{visibility:hidden;width:0;height:0;overflow:hidden}(scoped 直接后代写法,构建产物实证命中 span[data-v])。
- 面包屑 /analysis/* 三级(首页/学生成绩分析/当前页,groupTitle 计算属性),其他页两级不变。QA 两轮:首轮 7P1F(冒泡)→修复→二轮全 PASS+P3 折叠溢出已补;build 通过,五占位页独立 chunk。

## 试卷批次管理·第四轮:批号同步(2026-09-11 交付,未 commit)
- 接口 9 POST /api/paper-batches/sync {execute}:false=只算差异(toCreate 携 createdAt/toDelete 携 configured+totalFull)不落库;true=服务端重算+db.transaction 单事务(ensurePaperBatch 插入+DELETE IN),异常整体回滚 500。差异口径:scores 非空批号 DISTINCT vs paper_batches 全表,成绩表为唯一事实源(含已配置批次照删,确认框标红 ⚠)。
- 前端:syncLoading 防重复、无差异 info 不弹窗、ElMessageBox HTML 确认(escapeHtml 五元转义)、取消静默、失败不改本地状态、成功回第1页+fetchList/fetchBatchNoOptions 并行。
- QA 5/5 PASS(实库只读+副本场景:增2删5三高危形态/众数派生专项/DELETE 注错含 INSERT 回滚/竞态重算实证);engineer 与 QA 双 harness 交叉印证。
- **数据事实:用户重导过成绩 Excel,scores 51 行批号全空**(昨日尚有);当前点同步=删除批次表 2 行,已向用户明示属预期。
- server/prism_scores.db:19:08 用户测试时出现的 0 字节空文件,无表无引用,已入 .gitignore(新增局部规则 *.db),未物理删除。

## 试卷批次管理·第五轮:班级派生列(2026-09-12 已 commit 88e85f6)
- 列表+导出新增「班级」列:批号第一个 `-` 前段+「班」(16-电子表格6_1→16班);多 `-` 取最前;无 `-`/前段空/批号空 → 后端 null 前端显示 —。后端 deriveClass+attachDerived 运行时派生不落库;导出 14 列(班级@批号后),导入模板 13 列不动。
- 前端 mergeSavedOrder:旧 localStorage 列存档无 class 键时,新列插到定义前邻列在存档中的位置之后(班级永远紧跟批号),不追加末尾;用户自定义排列与可见性保留。
- QA 7/7 PASS(含 16--x→16班边界、导出解包、四场景存档推演)。

## 优生管理页面（2026-09-21 交付，未 commit）
- 文件：`web/src/views/analysis/AnalysisTopStudents.vue`（重写）、`server/src/routes/analysis.js`（+`GET /top-students`）、`web/src/api/analysis.js`（+`getTopStudentMatrix`）、`server/src/utils/paperBatch.js`（+`computedExcellentLine`）。文档 `docs/prd-top-students.md`、`docs/arch-top-students.md`。未动 AnalysisFailures.vue / db.js / router / index.js。
- **口径（不及格页的严格镜像、判定方向相反）**：优秀线 `ROUND(该科满分×优秀比例/100,2)`，得分 **≥** 线 = 达优；比例 80/85/90 默认 80（不及格页 60/70/80 默认 60），**例为 query 参数、运行时计算、不读 `paper_batches.pass_ratio`、不改表**；该科满分 ≤0 跳过判定（不达优、优秀率 0%、表头省括号、不参与三态）。
- **单元格三态（不读任何 correction_* 订正分）**：`dropped`↓（更晚批次**存在**未达优）> `new`↗（首次达优）> `stable`✓。注意 PRD 初稿写的「再无达优」已作废，以「存在未达优」为准——干预信号更敏感，能暴露波动型学生。列内名单**分数降序**（不及格页升序）；右侧「优秀次数」el-tag **≥2 success / =1 warning / 0 info**（仅顶档反转，其余对称）。
- **关键行为**：无人达优**不显示空状态**，v-if 与不及格页逐字一致 `!loading && (!classes.length || !batches.length)`，仍渲染矩阵 + 全班 0 次名单，每列首行「暂无优秀学生」。这是两页体验一致的核心，勿改。
- **连带修复（基线页既有缺陷）**：`SUBJECTS[key] || SUBJECTS.total` 缺 `hasOwnProperty` 校验，`subject=constructor/__proto__/toString` 会命中 `Object.prototype` → 满分取 0 → 返回 200 但静默空矩阵。已在 analysis.js 顶部加共用 `hasOwn`，`/failures` 与 `/top-students` **两路由一并修**以保持一致。
- QA 两轮全绿：第 1 轮 100/100、第 2 轮 154/154，最终路由 NoOne。有效手法：起 4 个隔离服务（含 `git show HEAD:` 基线版、以及「单独还原修复前写法」的对照版）做逐字节对跑，能精确证明改动范围未外溢；DB 副本一律放 /tmp，禁止触碰 `server/data/score_radar.db`。

## 项目概况
成绩管理后台系统：Vue3 组合式 API + Vite + Element Plus + Pinia（web/，端口 5174）；Express + better-sqlite3 + JWT（server/，端口 3000）。默认账号 admin/admin123。

## 关键约定
- 成绩字段：序号、考号、姓名、学校、班级、考试状态、交卷时间、选择题、电子表格、Access、Python、综合题、总成绩
- 学生字段：考号、姓名、班级、年级、学校
- 导入策略：同考号更新、新考号新增（幂等）；交卷时间统一存 YYYY-MM-DD HH:mm
- 用户上传的 Excel 为 GBK 双重编码，导入时必须走 utils/excel.js 的 fixEncoding（TextDecoder gbk）
- Excel 序列号时间（如 46266.65）需 XLSX.SSF.parse_date_code 转换

## 环境备忘
- 本机 agent-browser Chromium 下载多次超时（网络问题）；沙箱拦截本地 Chrome 启动（RLZ 写入 ~/Library 被拒）→ UI 截图验证需用户批准非沙箱运行或网络恢复
- 本地 Excel 读写用 tencent-local-office-edit 的 edsdk.py

## 试卷批次管理（2026-09-10 交付，未 commit）
- 路由 /api/paper-batches（8+2 接口）+ /paperBatch 页面；paper_batches 表 batch_no UNIQUE 关联 scores.batch_no
- 核心口径：占位行 total_full=0 = 未配置（分数校验/合格标记跳过，前端显示「—」configured=false）；合格线 ROUND(总×占比/100,2) 运行时算不落库；创建时间=交卷日期众数派生；batch-nos 响应为对象数组 {batchNo,batchName,passLine,totalFull,configured}
- 导入 Excel「默认合格占比」空值兜 60；pageSize 非正数统一回落 25（paper-batches.js 已改，scores/students 保留旧写法不动）
- QA 53/53 通过；交付报告 deliverables/software-company/paper-batch-delivery-2026-09-10.md；设计文档 docs/prd-paper-batch.md + docs/arch-paper-batch.md
- 增量 3（预填）：编辑批次表单时，五科满分为 0 的项自动填同批号学生该科 MAX（GET /max-scores/:batchNo，返回 {count,五科MAX}；SQLite 空集 MAX=null，前端 count=0 提前返回 + max>0 才填，null/NaN 不误填）；仅编辑分支触发，非 0 保持原值，总满分仅未被手改时自动求和；竞态用 prefillTokenSeq 令牌作废旧响应。数据事实：批号 20260901160700 仅 spreadsheet 有真实非零（MAX=10，43/51 行），其余四科库内为 0 —— 预填演示只会填 spreadsheet，属数据非缺陷
- Vite 前端只绑 ::1：本地探活用 http://[::1]:5174（127.0.0.1 拒连≠服务挂）
