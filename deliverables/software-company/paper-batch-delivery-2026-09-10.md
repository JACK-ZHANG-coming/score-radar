# 试卷批次管理 · 交付总结

> 交付日期：2026-09-10 ｜ 团队：software-paper-batch（软件团队 SOP 标准流程）
> 流程：需求路由（中大型增量）→ PRD → 架构设计 → 实现 → 独立 QA 回归 → 返工 → 终验

## TL;DR

新增「试卷批次管理」全栈功能（页面 + 表 + 8 接口 + 成绩页联动），QA 独立回归 53/53 全通过，返工两处已修复终验。**未 git commit**，等待用户本地测试确认后再提交。

## 交付概览

| 指标 | 结果 |
| --- | --- |
| 交付状态 | ✅ 全部完成（含 2 处返工修复） |
| QA 测试通过率 | 53/53（100%），0 崩溃 |
| 已知问题 | 0 功能性问题；遗留 1 条历史数据（见下） |
| 依赖变更 | 零新增（前后端均沿用现有依赖） |

## 文件清单

**新增（4）**
- `server/src/utils/paperBatch.js` — ensurePaperBatch 幂等占位 / computedPassLine / created_at 众数派生
- `server/src/routes/paper-batches.js` — 8 类接口 + 模板下载（含返工修复：导入空占比兜 60、分页一致性）
- `web/src/api/paper-batches.js` — 前端 API 封装
- `web/src/views/PaperBatchList.vue` — 批次管理页（684 行，列设置/增删改查/导入导出/分项联动预填总满分/只读合格线）

**修改（7）**
- `server/src/db.js` — paper_batches 建表 + 索引 + 存量批号冷启动回填（幂等）
- `server/src/index.js` — 挂载 /api/paper-batches
- `server/src/utils/excel.js` — PAPER_BATCH_HEADERS 13 列常量
- `server/src/routes/scores.js` — 三处改造：batch-nos 合并数据源（对象数组 camelCase）；POST/PUT/import 注入分数校验 + ensurePaperBatch 静默占位
- `web/src/router/index.js` — /paperBatch 路由（顺序：成绩→批次→学生）
- `web/src/views/Layout.vue` — 菜单项「试卷批次管理」（Files icon）
- `web/src/views/ScoreList.vue` — 合格状态列（—/合格/不合格）、total 着色按批号 passLine（回退 60）、下拉对象数组适配 + 级联、保存/导入后刷新批号下拉

**设计文档（2）**
- `docs/prd-paper-batch.md`（PRD，含 Q1~Q10 口径拍板）
- `docs/arch-paper-batch.md`（架构设计 + T1~T11 任务分解）

## 核心设计口径（10 项拍板）

| # | 结论 |
| --- | --- |
| Q1 | 批次名称 = 默认可见列 |
| Q2 | 占位批号（total_full=0）跳过分数校验与合格标记，显示「—」 |
| Q3 | 五项分项全做 ≤各自满分 + 总分 ≤总满分 |
| Q4 | 学生总分取 scores.total |
| Q5 | 模板 13 列；合格线/创建时间为只读列，导入时服务端重算 |
| Q6 | 批量删除遇关联整体 409，data.blocked 列出批号 |
| Q7 | batch-nos = paper_batches 全量 ∪ scores（按班级过滤），返回 {batchNo, batchName, passLine, totalFull, configured} |
| Q8 | pass_line 不落库，读取时 ROUND(total×ratio/100, 2) |
| Q9 | 独立合格状态列；total 着色按选中批号 passLine（无则回退 60） |
| Q10 | ensurePaperBatch 后端静默；前端导入/保存成功后补刷下拉 |

另：存量批号冷启动回填（db.js 内联幂等，首启回填、重启 0 条）；ensurePaperBatch 触发点在 scores POST/import；导入空「默认合格占比」兜 60、显式 0 保留。

## 使用提示

1. 启动：后端 `cd server && npm run dev`（3000）；前端 `cd web && npm run dev`（5174）；admin/admin123
2. 首启会自动为存量批号 `20260901160700` 生成占位行（total_full=0），请到【试卷批次管理】页补全实际满分配置（如总分 100 / 占比 60 → 合格线 60），配置后成绩页即自动生效校验与合格标记
3. 历史遗留：scores 表中「吴佳佳(66747644，4班/未登录)」行为 9 月初历史会话残留（其批号 20260901160701 亦是占位行），留或删可在本地测试时决定
4. 验证方式：本机沙箱无法做 UI 截图级验证，已按惯例走 API 级 + 构建级验证；建议用户浏览器实测 /paperBatch 页面交互

## 用户下一步建议

1. `cd server && npm run dev`、`cd web && npm run dev`，浏览器登录验证 /paperBatch 页面（新增→配置 20260901160700 占位行→回成绩页看下拉带出与合格标记）
2. 在成绩页试导入超分成绩，确认第 N 行拦截提示
3. 下载批次导入模板，留空「默认合格占比」导入，确认兜 60
4. 测试满意后再告知执行 git commit（纪律：先测后提）
