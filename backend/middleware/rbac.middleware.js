const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      const user = req.user;
      
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!user.role || !allowedRoles.includes(user.role)) {
        return res.status(403).json({ error: 'Access denied: Insufficient role permissions' });
      }

      next();
    } catch (e) {
      return res.status(500).json({ error: 'Internal server error during role validation' });
    }
  };
};

module.exports = {
  requireRole,
};
