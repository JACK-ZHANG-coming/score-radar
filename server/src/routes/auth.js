const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, authRequired } = require('../middleware/auth');

const router = express.Router();

/** POST /api/auth/login  登录 */
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ code: 400, message: '请输入账号和密码' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ code: 401, message: '账号或密码错误' });
  }
  const token = signToken({ id: user.id, username: user.username });
  res.json({ code: 0, message: '登录成功', data: { token, user: { id: user.id, username: user.username, nickname: user.nickname } } });
});

/** GET /api/auth/me  当前登录用户信息 */
router.get('/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT id, username, nickname, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(401).json({ code: 401, message: '用户不存在' });
  res.json({ code: 0, data: user });
});

/** PUT /api/auth/password  修改密码 */
router.put('/password', authRequired, (req, res) => {
  const { oldPassword, newPassword, confirmPassword } = req.body || {};
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ code: 400, message: '请填写旧密码和新密码' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ code: 400, message: '新密码长度不能少于 6 位' });
  }
  if (confirmPassword !== undefined && newPassword !== confirmPassword) {
    return res.status(400).json({ code: 400, message: '两次输入的新密码不一致' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !bcrypt.compareSync(oldPassword, user.password)) {
    return res.status(400).json({ code: 400, message: '旧密码错误' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare("UPDATE users SET password = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(hash, user.id);
  res.json({ code: 0, message: '密码修改成功' });
});

module.exports = router;
