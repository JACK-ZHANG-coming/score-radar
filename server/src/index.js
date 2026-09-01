const express = require('express');
const cors = require('cors');
const path = require('path');
const seed = require('./seed');
const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/students');
const scoreRoutes = require('./routes/scores');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// 静态托管前端构建产物（生产环境可单端口部署）
app.use(express.static(path.join(__dirname, '..', '..', 'web', 'dist')));

app.get('/api/health', (req, res) => res.json({ code: 0, message: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/scores', scoreRoutes);

// 404
app.use((req, res) => res.status(404).json({ code: 404, message: '接口不存在' }));

// 统一错误处理
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[error]', err);
  res.status(500).json({ code: 500, message: err.message || '服务器内部错误' });
});

seed();

app.listen(PORT, () => {
  console.log(`[score-radar] API 服务已启动: http://127.0.0.1:${PORT}`);
});
