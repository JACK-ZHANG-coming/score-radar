const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'score-radar-secret-change-me';
const JWT_EXPIRES = '12h';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

/** 校验 Bearer Token，失败返回 401 */
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ code: 401, message: '未登录或 Token 缺失' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ code: 401, message: '登录已过期，请重新登录' });
  }
}

module.exports = { signToken, authRequired, JWT_SECRET };
