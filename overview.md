# 成绩管理后台系统 — 交付总览

## 完成内容

基于用户上传的两份 Excel 模板（学生成绩记录.xlsx、考生名单(1).xlsx）交付完整全栈系统，位于 `/Users/zhangqiang/Documents/GitHub/score-radar/`。

### 系统架构

| 端 | 技术栈 | 端口 |
| --- | --- | --- |
| 前端 `web/` | Vue 3.5 组合式 API（`<script setup>`）+ Vite + Element Plus + Pinia + Vue Router + Axios | 5174 |
| 后端 `server/` | Node.js + Express + better-sqlite3（SQLite）+ JWT + bcryptjs + Multer + SheetJS | 3000 |

### 功能与需求对照

| 需求 | 实现 | 验证结果 |
| --- | --- | --- |
| 登录页 + 未登录拦截 | JWT 登录、路由守卫、Axios 401 自动跳登录 | ✅ 错误密码 401 / 无 Token 401 |
| 左侧三菜单 | 学生成绩记录、学生信息管理、个人中心 | ✅ 构建通过 |
| 成绩增删改查 | 完整 CRUD + 弹窗表单 | ✅ API 实测通过 |
| 成绩 Excel 批量导入 | 按上传模板字段（13 列），同考号更新/新考号新增，含 GBK 乱码自动修复 + Excel 序列号时间转换 | ✅ 用原始文件实测：51 条全部正确导入 |
| 多条件搜索 | 姓名（模糊）、班级、考试状态、考试时间范围（datetimerange） | ✅ 实测：王 + 17班 + 2026-08~09 命中 7 条 |
| 成绩字段排序 | 序号/考号/姓名/班级/交卷时间/六项成绩全部支持表头点击远程排序 | ✅ 实测 total 降序正确 |
| 学生增删改查 | 完整 CRUD + 重复考号校验 | ✅ 实测通过 |
| 学生 Excel 导入 | 按上传模板字段（5 列） | ✅ 用原始文件实测：1255 条全部正确 |
| 个人中心改密 | 旧密码校验 + 新密码确认 + 改后强制重新登录 | ✅ 全流程实测通过 |
| 同步学生信息 | 以考号为主键，把学生信息最新姓名/班级同步到成绩记录，未匹配考号保持不变 | ✅ 三类场景实测通过 |
| 分页每页 500 条 | 选项为 10 / 25 / 50 / 100 / 500（默认 25），含页码越界钳制 | ✅ 全档位实测通过 |

### 关键决策

1. **GBK 双重编码修复**：用户上传的 xlsx 字符串是 GBK 双重编码（普通解析为"ÐòºÅ"式乱码），在 `server/src/utils/excel.js` 中用 `TextDecoder('gbk')` 自动修复
2. **时间规范化**：交卷时间统一存 `YYYY-MM-DD HH:mm`（修复了 seed 未规范化导致时间范围搜索失效的 bug），并支持 Excel 序列号时间戳自动转换
3. **种子数据**：首次启动自动创建 admin/admin123 并导入 1255 名学生 + 51 条成绩
4. **导入语义**：同考号 upsert（幂等，可重复导入），模板可从前端按钮直接下载

### 分页实现要点

每页条数选项统一为 **10 / 25 / 50 / 100 / 500**，默认 25，两个列表页（成绩、学生）一致。

| 层 | 位置 | 处理 |
| --- | --- | --- |
| 前端 | `ScoreList.vue` / `StudentList.vue` | `:page-sizes="[10, 25, 50, 100, 500]"`，`@size-change="handleSizeChange"` |
| 前端 | `handleSizeChange(size)` | 先把 `page` 钳制到 `ceil(total/size)` 再请求 —— Element Plus 的 `size-change` 在内部页码修正**之前**触发，否则会先用越界页码请求一次空列表 |
| 后端 | `students.js` / `scores.js` | `size` 钳制到 `[1, 500]`；`totalPages = ceil(total/size)`；`page` 钳制到 `[1, totalPages]`；响应返回 `totalPages` |

### 测试覆盖

- API 层：登录/鉴权、多条件搜索+排序、成绩 CRUD、学生 CRUD、两份原始 Excel 导入、模板下载、改密全流程 — 全部通过
- 构建层：`vite build` 生产构建通过，所有视图模块编译正常
- 浏览器 UI 截图验证：受沙箱限制（本地 Chrome 启动被拦截、Chromium 下载网络超时）未能执行，建议用户手动访问 http://localhost:5174 验收

### 启动方式

```bash
cd server && npm install && npm start   # 后端 3000
cd web && npm install && npm run dev    # 前端 5174
```

访问 http://localhost:5174，账号 admin / admin123。
