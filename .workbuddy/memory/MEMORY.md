# MEMORY.md - score-radar 项目长期笔记

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
