const jwt = require('jsonwebtoken');

/**
 * Authentication middleware.
 *
 * 1. Extracts JWT from HTTP-only cookie (primary) or Authorization header (fallback).
 * 2. Verifies the token and attaches decoded user to req.user.
 * 3. On expired/invalid token: clears the stale cookie to prevent repeat failures.
 */
function protect(req, res, next) {
  // 1. Try HTTP-only cookie first (new secure method)
  // 2. Fall back to Authorization Bearer header (backward compat / Postman)
  const tokenFromCookie = req.cookies?.token || null;
  const tokenFromHeader = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.split(' ')[1]
    : null;
  const token = tokenFromCookie || tokenFromHeader;

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      id: decoded.id,
      username: decoded.username,
      email: decoded.email,
      role: decoded.role,
    };

    return next();
  } catch (err) {
    // Clear the stale/invalid cookie so the browser doesn't keep sending it
    if (tokenFromCookie) {
      const IS_PROD = process.env.NODE_ENV === 'production';
      res.clearCookie('token', {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: IS_PROD ? 'None' : 'Lax',
        path: '/',
      });
    }

    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }

    return res.status(401).json({ error: 'Invalid token', code: 'TOKEN_INVALID' });
  }
}

module.exports = { protect };
