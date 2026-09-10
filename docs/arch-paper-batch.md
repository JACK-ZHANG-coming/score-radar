# 试卷批次管理 · 系统架构设计 + 任务分解

> 文档性质：增量架构设计（基于已通过的 PRD：`docs/prd-paper-batch.md`）
> 作者：高见远（架构师） ｜ 协调：齐活林（交付总监）
> 技术栈：后端 Express + better-sqlite3 + JWT（沿用）；前端 Vue 3 `<script setup>` + Element Plus（沿用）
> 语言：简体中文
> 设计铁律：**最小侵入** —— 不改动 students 体系、不动 login/auth、不重构无关代码；所有列表接口排序白名单、分页钳制、409 duplicate 结构与现有 `scores.js` 完全一致；Excel 导入沿用「预扫描 409 + 确认覆盖」模式。

---

## 一、总体方案与模块划分

### 1.1 改造基线（精读结论）

| 文件 | 角色 | 复用要点 |
| --- | --- | --- |
| `server/src/db.js` | 建表/迁移 | `CREATE TABLE IF NOT EXISTS` + `pragma_table_info` 检查列 + `ALTER` 追加 + `CREATE INDEX IF NOT EXISTS` |
| `server/src/routes/scores.js` | 成绩路由（改造基类） | `SORTABLE` 白名单、`Math.min/Math.max` 分页钳制、`{code,message,data}` 错误结构、`batch-nos` 下拉、`POST /` + `POST /import` 的 `ensurePaperBatch` 注入点、`409 duplicate` 预扫描流 |
| `server/src/utils/excel.js` | Excel 工具 | `SCORE_HEADERS`/`STUDENT_HEADERS`/`buildTemplate`/`parseSheet`/`missingHeaders`/`normalizeTime`/`toNum`/`toStr`/`fixEncoding` |
| `server/src/index.js` | 路由挂载 | `app.use('/api/xxx', router)` 范式 |
| `web/src/views/ScoreList.vue` | 成绩页（改造基类） | `COLUMN_DEFS` + `localStorage` 列设置、`fetchBatchNos` 班级级联、`handleImport` 409 二次确认流、`handleSave`、`SORT_FIELDS` 远程排序映射、total 着色 |
| `web/src/views/StudentList.vue` | 干净 CRUD 范式 | 新增/编辑弹窗、导入/导出弹窗、列设置 |
| `web/src/api/scores.js` `students.js` | API 封装 | 请求/响应拦截（`request.js` 统一 409 去重不弹窗） |
| `web/src/router/index.js` `web/src/views/Layout.vue` | 路由/菜单 | 子路由 + `menus` 数组 |

### 1.2 模块划分（新增/改造清单）

| # | 类型 | 文件 | 职责 |
| --- | --- | --- | --- |
| M1 | 新增 | `server/src/utils/paperBatch.js` | `ensurePaperBatch(batch_no)` helper + `PAPER_BATCH_HEADERS` 常量导出（或常量并入 `excel.js`，见 §10）；`computedPassLine` 纯函数 |
| M2 | 新增 | `server/src/routes/paper-batches.js` | 8 类新接口（见 §4） |
| M3 | 改造 | `server/src/db.js` | 追加 `paper_batches` 建表 + 索引（见 §2） |
| M4 | 改造 | `server/src/routes/scores.js` | 三处改造（见 §5）：`batch-nos` 合并、`POST /` 与 `POST /import` 注入 `ensurePaperBatch`、`PUT` 保持幂等 |
| M5 | 新增 | `web/src/api/paper-batches.js` | 8 接口对应前端 API 封装 |
| M6 | 新增 | `web/src/views/PaperBatchList.vue` | 试卷批次管理页（4 区布局，见 §6） |
| M7 | 改造 | `web/src/views/ScoreList.vue` | 合格状态列 + total 着色改造 + 下拉结构变更 + 导入/保存校验接入（见 §7） |
| M8 | 改造 | `web/src/router/index.js` | 新增 `/paperBatch` 子路由（顺序：scores → paperBatch → students） |
| M9 | 改造 | `web/src/views/Layout.vue` | `menus` 数组插入「试卷批次管理」项（`/paperBatch`，icon `Files`/`Notebook`） |
| M10 | 改造 | `server/src/utils/excel.js` | 追加 `PAPER_BATCH_HEADERS` 常量（仅一行，零逻辑改动） |

> 路由挂载：在 `index.js` 第 22 行 `app.use('/api/scores', scoreRoutes)` 之后新增 `const paperBatchRoutes = require('./routes/paper-batches'); app.use('/api/paper-batches', paperBatchRoutes);`
> `paperBatch.js` helper 被 `routes/paper-batches.js` 与 `routes/scores.js` 共同引用，避免逻辑重复。

---

## 二、paper_batches 完整 DDL

遵循 `db.js` 范式：首次启动 `CREATE TABLE IF NOT EXISTS` 建表；**不**做 `ALTER` 追加（`paper_batches` 为全新表，直接一次性建全字段）。

```sql
CREATE TABLE IF NOT EXISTS paper_batches (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_no        TEXT NOT NULL UNIQUE,            -- 试卷批号，唯一标识，关联 scores.batch_no
  batch_name      TEXT NOT NULL DEFAULT '',        -- 试卷批次名称（必存，见 Q1 默认可见列）
  choice_full     REAL NOT NULL DEFAULT 0,         -- 选择题满分 ≥0
  spreadsheet_full REAL NOT NULL DEFAULT 0,        -- 电子表格满分 ≥0
  access_full     REAL NOT NULL DEFAULT 0,         -- Access 满分 ≥0
  python_full     REAL NOT NULL DEFAULT 0,         -- Python 满分 ≥0
  composite_full  REAL NOT NULL DEFAULT 0,         -- 综合题满分 ≥0
  total_full      REAL NOT NULL DEFAULT 0,         -- 试卷总满分 ≥0，= 五项分项之和
  pass_ratio      REAL NOT NULL DEFAULT 60,        -- 默认合格占比 0~100
  remark          TEXT NOT NULL DEFAULT '',        -- 备注
  created_at      TEXT NOT NULL DEFAULT '',        -- YYYY-MM-DD，派生（见 §3，不手工写入）
  updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_batches_batch_no ON paper_batches(batch_no);
CREATE INDEX IF NOT EXISTS idx_paper_batches_name ON paper_batches(batch_name);
```

### 2.1 created_at / updated_at 语义

- **`updated_at`**：每次 `INSERT`/`UPDATE` 落 `datetime('now','localtime')`（与 `users`/`students`/`scores` 一致）。
- **`created_at`**：**派生字段，不随表单写入**。语义 = 「该批号下 `scores.submit_time` 出现最多的日期（众数），格式 `YYYY-MM-DD`」；若该批号在 `scores` 中无任何成绩记录，则取当天 `date('now','localtime')`（占位行即此场景）。
- **不在 DDL 设默认值为 `datetime()`**：因为众数派生依赖业务数据，必须在 `ensurePaperBatch` / 列表查询时计算。DDL 仅给 `''` 默认值占位，真实值由 §3 SQL 填充。

### 2.2 created_at 实现思路（列表查询侧派生，不落库）

列表查询（`GET /api/paper-batches`）与 `by-no` 接口返回 `created_at` 时，统一用视图式派生：

```sql
-- 取某 batch_no 的 submit_time 日期众数
SELECT substr(submit_time, 1, 10) AS d, COUNT(*) AS c
FROM scores
WHERE batch_no = ? AND submit_time != ''
GROUP BY d
ORDER BY c DESC, d ASC
LIMIT 1;
-- 若返回空（无成绩）→ created_at = date('now','localtime')
```

> 用 `substr(submit_time,1,10)` 取 `YYYY-MM-DD HH:mm` 的前 10 位等价于 `date(submit_time)`；`submit_time` 在 `scores` 中统一规范为 `YYYY-MM-DD HH:mm`（`normalizeTime` 保证），故前缀截取稳定可靠。`ORDER BY c DESC, d ASC` 保证众数并列时取较早日期，结果确定。
> 列表接口对每行执行一次该查询（或在 SQL 层用子查询 `LEFT JOIN` 一次性带出），性能可接受（批号量级小）。

---

## 三、ensurePaperBatch(batch_no) 完整设计

### 3.1 触发点

| 触发位置 | 调用时机 | 备注 |
| --- | --- | --- |
| `POST /api/scores`（scores.js 改造） | 单条写入/覆盖成功后 | 用请求体 `batch_no` |
| `POST /api/scores/import`（scores.js 改造） | 在 `db.transaction` 的逐行循环内，对每行 `batch_no` 调用 | **必须在事务内**，保证占位行与成绩原子性；同一批号多次调用靠幂等 `WHERE NOT EXISTS` 去重 |
| `ensurePaperBatch` 实现位置 | `server/src/utils/paperBatch.js` | 导出供 scores.js 与 paper-batches.js 共用 |

> `PUT /api/scores/:id` **不**调用 `ensurePaperBatch`：编辑既有成绩时批号必然已存在（或沿用旧批号），无需补占位；保持幂等即可（见 §5.3）。

### 3.2 占位行字段值

| 字段 | 占位值 | 说明 |
| --- | --- | --- |
| `batch_no` | 传入值 | 来自成绩记录 |
| `batch_name` | 复用 `batch_no` 作为占位名 | 占位行无用户填写名称，以批号本身兜底（用户后续可在批次页编辑补全，见 Q1） |
| `choice_full`~`composite_full` | `0` | 占位未配置 |
| `total_full` | `0` | 标记「未配置」（Q2 生效条件 = `total_full > 0`） |
| `pass_ratio` | `60` | 默认占比 |
| `remark` | `''` | — |
| `created_at` | 派生：有成绩取众数，无则 `date('now','localtime')` | 见 §2.2 |
| `updated_at` | `datetime('now','localtime')` | — |

### 3.3 幂等性

使用 `INSERT ... SELECT ... WHERE NOT EXISTS`，整条为单条 SQL，天然幂等：

```sql
INSERT INTO paper_batches (batch_no, batch_name, choice_full, spreadsheet_full,
  access_full, python_full, composite_full, total_full, pass_ratio, remark, created_at, updated_at)
SELECT
  @batch_no,
  @batch_no,            -- 占位名兜底
  0, 0, 0, 0, 0,        -- 五项分项满分占位 0
  0,                    -- total_full 占位 0（未配置标记）
  60,                   -- pass_ratio 默认 60
  '',
  COALESCE(
    (SELECT substr(submit_time,1,10)
     FROM scores WHERE batch_no = @batch_no AND submit_time != ''
     GROUP BY substr(submit_time,1,10)
     ORDER BY COUNT(*) DESC, substr(submit_time,1,10) ASC LIMIT 1),
    date('now','localtime')
  ),
  datetime('now','localtime')
WHERE NOT EXISTS (SELECT 1 FROM paper_batches WHERE batch_no = @batch_no);
```

> 重复调用：第二次 `NOT EXISTS` 为假，整条不插入，零副作用。后端静默执行（Q10），不向前端返回任何中间状态。

### 3.4 created_at 派生 SQL（占位场景）

占位行 `created_at` 走 §3.3 中 `COALESCE(子查询, date('now','localtime'))`：若 `scores` 中该批号已有成绩，取日期众数；若无成绩（纯占位），取当天。与 §2.2 列表侧派生口径一致。

---

## 四、8 类新接口逐个草案

> 通用约定：所有接口 `authRequired`；响应 `{code:0, data:{...}}`，错误 `HTTP 状态码 + {code,message,data}`；分页 `page` 默认 1、`pageSize` 默认 25、上限 500、越界钳制、响应含 `totalPages`（照搬 scores.js 第 70-78 行范式）。

### 4.1 排序字段白名单映射表（SORTABLE）

```js
const SORTABLE = {
  batchNo: 'batch_no',
  batchName: 'batch_name',
  choiceFull: 'choice_full',
  spreadsheetFull: 'spreadsheet_full',
  accessFull: 'access_full',
  pythonFull: 'python_full',
  compositeFull: 'composite_full',
  totalFull: 'total_full',
  passRatio: 'pass_ratio',
  createdAt: 'created_at',
};
// ORDER BY 拼接同 scores.js：if (sortField && SORTABLE[sortField]) ORDER BY ${SORTABLE[sortField]} ${dir}, id ASC
```

### 4.2 接口 1：GET /api/paper-batches（查询+分页+排序）

- **入参**：`name`(batch_name 模糊)、`batchNo`(模糊)、`page`、`pageSize`、`sortField`、`sortOrder`。
- **SQL**：
  ```sql
  SELECT * FROM paper_batches
  WHERE (batch_name LIKE ? OR ?='') AND (batch_no LIKE ? OR ?='')
  ORDER BY ${SORTABLE[sortField]||'id'} ${dir}, id ASC
  LIMIT ? OFFSET ?
  ```
  （两个模糊条件用 `OR ?=''` 技巧合并，参数各两份；或按 scores.js 风格用 `where.push` 数组拼接，二选一，推荐后者更清晰）。
- **响应**：`{list, total, page, pageSize, totalPages}`，**list 每项附加派生 `passLine = ROUND(total_full*pass_ratio/100, 2)`**（Q8 读取时计算，不落库）；`created_at` 按 §2.2 派生。

### 4.3 接口 2：POST /api/paper-batches（新增）

- **入参 body**：`batch_no, batch_name, choice_full, spreadsheet_full, access_full, python_full, composite_full, total_full, pass_ratio, remark`。
- **5 条校验后端实现次序**（与前端一致，先快后慢）：
  1. **① 必填**：`batch_no/batch_name/total_full` 非空字符串/数字、`choice_full`~`composite_full`、`pass_ratio` 均存在 → 否则 `400 '必填项不能为空'`。
  2. **② 非负**：五项分项与 `total_full`、`pass_ratio` 均 `>= 0` → 否则 `400 '分数不能为负数'`。
  3. **③ 分项之和=总满分**：`choice+spreadsheet+access+python+composite === total_full`（注意浮点：用 `Math.abs(sum-total) < 1e-9`）→ 否则 `400 '分项分数总和和总满分不一致，请核对！'`。
  4. **④ 占比 0~100**：`pass_ratio >= 0 && <= 100` → 否则 `400 '合格占比需在 0~100 之间'`。
  5. **⑤ 批号唯一**：`SELECT id FROM paper_batches WHERE batch_no = ?` → 若命中返回 **`409 duplicate`**（结构 `{code:409, message:'试卷批号已存在', data:{duplicate:true}}`，复用 scores 去重结构）。
- **写入**：`INSERT` 后 `SELECT *` 回填，`passLine` 一并算回。`created_at` 占位取 `date('now','localtime')`（新增时通常无成绩）。

### 4.4 接口 3：PUT /api/paper-batches/:id（编辑）

- 先 `SELECT` 校验 `id` 存在 → `404 '试卷批次不存在'`。
- 校验次序同 §4.3 ①②③④；**⑤ 改为排除自身查重**：`WHERE batch_no = ? AND id != ?` → `409 duplicate`。
- `UPDATE ... SET ..., updated_at=datetime('now','localtime') WHERE id=?`。**不更新 `created_at`**（派生只读）。

### 4.5 接口 4：DELETE /api/paper-batches/:id（单删）

```sql
SELECT COUNT(*) AS c FROM scores WHERE batch_no = (SELECT batch_no FROM paper_batches WHERE id = ?)
```
- 关联成绩 `c > 0` → **`409`**：`{code:409, message:'该试卷批次下存在学生成绩，无法删除，请先删除关联成绩数据！', data:{blocked:[batch_no]}}`（P0-11）。
- 否则 `DELETE`；`changes===0` → `404`。

### 4.6 接口 5：DELETE /api/paper-batches/batch（批删，注册在 `:id` 之前）

- **入参 body**：`{ ids: number[] }`。
- 空/非数组 → `400 '请先选择要删除的记录'`；清洗无效 ID → `400 '无效的记录 ID'`（照搬 scores 批删）。
- **整体关联检查**（Q6 整体拒绝）：
  ```sql
  SELECT DISTINCT pb.batch_no
  FROM paper_batches pb
  JOIN scores s ON s.batch_no = pb.batch_no
  WHERE pb.id IN (?,?,...)
  ```
  若结果非空 → **`409`**：`{code:409, message:'存在关联学生成绩的试卷批次，无法批量删除', data:{blocked:['批号A','批号B'...]}}`，**不执行任何删除**。
- 全部无关联 → `db.transaction` 内 `DELETE FROM paper_batches WHERE id IN (...)`，返回 `{deleted}`。

### 4.7 接口 6：POST /api/paper-batches/import（Excel 批量导入）

- `upload.single('file')` + 可选 `batchNo`（沿用成绩导入「手填批号优先、否则文件名」逻辑）。
- **表头校验**：`missingHeaders(Object.keys(rows[0]), PAPER_BATCH_HEADERS)` → 缺列 `400`（P2-1 复用 `fixEncoding`/`parseSheet`）。
- **预扫描 + 逐行错误收集**（复用 scores 导入事务范式）：
  - 预扫描统计 `batch_no` 在 `paper_batches` 已存在 / 文件内重复行数 → `conflictCount > 0 && !overwrite` → `409 {duplicate:true, conflictCount}`（前端一次确认覆盖）。
  - 确认覆盖（`overwrite=true`）或本无冲突 → `db.transaction` 逐行：
    - 解析 13 列（序号/试卷批号/试卷批次名称/选择题满分/电子表格满分/Access满分/Python满分/综合题满分/试卷总满分/默认合格占比(%)/计算得出合格线/备注/创建时间）。
    - **忽略只读列**：「计算得出合格线」「创建时间」导入时丢弃，服务端按规则重算/派生（Q5）。
    - 每行执行 ①~④ 校验（同 §4.3）+ ⑤ 批号唯一（已存在则覆盖更新，不新增重复批号）；不合法行 `errors.push('第 N 行：…')` 并跳过。
    - 已存在批号 → `UPDATE`，新批号 → `INSERT`（`created_at` 派生）。
  - 返回 `{inserted, updated, errors[]}`（同 scores 导入响应结构）。

### 4.8 接口 7：GET /api/paper-batches/export（导出当前筛选全集）

- **入参**：同查询筛选参数（`name/batchNo`），**不含分页**（拉全量）。
- 实现复用 `excel.js` 的 `XLSX` 引擎：`XLSX.utils.aoa_to_sheet([PAPER_BATCH_HEADERS, ...dataRows])`（`buildTemplate` 内部即用此引擎，导出为全量多行版；`PAPER_BATCH_HEADERS` 见 §10）。
- `dataRows` 按 `PAPER_BATCH_HEADERS` 列序映射：`序号`(自增序号)、`试卷批号`、`试卷批次名称`、各分项、`试卷总满分`、`默认合格占比(%)`、`计算得出合格线`(=ROUND)、`备注`、`创建时间`(派生)。
- 响应头：`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`，`Content-Disposition: attachment; filename=paper-batches-export.xlsx`。

### 4.9 接口 8：GET /api/paper-batches/by-no/:batchNo（成绩页联动取配置）

- **响应**（成绩页联动用，见 §6.1）：
  ```json
  { "code":0, "data": {
    "batchNo":"...", "totalFull":100, "choiceFull":20, "spreadsheetFull":20,
    "accessFull":20, "pythonFull":20, "compositeFull":20,
    "passRatio":60, "passLine":60.0, "configured": true
  }}
  ```
- `configured = totalFull > 0`（Q2 生效标志，前端据此决定是否校验/着色）。
- **404 语义**：`WHERE batch_no = ?` 无记录 → `404 {code:404, message:'未找到该试卷批号配置'}`（含成绩侧 `ensurePaperBatch` 补出的占位行也会命中；若连占位行都没有——理论不该发生——同样 404，前端回退阈值 60）。

---

## 五、scores.js 现有接口的三处改造点（精确 diff 描述）

### 5.1 改造 A：GET /batch-nos 合并数据源（Q7）

**改造前**（scores.js 第 91-102 行）：仅查 `scores` 按 class 过滤。
**改造后**：

```js
const { ensurePaperBatch } = require('../utils/paperBatch'); // 顶部引入（仅本文件用不到 ensure，但同文件引入保持整洁；实际只在 POST 用）
// 顶部另引入 batch 配置查询 helper，用于构造响应项
const getPbConfig = db.prepare('SELECT batch_no, batch_name, total_full, pass_ratio FROM paper_batches WHERE batch_no = ?');

router.get('/batch-nos', authRequired, (req, res) => {
  const clazz = toStr(req.query.class);
  // 1) 来自 scores（按 class 过滤）
  let scoreRows;
  if (clazz) {
    scoreRows = db.prepare(
      "SELECT DISTINCT batch_no FROM scores WHERE batch_no != '' AND class = ?",
    ).all(clazz);
  } else {
    scoreRows = db.prepare("SELECT DISTINCT batch_no FROM scores WHERE batch_no != ''").all();
  }
  // 2) 来自 paper_batches（全量，不受 class 过滤）
  const pbRows = db.prepare("SELECT DISTINCT batch_no FROM paper_batches WHERE batch_no != ''").all();
  // 3) 合并去重，构造响应项 {batchNo,batchName,passLine,totalFull,configured}
  const map = new Map();
  const add = (bn) => {
    if (!bn || map.has(bn)) return;
    const cfg = getPbConfig.get(bn);
    map.set(bn, {
      batchNo: bn,
      batchName: cfg ? cfg.batch_name : '',
      totalFull: cfg ? cfg.total_full : 0,
      passLine: cfg ? Math.round(cfg.total_full * cfg.pass_ratio / 100 * 100) / 100 : 0,
      configured: !!(cfg && cfg.total_full > 0),
    });
  };
  scoreRows.forEach((r) => add(r.batch_no));
  pbRows.forEach((r) => add(r.batch_no));
  // 可选：按 batchNo 排序
  const list = [...map.values()].sort((a, b) => a.batchNo.localeCompare(b.batchNo));
  res.json({ code: 0, data: { batchNos: list } });
});
```

> **前端兼容性影响**：原 `batchNos` 为字符串数组，现改为对象数组。ScoreList.vue 的 `fetchBatchNos` 与下拉 `el-option` 需同步改造（见 §7.2）。`paperBatches` 批号全量纳入、`scores` 批号按 class 过滤（Q7）。

### 5.2 改造 B：POST / 与 POST /import 注入 ensurePaperBatch

**POST /**（scores.js 第 145-180 行）：在「写入/覆盖成功后」追加一行调用：

```js
// 顶部：const { ensurePaperBatch } = require('../utils/paperBatch');
// 在 INSERT 成功 / UPDATE 覆盖成功之后，return res.json 之前：
ensurePaperBatch(s.batch_no);
```

**POST /import**（scores.js 第 309-350 行 `doImport` 事务内）：在逐行 `insert.run(s)` / `update.run({...s, id})` 之后，对每行 `batch_no` 调用：

```js
// 在 list.forEach 内，insert/update 之后：
ensurePaperBatch(batchNo); // batchNo 为当前导入批号（统一批号），事务内幂等
```

> 统一批号场景（导入时 `batchNo` 单一）下，事务内对同一 `batch_no` 多次 `ensurePaperBatch` 因 `NOT EXISTS` 幂等，仅首次有效，零开销。
> **校验接入（P0-9 / Q3）**：在 import 事务的逐行循环内，先 `getPbConfig.get(batchNo)` 取该批号配置；若 `configured`（`total_full>0`），则校验 `row.choice<=choiceFull`、`row.spreadsheet<=spreadsheetFull`、`row.access<=accessFull`、`row.python<=pythonFull`、`row.composite<=compositeFull`、`row.total<=totalFull`（Q3 五项 + 总分）；不合法 → `errors.push('第 N 行分数非法（超出试卷满分配置）')` 并 `return` 跳过（Q2 未配置则跳过校验）。`POST /` 单条新增同理在写入前校验。

### 5.3 改造 C：PUT /:id 保持幂等（无新增逻辑）

- **无需调用 `ensurePaperBatch`**：编辑既有成绩时批号已存在于 `paper_batches`（或沿用旧批号），不存在补占位需求。
- 保持现有「(batch_no, name) 排除自身查重 + overwrite 覆盖」逻辑**完全不变**，满足幂等要求。
- 校验逻辑同 §5.2 的批号配置分数校验（可选，建议对 PUT 也加，口径一致）。

---

## 六、前端 PaperBatchList.vue 组件结构设计

`<script setup>` 组合式，复用 `StudentList.vue` 骨架 + `ScoreList.vue` 的列设置/导入二次确认流。

### 6.1 state 清单（ref/reactive）

| 状态 | 类型 | 说明 |
| --- | --- | --- |
| `loading` | ref(false) | 列表 loading |
| `list` | ref([]) | 表格数据 |
| `total` | ref(0) | 总条数 |
| `query` | reactive({ name:'', batchNo:'' }) | 顶部筛选 |
| `pagination` | reactive({ page:1, pageSize:25 }) | 分页（钳制同 scores） |
| `sort` | reactive({ sortField:'', sortOrder:'' }) | 远程排序 |
| `columnConfig` / `draftColumns` / `columnDialogVisible` | — | 列设置（照搬 ScoreList 的 `loadColumnConfig`/`persistColumnConfig`） |
| `dialogVisible` / `saving` / `editingId` / `formRef` | — | 新增/编辑弹窗 |
| `importVisible` / `importing` / `importFile` / `uploadRef` | — | 导入弹窗 |
| `form` | reactive(emptyForm()) | 弹窗表单 8 主字段 + 占比 + 合格线(只读) + 备注 |

### 6.2 methods 清单

`fetchList` `handleSearch` `handleReset` `handleSizeChange` `handleSortChange` `openDialog` `handleSave`（含 409 duplicate 确认覆盖，照搬 ScoreList 流）`handleDelete` `handleBatchDelete`（含 409 blocked 列表提示）`openImport` `handleImport`（含 409 conflictCount 确认）`handleDownloadTemplate` `exportList` `openColumnDialog` `moveColumn` `applyColumnConfig` `sumOfItems`（computed）`computedPassLine`（computed）`validateSumEqualTotal`（自定义 validator）。

### 6.3 COLUMN_DEFS（含 `batch_name`）

```js
const COLUMN_DEFS = [
  { key: 'batch_no', label: '试卷批号', minWidth: 130, align: 'center', sortable: true },
  { key: 'batch_name', label: '试卷批次名称', minWidth: 140, align: 'center', sortable: true }, // Q1 默认可见
  { key: 'choice_full', label: '选择题满分', width: 100, align: 'center', sortable: true },
  { key: 'spreadsheet_full', label: '电子表格满分', width: 110, align: 'center', sortable: true },
  { key: 'access_full', label: 'Access满分', width: 100, align: 'center', sortable: true },
  { key: 'python_full', label: 'Python满分', width: 100, align: 'center', sortable: true },
  { key: 'composite_full', label: '综合题满分', width: 100, align: 'center', sortable: true },
  { key: 'total_full', label: '试卷总满分', width: 100, align: 'center', sortable: true },
  { key: 'pass_ratio', label: '默认合格占比(%)', width: 120, align: 'center', sortable: true },
  { key: 'pass_line', label: '计算得出合格线', width: 120, align: 'center', sortable: false }, // 只读派生
  { key: 'remark', label: '备注', minWidth: 160, align: 'left', sortable: false },
  { key: 'created_at', label: '创建时间', width: 120, align: 'center', sortable: true }, // 派生 YYYY-MM-DD
];
```
> `pass_line` 列渲染：`row.pass_line`（后端已算）；`created_at` 直接渲染派生字符串。列设置 localStorage key：`'paper-batch-list-columns'`。

### 6.4 弹窗表单结构与联动

**8 主字段 + 占比 + 只读合格线 + 备注**（PRD 4.2 全字段）：

```js
const emptyForm = () => ({
  batch_no: '', batch_name: '', total_full: 0,
  choice_full: 0, spreadsheet_full: 0, access_full: 0, python_full: 0, composite_full: 0,
  pass_ratio: 60, remark: '',
});
```

- **sumOfItems（computed，实时预填总满分）**：
  ```js
  const sumOfItems = computed(() =>
    Number(form.choice_full) + Number(form.spreadsheet_full) + Number(form.access_full)
    + Number(form.python_full) + Number(form.composite_full));
  // watch(sumOfItems, v => { if (editingId 未手动改过 total) form.total_full = v })
  ```
  新增态：用户填完五项分项，`total_full` 自动补为 sum（用户可再手改；手改后停止联动，直到下次重置）。
- **computedPassLine（只读合格线，computed）**：
  ```js
  const computedPassLine = computed(() =>
    Math.round(Number(form.total_full) * Number(form.pass_ratio) / 100 * 100) / 100);
  ```
  模板中以 `el-input`  disabled / `el-tag` 展示 `computedPassLine`。
- **watch**：`watch(sumOfItems, ...)` 实现总满分联动预填（见上）。
- **校验（async-validator 自定义 validator）**：`el-form` 的 `rules` 中使用 `validator` 选项（Element Plus 底层即 async-validator），实现规则③「分项之和≠总满分 → 红字拦截」：
  ```js
  rules.total_full = [
    { required: true, message: '请输入试卷总满分', trigger: 'blur' },
    { validator: (rule, value, cb) =>
        Math.abs(Number(value) - sumOfItems.value) < 1e-9 ? cb() : cb(new Error('分项分数总和和总满分不一致，请核对！')),
      trigger: 'blur' },
  ];
  // 其余规则（必填/非负/占比 0~100/批号唯一）按 §4.3 ①②③④⑤ 映射到 rules
  ```
- **批号唯一 ⑤** 由后端 409 拦截（前端 `handleSave` 捕获 409 `duplicate` → `ElMessageBox.confirm` 提示，与 ScoreList 完全一致）。

---

## 七、ScoreList.vue 改造点清单（精确到现有行号）

> 最小改造，仅联动所需；不动 students/status 语义。

### 7.1 表格「合格状态」列 + total 着色改造（模板 95-133 行附近）

- **新增 COLUMN_DEFS 项**（ScoreList 第 398-414 行 `COLUMN_DEFS` 数组）：
  ```js
  { key: 'pass_status', label: '合格状态', width: 100, align: 'center', sortable: false },
  ```
  `loadColumnConfig`/`STORAGE_KEY='score-list-columns'` 自动兼容（旧用户无此 key → 默认可见）。
- **模板渲染**（第 96-133 行的 `v-for` 内新增分支，在 `col.key==='total'` 之前插入）：
  ```html
  <template v-else-if="col.key === 'pass_status'">
    <!-- configured 为 false（占位未配置）显示灰「—」；否则按 passLine 判定 -->
    <el-tag v-if="!row._configured" type="info" size="small">—</el-tag>
    <el-tag v-else :type="row.total >= row._passLine ? 'success' : 'danger'" size="small">
      {{ row.total >= row._passLine ? '合格' : '不合格' }}
    </el-tag>
  </template>
  ```
- **total 着色改造**（原第 111-115 行硬编码 `>= 60`）：
  ```html
  <span :style="{ fontWeight: 600, color: (row.total||0) >= passLineOf(row) ? '#67c23a' : '#f56c6c' }">
  ```
  其中 `passLineOf(row)` 返回 `row._passLine`（选中批号配置）或回退 `60`（无批号/未配置，Q9）。
- **数据补全**：`fetchList` 拿到 `list` 后，对每行附加 `_passLine` / `_configured`（由 §7.2 当前选中批号配置映射；或逐行调 `by-no`——量大时不建议，统一用当前 `query.batchNo` 配置即可）。

### 7.2 fetchBatchNos 数据结构变更（原第 764-775 行）

- **原**：`batchNos.value = res.data.batchNos || []`（字符串数组）；`el-option :label="b" :value="b"`。
- **改**：`batchNos.value = res.data.batchNos || []`（现为 `{batchNo,batchName,passLine,totalFull,configured}` 数组）；下拉：
  ```html
  <el-option v-for="b in batchNos" :key="b.batchNo"
    :label="b.batchName ? `${b.batchNo}（${b.batchName}）` : b.batchNo" :value="b.batchNo" />
  ```
- **级联清理**（第 769-771 行）改为按 `batchNo` 字段判断：`if (query.batchNo && !batchNos.value.some(b => b.batchNo === query.batchNo)) query.batchNo = '';`
- **新增 `currentBatchConfig` state**：`watch(() => query.batchNo)` 时，从 `batchNos` 找到对应项，缓存 `{passLine, totalFull, configured}` 供 §7.1 着色与 §7.3 校验使用；若未命中则置回退值（passLine=60, configured=false）。

### 7.3 importBatchNo / handleImport 校验接入（原 645-700 行）

- **后端为主**（§5.2）：scores `POST /import` 事务内已按批号配置逐行校验，返回 `errors[]`；前端 `handleImport` 的 `res.message` 已含跳过信息。
- **前端可选轻量接入**：在 `handleImport` 发起前，若 `importBatchNo` 命中某 `paper_batches` 配置且 `configured`，可在前端用 `Papa`/`XLSX` 解析做预览提示（**非必须，最小侵入可省**）；主校验以后端为准。
- **成功回调刷新**（Q10）：`finishImport`（第 693-700 行）已调用 `fetchList()` 与 `fetchOptions()`；**追加 `fetchBatchNos()`**，使新补的占位批号立即可见。

### 7.4 handleSave 校验接入（原 568-611 行）

- 单条新增/编辑保存时，`POST /`/`PUT /` 后端（§5.2）已做批号配置分数校验；前端 `handleSave` 现有 409 去重流**不变**，仅错误提示由后端 `message` 统一返回。
- **成功回调刷新**（Q10）：保存后追加 `fetchBatchNos()`（在 `fetchList()` 旁），让新增批号占位进入下拉。
- **弹窗不强制选批号**（Q9）：`ScoreList` 新增弹窗的「试卷批号」`prop="batch_no"` 当前无 `required` 规则（第 557-560 行 `rules` 仅 `exam_no`/`name` 必填），**保持即可**，无需新增必填。

---

## 八、有序任务列表（给工程师寇豆的作业单）

> 顺序即依赖顺序；验收标准以「接口契约 + 现有范式一致性」为准。

| # | 任务 | 涉及文件 | 依赖 | 验收标准 |
| --- | --- | --- | --- | --- |
| T1 | 建表：`paper_batches` DDL + 索引 | `server/src/db.js` | 无 | 启动后 `sqlite` 中表存在、UNIQUE/索引生效；旧库不报错 |
| T2 | 工具层：`ensurePaperBatch` + `computedPassLine` + 导出 `PAPER_BATCH_HEADERS` | `server/src/utils/paperBatch.js`、`server/src/utils/excel.js` | 无 | 幂等插入占位行；`passLine` 计算正确；常量导出 |
| T3 | 8 接口实现 | `server/src/routes/paper-batches.js` | T1,T2 | 8 接口全部通过 API 级验证；排序白名单/分页钳制/409 结构与 scores 一致 |
| T4 | 路由挂载 | `server/src/index.js` | T3 | `/api/paper-batches/*` 可访问 |
| T5 | scores 三处改造 | `server/src/routes/scores.js` | T2 | batch-nos 合并返回对象数组；POST/import 静默补占位；分数校验生效；PUT 幂等不变 |
| T6 | 前端 API 封装 | `web/src/api/paper-batches.js` | T3 | 8 方法导出，参数/响应与后端对齐 |
| T7 | 批次管理页 | `web/src/views/PaperBatchList.vue` | T6 | 4 区布局、列设置、增删改查、导入导出、409 处理、sumOfItems/合格线联动、校验生效 |
| T8 | 路由+菜单 | `web/src/router/index.js`、`web/src/views/Layout.vue` | T7 | `/paperBatch` 可达，菜单显示且顺序正确 |
| T9 | 成绩页联动改造 | `web/src/views/ScoreList.vue` | T5,T6 | 合格状态列、total 着色按批号、下拉结构变更、保存/导入后刷新批号 |
| T10 | 构建验证 | 根 `package.json` build 脚本 | T1-T9 | `npm run build`（web）无报错；服务启动无异常日志 |
| T11 | 联调验证 | 全量 | T1-T10 | 端到端：新增批号→成绩页下拉带出→导入成绩校验→合格状态标记→批删关联拦截 |

> 预计 11 个任务（在 8~14 区间内）；T1/T2 可并行。

---

## 九、依赖包列表

**预期零新增。**

| 层 | 现有包 | 是否新增 | 说明 |
| --- | --- | --- | --- |
| server | `better-sqlite3` / `express` / `multer` / `xlsx` | 否 | `paperBatch.js` 复用 `db`；Excel 导出复用 `xlsx`（已在 `excel.js` 引入） |
| web | `vue` / `vue-router` / `element-plus` / `axios` / `@element-plus/icons-vue` | 否 | 弹窗校验用 Element Plus 内置 `async-validator`，无需额外包 |
| 构建 | `vite` 等 | 否 | 仅新增一个 `.vue` 与一个 `.js` 路由模块，构建配置无需改动 |

> 若坚持「服务端导出用 `XLSX` 引擎」——`xlsx` 已在 `excel.js` 顶部 `require`，`paper-batches.js` 直接 `require('../utils/excel')` 复用即可，不引新依赖。

---

## 十、共享知识与约定

1. **Response 结构**：成功 `{code:0, data:{...}}`；错误 `HTTP 状态码 + {code,message,data}`（沿用 scores.js）。列表响应统一含 `{list, total, page, pageSize, totalPages}`。
2. **字段命名**：后端 DB/接口用 `snake_case`（`batch_no`/`total_full`/`pass_ratio`/`created_at`）；前端 `api` 层透传 `snake_case`（与现有 `scores.js`/`students.js` 一致，不额外做 camel 转换，降低出错面）。
3. **Excel 列名常量**：`server/src/utils/excel.js` 新增
   ```js
   const PAPER_BATCH_HEADERS = ['序号','试卷批号','试卷批次名称','选择题满分','电子表格满分','Access满分','Python满分','综合题满分','试卷总满分','默认合格占比(%)','计算得出合格线','备注','创建时间'];
   ```
   导出/导入/表头校验共用；「计算得出合格线」「创建时间」为只读列，导入时忽略（Q5）。
4. **Q2 `configured` 布尔语义**：`configured = total_full > 0`。`true`=已配置（分数校验 + 合格标记生效）；`false`=占位未配置（跳过校验，前端合格状态列显示灰「—」，total 回退阈值 60）。贯穿 `batch-nos` 合并响应、`by-no` 响应、成绩列表行级标记。
5. **Q7 `batch-nos` 合并项结构**：`{ batchNo, batchName, passLine, totalFull, configured }`，一次拉全，下拉/total 着色/导入校验/合格标记共用，避免多次请求。
6. **pass_line 不落库**（Q8）：所有 `passLine` 均 `ROUND(total_full*pass_ratio/100, 2)` 运行时计算（含列表「计算得出合格线」列、导出、下拉、by-no）。
7. **created_at 派生**（P1-7）：列表/by-no/`ensurePaperBatch` 口径统一 = `scores.submit_time` 日期众数，无成绩取 `date('now','localtime')`。
8. **幂等/事务约定**：`ensurePaperBatch` 用 `INSERT...WHERE NOT EXISTS`；导入/批删走 `db.transaction`；批删遇关联整体 409（Q6）。
9. **前端列设置**：`STORAGE_KEY` 各页独立（`paper-batch-list-columns` / `score-list-columns`），`loadColumnConfig` 兼容旧 localStorage（缺失 key 默认可见）。

---

## 十一、风险与待明确事项

### 11.1 风险

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| R1 `created_at` 众数派生在列表接口逐行查询，批号量大时 N+1 | 性能 | 批号量级小（主数据），可接受；若需优化改为 `LEFT JOIN` 子查询一次性带出 |
| R2 历史 `scores` 中 `batch_no` 为自由文本，合并下拉会引入「未维护但历史存在」的批号 | 下拉变长 | 符合 Q7 需求（覆盖历史全集）；占位行补全后用户可逐步维护 |
| R3 前端 `batch-nos` 由字符串数组改对象数组 | 破坏旧 localStorage/缓存 | `STORAGE_KEY` 不同，无冲突；需回归 ScoreList 下拉渲染 |
| R4 分数校验在 import 事务内逐行 `SELECT` 配置 | 大文件导入稍慢 | 同一 `batchNo` 配置仅查一次可缓存到事务局部变量（建议实现时缓存） |
| R5 占位行 `batch_name` 用批号兜底 | 列表显示不友好 | 用户在批次页补全即可；属已知权衡（Q1） |

### 11.2 待明确事项（非阻塞，已按既定结论执行）

- D1 导出 Excel 是否需保留「序号」自增列（PRD 13 列含序号）→ 已按序号=行号实现。
- D2 `by-no` 在「占位行已存在但 total_full=0」时 `configured=false`，成绩页应回退阈值 60 且不校验 → 已在 Q2/Q9 明确。
- D3 批量删除 409 的 `blocked` 列表是否需附带关联成绩条数 → 当前仅返回批号数组，足够前端提示；如需条数可在 `data` 扩 `blockedDetails`，属增强项。
- D4 `PUT /api/scores/:id` 是否也加批号配置分数校验 → 建议加（口径一致），非阻塞。

> 以上待明确项均不阻塞本架构落地，已在 §3~§7 给出默认实现口径。
