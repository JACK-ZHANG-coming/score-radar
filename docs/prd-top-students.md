# 优生管理页 · 增量 PRD

| 项 | 内容 |
| --- | --- |
| 需求来源 | 用户原文：参考现有「不及格管理页面」的界面布局、视觉风格与交互逻辑，开发「优生管理页面」 |
| 项目 | score-radar（教育成绩管理系统） |
| 技术栈 | 前端 Vue 3 `<script setup>` + Vite + Element Plus + Pinia；后端 Node/Express + better-sqlite3 + JWT |
| 影响范围 | `web/src/views/analysis/AnalysisTopStudents.vue`（重写占位页）、`web/src/api/analysis.js`（+1 方法）、`server/src/routes/analysis.js`（+1 路由）、`server/src/utils/paperBatch.js`（+1 纯函数） |
| 基线页 | `web/src/views/analysis/AnalysisFailures.vue`（505 行，本 PRD 的一一对应基线） |
| 铁律 | **严禁硬编码**班级名 / 考试批次名 / 分数线；全部数据来自接口，优秀线由后端按批次满分运行时计算 |

---

## 一、产品目标

| # | 目标 | 衡量标准 |
| --- | --- | --- |
| G1 | 用与「不及格管理」完全一致的页面结构呈现优生名单，教师零学习成本 | 除判定方向相反外，DOM 结构、类名、间距、字号与基线页逐项对齐（见 §四对照表） |
| G2 | 提供可切换的「优秀类别 + 优秀比例」判定口径，支持按科目定位优生 | 6 个科目口径 × 3 档比例任意组合，切换即时重取矩阵，无页面刷新 |
| G3 | 暴露「优生的稳定性」——谁在持续优秀、谁是新进、谁已掉出 | 矩阵单元格三态标记 + 图例；右侧「优秀次数」降序汇总 |

---

## 二、用户故事

| # | 用户故事 | 验收要点 |
| --- | --- | --- |
| US1 | As a 任课教师，I want 打开优生管理页就能看到当前班级按考试批次铺开的优秀名单，so that 我一眼掌握本班尖子生在各次考试中的表现 | 默认选中第一个班级（来自接口）、默认「总成绩 / 80%」，渲染成功 |
| US2 | As a 教师，I want 切换「优秀类别」与「比例」即时重算名单，so that 我能按单科（如 Python）或更高标准（90%）筛选真正的尖子 | 双击下拉 `@change` 触发重取，优秀线由后端重算，前端不参与计算 |
| US3 | As a 教师，I want 在单元格上看到状态标记（持续优秀 / 本次新进 / 后续掉出），so that 我能区分稳定优生与波动学生，并对掉出者及时干预 | 三态箭头 + 图例 + 悬浮完整说明 |
| US4 | As a 教师，I want 右侧名单按优秀次数降序排列全班所有人，so that 我能同时看到「从未达优」的学生，而不是只看尖子 | 0 次学生保留在列表（info 灰标签），排在最末 |
| US5 | As a 年级管理者，I want 表头直接看到每场考试的优秀率与该科满分，so that 我能横向比较各场次难度 | 表头第三行 `优秀率%（满分）`，满分缺失时省略括号 |

---

## 三、需求池（P0 / P1 / P2）

### P0（核心，必须交付）

| 编号 | 需求 | 说明 / 验收标准 |
| --- | --- | --- |
| P0-1 | 新增后端 `GET /api/analysis/top-students` | `authRequired`；query：`class`（必填）、`subject`（默认 total）、`ratio`（默认 80）；返回体镜像 `/analysis/failures`，字段语义替换为优秀（见 §六） |
| P0-2 | 新增 `computedExcellentLine(full, ratio)` | `server/src/utils/paperBatch.js` 导出，`Math.round(full * ratio / 100 * 100) / 100`；与 `computedPassLine` 同公式、独立命名，避免「优秀线」误用「及格线」语义 |
| P0-3 | 前端 api 封装 | `getTopStudentMatrix(clazz, subject = 'total', ratio = 80)` → `request.get('/analysis/top-students', { params: { class: clazz, subject, ratio } })` |
| P0-4 | 重写页面骨架为 `header-row` 结构 | **不使用** `el-card #header`（当前占位页用），改为与基线页一致的内联 `header-row`：Medal 图标 + 标题 + 双下拉 + 班级 `el-radio-group` |
| P0-5 | 左：批次矩阵 | 行驱动（行数 = 各批次优生名单最大长度）；列 = 考试批次（日期升序）；列宽固定 110、`class-name="batch-col"`；四行表头；单元格单行紧凑「姓名 + 小字分数 + 状态标记」，`title` 承载完整信息 |
| P0-6 | 右：班级汇总名单 | 标题 `{{ currentClass }}（共{{ summary.classStudentCount }}人）`；两列「姓名 / 优秀次数」；`el-tag` 三档着色（§五.4） |
| P0-7 | 图例 + 空状态 + 错误提示 | 图例三态；`el-empty` 三档文案（§五.6）；接口失败 `ElMessage.error('优生数据加载失败')` 并清空 `batches`/`rows` |
| P0-8 | 判定口径落地 | 得分 **≥** 优秀线 = 优生；该科满分 ≤ 0 的批次**跳过判定**（不达优、不未达优、不参与三态判定） |
| P0-9 | 复用 `/analysis/classes` | **不新增班级接口**；班级按钮组、默认选中第一个班级、切换即刷新，与基线页完全一致 |
| P0-10 | 零硬编码 | 班级列表、批次名/日期/满分、优秀线、优秀率、学生名单全部来自接口；前端常量仅保留「可选项定义」（`SUBJECT_OPTIONS` / `RATIO_OPTIONS`），不含任何具体班级/批次/分数线 |

### P1（重要，建议同批交付）

| 编号 | 需求 | 说明 / 验收标准 |
| --- | --- | --- |
| P1-1 | 单元格三态判定 | `stable`（持续优秀 ✓）/ `new`（本次新进 ↗）/ `dropped`（后续掉出 ↓），优先级与定义见 §五.5 |
| P1-2 | 单元格名单排序 | 按分数**降序**（高分更突出），同分按姓名 `localeCompare(zh-Hans-CN)` 升序 —— 与基线页「升序（低分更需要关注）」严格镜像 |
| P1-3 | 空列占位 | 该批次无优生时，仅首行显示 `暂无优秀学生`（`.cell-placeholder`） |
| P1-4 | 参数宽容回退 | `subject` 非法 → 回退 `total`；`ratio` 非数字 / ≤0 / >100 → 回退 `80`；不报错 |
| P1-5 | 响应式一致 | `header-row` 的 `flex-wrap: wrap`；`matrix-panel { flex:1; min-width:0 }` + `summary-panel { width:240px; flex-shrink:0 }`；表头 `word-break: break-word` 允许批次名折行 |

### P2（可延后打磨）

| 编号 | 需求 | 说明 |
| --- | --- | --- |
| P2-1 | 「连续优秀次数」维度 | 在优秀次数之外统计最长连续达优批次数，右侧可切换指标 |
| P2-2 | 悬浮迷你趋势 | 单元格 `title` 外，悬浮展示该生历次得分折线（需引入图表，评估成本） |
| P2-3 | 导出优生名单 | 与「学生成绩记录」页导出能力对齐 |
| P2-4 | 与「进步学生画像」联动 | 从优生名单跳转至该生画像页 |

---

## 四、UI 设计说明（与不及格页一一对应）

### 4.1 布局骨架

```
el-card.page-card (shadow="never")
├─ .header-row                          [flex, align-center, gap:20px, wrap]
│   ├─ .page-title                      el-icon(Medal) + "优生管理"
│   ├─ .filter-group                    [flex, gap:12px]
│   │   ├─ el-select「优秀类别：X」       w=185px
│   │   └─ el-select「比例：X%」          w=175px
│   └─ el-radio-group.class-group       班级按钮组（v-if="classes.length"）
├─ .board-wrap  (v-if="!loading && batches.length")   [flex, gap:16px, align-start]
│   ├─ .matrix-panel   [flex:1, min-width:0]  el-table(border, max-height=600)
│   │   ├─ 列①：序号列 width=80（四行表头占位 + 序号）
│   │   └─ 列②..N：批次列 width=110, class-name="batch-col"
│   └─ .summary-panel  [240px, flex-shrink:0]
│       ├─ .summary-title   「{{班级}}（共{{N}}人）」
│       └─ el-table(size=small, border, max-height=600)  姓名 / 优秀次数
├─ .legend  (v-if="!loading && hasExcellentData")         三态图例
└─ el-empty (v-if="!loading && (!classes.length || !batches.length)")
```

### 4.2 元素对照表

| 元素 | 不及格页（基线） | 优生页（本需求） | 差异说明 |
| --- | --- | --- | --- |
| 卡片 | `el-card.page-card shadow="never"` | 完全相同 | 无 |
| 标题图标 | `<WarningFilled />` | `<Medal />` | 语义正向（沿用当前占位页图标） |
| 标题文案 | 不及格管理 | 优生管理 | 无 |
| 下拉① | `不及格类别：总成绩`（label 前缀拼接） | `优秀类别：总成绩` | 仅前缀文案；`SUBJECT_OPTIONS` 六项复用 |
| 下拉② | `比例：60%`（60/70/80，默认 60） | `比例：80%`（**80/85/90，默认 80**） | 见 §五.2 |
| 班级按钮组 | `el-radio-group` + `el-radio-button` | 完全相同 | 数据源同样为 `/analysis/classes` |
| 主体容器 | `.board-wrap`（v-if 同款） | 完全相同 | 无 |
| 序号列 | width=80，四行表头（占位×3 + 序号） | 完全相同 | 含 `hasDateRow` 条件行 |
| 批次列 | width=110，`class-name="batch-col"` | 完全相同 | 含 `:deep(.batch-col .cell)` 内边距压缩 |
| 表头第 1 行 | 批次名 | 批次名 | 无 |
| 表头第 2 行 | `（时间：26.9.3）` | 完全相同 | `hasDateRow` 统一控制显隐 |
| 表头第 3 行 | `66.13%（20）`= 不及格率（满分） | `32.26%（20）`= **优秀率**（满分） | 分子改为达优人数；满分缺失/≤0 时省略括号 |
| 表头第 4 行 | 场次编号 `i+1` | 完全相同 | 无 |
| 单元格 | `.stu-cell` 姓名 + `.stu-meta` 分数 + `.stu-arrow` | 结构相同，箭头语义改为三态 | 见 §五.5 |
| 单元格 title | `姓名 X 分（满分 Y，及格 Z）[订正/后及格]` | `姓名 X 分（满分 Y，优秀 Z）[持续优秀/本次新进/后续掉出]` | 线名改为「优秀」 |
| 右汇总标题 | `{{班级}}（共{{N}}人）` | 完全相同 | `summary.classStudentCount` |
| 右汇总列 | 不及格次数（width=96） | **优秀次数**（width=96） | 见 §五.4 配色反转 |
| 图例 | 未处理 / 已订正通过 / 后续已及格 | **持续优秀 / 本次新进 / 后续掉出** | 见 §五.5 |
| 空状态 | `el-empty`，v-if 同款 | 完全相同 + 三档文案 | 见 §五.6 |

### 4.3 交互流程（与基线页逐条一致）

| 步骤 | 行为 |
| --- | --- |
| 1 | `onMounted` → `fetchClasses()`；`classes.length` 时默认选中 `classes[0]` 并 `fetchMatrix()` |
| 2 | 切换「优秀类别」或「比例」→ `handleFilterChange()` → 按当前班级 + 新口径重取矩阵 |
| 3 | 切换班级 → `handleClassChange()` → `fetchMatrix()` |
| 4 | `loading` 期间隐藏 `board-wrap`/图例/空状态（v-if 判定与基线页一致） |

---

## 五、数据口径定义

### 5.1 优秀线公式（决策点 ①）

```
优秀线 excellentLine = ROUND(该科满分 × 优秀比例 / 100, 2)
判定：得分 ≥ excellentLine  →  该生该批次「达优」
```

与不及格判定（`得分 < passLine` → 不及格）**严格镜像**：方向相反、边界对称（等于线时：及格侧归为「及格」，优秀侧归为「达优」）。

- 实现：`computedExcellentLine(subjectFull, ratio)`，与 `computedPassLine` 同公式、独立命名导出。
- **优秀比例与 `paper_batches.pass_ratio` 无关**：`pass_ratio` 是「及格占比」的落库配置，本页的比例是用户当次选择的查询参数，**运行时计算优秀线、不落库、不修改 `paper_batches` 表**。
- 单科口径取该科满分（`choice_full`/`spreadsheet_full`/`access_full`/`python_full`/`composite_full`），总成绩口径取 `total_full`；映射表直接复用 `SUBJECTS`（`scoreKey` / `fullKey`）。

### 5.2 比例档位（决策点 ②）

| 档位 | 说明 |
| --- | --- |
| 80%（**默认**） | 最常用的「优良」口径，优生面最大，保证首次进入页面有数据 |
| 85% | 收紧一档 |
| 90% | 「优秀」严格口径，锁定尖子 |

**选 80/85/90 的理由**：
1. 与不及格页在同一数值带上连续，共用 **80** 这个锚点（80% 既是「最严及格线」也是「最宽优秀线」），教师心智一致；
2. 默认值语义与基线页对称——基线页默认 60 是**最宽松**的一档（及格最容易），优生页默认 80 同样是**最宽松**的一档（达优最容易、优生最多），**默认都取「结果集最大」的一档**，避免首屏空白；
3. 比例升高 → 优秀线升高 → 优生变少（严格度方向与及格线一致：都是「线越高越严」），不会造成方向困惑。

### 5.3 排序规则

| 对象 | 规则 |
| --- | --- |
| 批次（列） | `created_at`（众数派生）→ 最早交卷日期 → 批号兜底，**日期升序**（与基线页完全一致） |
| 列内优生名单 | 分数**降序**，同分按姓名 `localeCompare(zh-Hans-CN)` 升序 |
| 右侧汇总名单 | 优秀次数**降序**，同次数按姓名升序（**含 0 次学生，排在最后**） |

### 5.4 右侧「优秀次数」列与配色（决策点 ③）

列名由「不及格次数」镜像为 **「优秀次数」**（后端字段 `excellentCount`），列宽 96 / 居中 / `el-tag size="small"` 与基线页一致。

| 优秀次数 | el-tag type | 视觉 | 语义（反转后） |
| --- | --- | --- | --- |
| ≥ 2 | `success`（绿） | 绿 | 多次达优 = 稳定优生（**正向**，替代基线页的 `danger`） |
| = 1 | `warning`（橙） | 橙 | 偶发达优，需观察是否可持续 |
| = 0 | `info`（灰） | 灰 | 从未达优 |

**配色映射原则**：仅把顶档 `danger` ↔ `success` 互换（次数多 = 好），`warning` / `info` 两档保持原位不变 —— 三档结构与基线页完全对称，改动最小、视觉调性一致。

### 5.5 矩阵单元格三态标记（决策点 ④）

**明确不照搬订正逻辑**：`correction_*` 系列字段语义是「不及格后二次订正」，对优生不适用；本页**不读取任何订正分**。
替代方案：以**批次时间序上的前后对比**刻画优生稳定性（同样产出「一个箭头」的紧凑表现，与基线页视觉对齐）。

| status | 文案 | 箭头 | 判定（基于该生当前口径的全部记录，按时间序） | 箭头色 |
| --- | --- | --- | --- | --- |
| `stable` | 持续优秀 | `✓` | 存在**更早**批次的达优记录（即非首次达优） | `#529b2e`（绿，复用 `.mark-corrected`） |
| `new` | 本次新进优秀 | `↗` | 该批次为该生**首次**达优（更早批次均无达优） | `#409eff`（蓝，新增） |
| `dropped` | 后续掉出优秀 | `↓` | **更晚**批次中再无达优记录 | `#b88230`（橙，复用 `.mark-later`） |

- **互斥优先级：`dropped` ↓ > `new` ↗ > `stable` ✓**。
  理由：与基线页 `corrected > laterPass > fail` 同为「最需教师干预的信号优先」；且单元格 110px 只容纳一个箭头。
  丢失的次态在 `title` 中补全（例：`张三 88.5 分（满分 100，优秀 80）首次达优，后续掉出`）。
- 只有一批次、或该批次为最后一批次时：无「更晚批次」可判 → 不产生 `dropped`，按 `stable`/`new` 判定。
- **未配置批次（该科满分 ≤ 0）的记录不参与任何状态判定**（`passed = null`），与基线页一致。
- 图例（`.legend`，三项）：

| 图例项 | dot 类名 | 底色 / 边框 |
| --- | --- | --- |
| 持续优秀 | `.dot-stable` | `#e1f3d8` / `#67c23a`（绿，复用 `.dot-corrected`） |
| 本次新进优秀 | `.dot-new` | `#d9ecff` / `#409eff`（蓝，新增） |
| 后续掉出优秀 | `.dot-dropped` | `#fdf6ec` / `#e6a23c`（橙，复用 `.dot-later`） |

### 5.6 空状态与边界（决策点 ⑤、⑥ + 零记录边界）

`el-empty` 的 `v-if` 与基线页**保持一致**：`!loading && (!classes.length || !batches.length)`。

| # | 场景 | 表现 | 文案 |
| --- | --- | --- | --- |
| B1 | 无任何班级数据 | `el-empty` | `暂无成绩数据，请先在「学生成绩记录」中导入成绩` |
| B2 | 该班无任何考试批次 | `el-empty` | `「{{班级}}」暂无考试批次数据` |
| B3 | 有批次但**无人达优** | **正常渲染**矩阵与右侧全量名单（0 次 info 标签），不显示 `el-empty`；每列首行显示 `暂无优秀学生`；图例隐藏（`hasExcellentData = false`） | 兜底文案 `「{{班级}}」暂无优秀记录` 保留于 `emptyText` 计算中（与基线页同，实际不触发） |
| B4 | 某批次该科满分未配置（≤0） | 该列 `configured=false`：不判达优、优秀率 0%、表头第三行**省略括号满分**、该批次记录不参与三态判定 | — |
| B5 | `subject` 非法 | 回退 `total`（响应体回显实际口径） | — |
| B6 | `ratio` 非法 / ≤0 / >100 | 回退 `80`（响应体回显实际比例） | — |
| B7 | 班级参数缺失 | 后端 `400 { code:400, message:'班级参数不能为空' }`；前端 `ElMessage.error` | — |
| B8 | 同名学生 | 按 `name` 归集（与基线页一致，不做 `examNo` 去重） | — |

**关键边界说明**：B3 与基线页行为**必须一致**——无人达优时仍然展示「全班名单 + 全 0 次」，而非空白页；这是两页体验一致性的核心。

### 5.7 接口契约

**复用**：`GET /api/analysis/classes`（不新增班级接口，返回 `classes` 与各班 `stats`，优生页仅取 `classes`）。

**新增**：`GET /api/analysis/top-students`

| 项 | 内容 |
| --- | --- |
| Query | `class`（必填）、`subject`（total/choice/spreadsheet/access/python/composite，默认 total）、`ratio`（0<x≤100，默认 80） |
| 复用实现 | `getBatchesOfClass` / `getScoresOfClass` 预编译语句、`SUBJECTS` 映射、`compareClass`、批次升序排序、`orderOf` 序号映射 —— 与 `/failures` 同源 |
| 响应 `data` | `clazz`、`subject`、`subjectLabel`、`ratio`、`batches[]`、`rows[]`、`summary{}` |
| `batches[]` | `batchNo`、`batchName`、`totalFull`、`subjectFull`、`excellentLine`、`configured`、`examDate`、`studentCount`、`excellentCount`、`excellentRate`（保留 2 位小数）、`students[]` |
| `batches[].students[]` | `name`、`examNo`、`score`、`status`（`stable`/`new`/`dropped`） |
| `rows[]` | `name`、`examNo`、`excellentCount`、`stableCount`、`newCount`、`droppedCount`、`cells{ batchNo: { score, excellentLine, status } }` |
| `summary` | `batchCount`、`excellentStudentCount`（达优≥1 次的人数）、`zeroExcellentCount`、`totalExcellentRecords`、`classStudentCount` |

---

## 六、待确认问题

| # | 问题 | 建议 | 影响 |
| --- | --- | --- | --- |
| Q1 | 优秀比例档位 80/85/90 是否确认？ | 确认 80/85/90、默认 80 | 若改为 85/90/95，默认档可能首屏为空 |
| Q2 | 优秀线是否可复用 `paper_batches.pass_ratio` 配置？ | **不复用**：比例为用户查询参数，运行时计算、不落库 | 决定是否需要新增 `excellent_ratio` 数据列（当前方案**不需要改表**） |
| Q3 | 三态优先级 `dropped > new > stable` 是否确认？ | 确认（干预信号优先），次态在 `title` 补全 | 若需同时显示两个箭头，单元格需加宽，破坏与基线页一致 |
| Q4 | 「持续优秀」是否显示 `✓`？ | 显示 —— 否则图例首项在单元格中无对应可见标记 | 若去掉，图例需改为两项 |
| Q5 | 优秀 1 次的标签是否用 `warning`（橙）？ | 用 `warning`（与基线页同档位），备选 `primary`（蓝） | 仅配色语义，不影响数据 |
| Q6 | 是否需要「连续优秀次数」维度？ | 列为 P2，本期不做 | 影响 `rows[]` 字段与右汇总列数 |

---

## 附：与现有代码映射（实现参考）

| 目标 | 现有基线 |
| --- | --- |
| 页面组件 | `web/src/views/analysis/AnalysisFailures.vue`（模板 1-135、脚本 137-318、样式 320-505，逐段对照迁移） |
| 后端路由 | `server/src/routes/analysis.js`：`getBatchesOfClass`(70-87)、`getScoresOfClass`(90-96)、`SUBJECTS`(103-110)、`/failures`(123-282) |
| 满分/判定线 | `server/src/utils/paperBatch.js`：`computedPassLine`(7-11) → 新增 `computedExcellentLine` |
| 前端 api | `web/src/api/analysis.js`：`getFailureMatrix`(8-9) → 新增 `getTopStudentMatrix` |
| 数据表 | `server/src/db.js`：`scores`（choice/spreadsheet/access/python/composite/total、correction_*）、`paper_batches`（各分项 `_full`、`total_full`、`pass_ratio`） |
