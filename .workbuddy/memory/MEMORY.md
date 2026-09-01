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
