# Score Radar · 成绩管理后台系统

基于 **Vue 3 组合式 API（Composition API）+ Node.js + SQLite** 的成绩管理后台系统，支持学生信息与考试成绩的增删改查、Excel 模板批量导入、多条件搜索与字段排序。

## 功能清单

| 模块 | 功能 |
| --- | --- |
| 登录页 | 账号密码登录（JWT），未登录访问任意页面自动跳转登录页 |
| 学生成绩记录 | 增删改查；Excel 模板批量导入；多条件搜索（姓名 / 班级 / 考试状态 / 考试时间范围）；所有成绩字段可点击表头排序；同步学生信息（以考号为主键把学生信息管理中的最新姓名 / 班级同步到成绩记录） |
| 学生信息管理 | 增删改查；Excel 模板批量导入；关键词（考号 / 姓名）+ 班级 + 年级搜索 |
| 个人中心 | 修改当前登录账号密码（校验旧密码 + 两次新密码一致） |

## 技术栈

- **前端**：Vue 3.5（`<script setup>` 组合式 API）+ Vite + Element Plus + Pinia + Vue Router + Axios
- **后端**：Node.js + Express + better-sqlite3（SQLite）+ JWT + bcryptjs + Multer + SheetJS(xlsx)
- **默认账号**：`admin` / `admin123`

## 目录结构

```
score-radar/
├── server/                  # 后端 API 服务
│   ├── seed/                # 初始化种子数据（来自上传的模板文件）
│   │   ├── students.csv     # 考生名单（1255 条）
│   │   └── scores.csv       # 成绩记录（51 条）
│   ├── src/
│   │   ├── index.js         # 应用入口（Express 启动 + 静态托管）
│   │   ├── db.js            # SQLite 建库建表
│   │   ├── seed.js          # 首次启动初始化：管理员 + 种子数据
│   │   ├── middleware/auth.js   # JWT 鉴权中间件
│   │   ├── routes/
│   │   │   ├── auth.js      # 登录 / 用户信息 / 修改密码
│   │   │   ├── students.js  # 学生 CRUD / 导入 / 模板下载
│   │   │   └── scores.js    # 成绩 CRUD / 导入 / 模板下载 / 搜索排序
│   │   └── utils/excel.js   # Excel 解析（含 GBK 乱码修复）/ 模板生成
│   └── data/                # SQLite 数据库文件（运行时生成）
└── web/                     # 前端 SPA
    └── src/
        ├── api/             # Axios 封装与接口模块
        ├── router/          # 路由与全局守卫（登录拦截）
        ├── stores/          # Pinia（登录态）
        └── views/           # Login / Layout / ScoreList / StudentList / Profile
```

## 数据表设计

**users** 管理账号

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | INTEGER PK | 主键 |
| username | TEXT UNIQUE | 登录账号 |
| password | TEXT | bcrypt 哈希 |
| nickname | TEXT | 昵称 |
| created_at / updated_at | TEXT | 时间戳 |

**students** 学生信息（对应「考生名单」模板：考号、姓名、班级、年级、学校）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | INTEGER PK | 主键 |
| exam_no | TEXT UNIQUE | 考号 |
| name | TEXT | 姓名 |
| class | TEXT | 班级 |
| grade | TEXT | 年级 |
| school | TEXT | 学校 |

**scores** 成绩记录（对应「学生成绩记录」模板：序号、考号、姓名、学校、班级、考试状态、交卷时间、选择题、电子表格、Access、Python、综合题、总成绩）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | INTEGER PK | 主键 |
| serial_no | INTEGER | 序号 |
| exam_no | TEXT | 考号 |
| name / school / class | TEXT | 姓名 / 学校 / 班级 |
| status | TEXT | 考试状态（已交卷 / 未登录 / 缺考） |
| submit_time | TEXT | 交卷时间（YYYY-MM-DD HH:mm，用于时间范围搜索） |
| choice / spreadsheet / access / python / composite / total | REAL | 各题型得分与总成绩 |

## 接口定义

### 认证
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | /api/auth/login | 登录，返回 JWT |
| GET | /api/auth/me | 当前用户信息（需 Token） |
| PUT | /api/auth/password | 修改密码（oldPassword / newPassword / confirmPassword） |

### 学生
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /api/students | 分页查询：keyword（考号/姓名模糊）、clazz、grade、page、pageSize |
| GET | /api/students/options | 班级 / 年级去重选项 |
| GET | /api/students/template | 下载学生导入模板 xlsx |
| POST | /api/students | 新增（考号唯一） |
| PUT | /api/students/:id | 修改 |
| DELETE | /api/students/:id | 删除 |
| DELETE | /api/students/clear | 一键清空所有学生信息（事务执行，并重置自增主键；返回清空条数） |
| POST | /api/students/import | Excel 批量导入（multipart，字段：考号、姓名、班级、年级、学校） |

### 成绩
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /api/scores | 多条件搜索 + 排序：name（模糊）、clazz、status、startTime/endTime（考试时间范围）、sortField/sortOrder（全部字段可排序）、page、pageSize |
| GET | /api/scores/options | 班级 / 考试状态选项 |
| GET | /api/scores/template | 下载成绩导入模板 xlsx |
| POST | /api/scores | 新增 |
| PUT | /api/scores/:id | 修改 |
| DELETE | /api/scores/:id | 删除 |
| POST | /api/scores/import | Excel 批量导入（字段：序号、考号、姓名、学校、班级、考试状态、交卷时间、选择题、电子表格、Access、Python、综合题、总成绩） |
| POST | /api/scores/sync-students | 同步学生信息：以考号为唯一主键，将学生信息管理中的最新姓名 / 班级同步到成绩记录；未匹配考号的成绩保持不变；返回扫描 / 更新 / 保持不变数量及变更明细 |

> 除 `/api/auth/login`、`/api/health` 外，所有接口均需请求头 `Authorization: Bearer <token>`。

## 快速启动

```bash
# 1. 启动后端（端口 3000，首次启动自动建库并导入种子数据）
cd server
npm install
npm start

# 2. 启动前端（端口 5174，已配置 /api 代理到 3000）
cd web
npm install
npm run dev
```

浏览器访问 http://localhost:5174 ，使用 `admin / admin123` 登录。

生产部署可直接 `cd web && npm run build`，由后端 Express 单端口托管 `web/dist`。

## Excel 导入说明

- 前端各列表页提供「下载导入模板」按钮，或直接使用上传的原始文件
- 字段以模板文件为准：学生 = 考号、姓名、班级、年级、学校；成绩 = 序号、考号、姓名、学校、班级、考试状态、交卷时间、选择题、电子表格、Access、Python、综合题、总成绩
- 导入策略：**同考号执行更新，新考号执行新增**（幂等，可重复导入）
- 自动兼容 GBK 双重编码的 Excel 文件（如 WPS/旧软件导出的乱码文件）
- 交卷时间自动规范化为 `YYYY-MM-DD HH:mm`，并支持 Excel 序列号时间戳自动转换
