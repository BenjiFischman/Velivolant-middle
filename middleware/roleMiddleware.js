const db = require('../db/postgres');
const logger = require('../logger/winstonConfig');

/**
 * Check if user has a specific role
 * @param {Array|String} allowedRoles - Role key(s) allowed to access
 */
const hasRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

      // Get user's active roles
      const result = await db.query(
        `SELECT r.role_key, r.role_name, r.level
         FROM user_roles ur
         JOIN roles r ON ur.role_id = r.role_id
         WHERE ur.user_id = $1 
           AND ur.is_active = TRUE
           AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
        [req.user.id]
      );

      if (result.rows.length === 0) {
        logger.warn('Access denied: No active roles', { userId: req.user.id });
        return res.status(403).json({
          success: false,
          message: 'Access denied: No active roles'
        });
      }

      const userRoles = result.rows.map(row => row.role_key);
      const hasRequiredRole = rolesArray.some(role => userRoles.includes(role));

      if (!hasRequiredRole) {
        logger.warn('Access denied: Insufficient role', { 
          userId: req.user.id, 
          userRoles, 
          requiredRoles: rolesArray 
        });
        return res.status(403).json({
          success: false,
          message: 'Access denied: Insufficient permissions'
        });
      }

      // Attach user roles to request
      req.user.roles = result.rows;
      req.user.roleKeys = userRoles;

      next();
    } catch (error) {
      logger.error('Role check error:', error);
      res.status(500).json({
        success: false,
        message: 'Authorization check failed'
      });
    }
  };
};

/**
 * Check if user has a specific permission
 * @param {Array|String} requiredPermissions - Permission key(s) required
 */
const hasPermission = (requiredPermissions) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const permissionsArray = Array.isArray(requiredPermissions) 
        ? requiredPermissions 
        : [requiredPermissions];

      // Get user's permissions through their roles
      const result = await db.query(
        `SELECT DISTINCT p.permission_key, p.permission_name, p.resource, p.action
         FROM user_roles ur
         JOIN role_permissions rp ON ur.role_id = rp.role_id
         JOIN permissions p ON rp.permission_id = p.permission_id
         WHERE ur.user_id = $1 
           AND ur.is_active = TRUE
           AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
        [req.user.id]
      );

      const userPermissions = result.rows.map(row => row.permission_key);
      const hasRequiredPermission = permissionsArray.some(perm => 
        userPermissions.includes(perm)
      );

      if (!hasRequiredPermission) {
        logger.warn('Access denied: Missing permission', { 
          userId: req.user.id, 
          userPermissions, 
          requiredPermissions: permissionsArray 
        });
        return res.status(403).json({
          success: false,
          message: 'Access denied: Insufficient permissions'
        });
      }

      // Attach user permissions to request
      req.user.permissions = result.rows;
      req.user.permissionKeys = userPermissions;

      next();
    } catch (error) {
      logger.error('Permission check error:', error);
      res.status(500).json({
        success: false,
        message: 'Permission check failed'
      });
    }
  };
};

/**
 * Check if user has minimum role level
 * @param {Number} minLevel - Minimum role level required
 */
const hasMinRoleLevel = (minLevel) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      // Get user's highest role level
      const result = await db.query(
        `SELECT MAX(r.level) as max_level
         FROM user_roles ur
         JOIN roles r ON ur.role_id = r.role_id
         WHERE ur.user_id = $1 
           AND ur.is_active = TRUE
           AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
        [req.user.id]
      );

      if (result.rows.length === 0 || result.rows[0].max_level === null) {
        logger.warn('Access denied: No role level', { userId: req.user.id });
        return res.status(403).json({
          success: false,
          message: 'Access denied: No active roles'
        });
      }

      const userMaxLevel = parseInt(result.rows[0].max_level);

      if (userMaxLevel < minLevel) {
        logger.warn('Access denied: Insufficient role level', { 
          userId: req.user.id, 
          userLevel: userMaxLevel, 
          requiredLevel: minLevel 
        });
        return res.status(403).json({
          success: false,
          message: 'Access denied: Insufficient role level'
        });
      }

      req.user.maxRoleLevel = userMaxLevel;
      next();
    } catch (error) {
      logger.error('Role level check error:', error);
      res.status(500).json({
        success: false,
        message: 'Authorization check failed'
      });
    }
  };
};

/**
 * Check if user can access specific content based on subscription/purchase
 * @param {Function} getContentId - Function to extract content ID from request
 */
const canAccessContent = (getContentId = (req) => req.params.contentId) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const contentId = getContentId(req);

      if (!contentId) {
        return res.status(400).json({
          success: false,
          message: 'Content ID required'
        });
      }

      // Get content details
      const contentResult = await db.query(
        `SELECT is_premium, is_free, author_id, status
         FROM content
         WHERE content_id = $1`,
        [contentId]
      );

      if (contentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Content not found'
        });
      }

      const content = contentResult.rows[0];

      // Allow if content is free
      if (content.is_free) {
        return next();
      }

      // Allow if user is the author
      if (content.author_id === req.user.id) {
        return next();
      }

      // Check if user has premium access permission
      const permissionResult = await db.query(
        `SELECT 1
         FROM user_roles ur
         JOIN role_permissions rp ON ur.role_id = rp.role_id
         JOIN permissions p ON rp.permission_id = p.permission_id
         WHERE ur.user_id = $1 
           AND ur.is_active = TRUE
           AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
           AND p.permission_key = 'content.view_premium'
         LIMIT 1`,
        [req.user.id]
      );

      if (permissionResult.rows.length > 0) {
        return next();
      }

      // Check if user has active subscription
      const subscriptionResult = await db.query(
        `SELECT 1
         FROM subscriptions
         WHERE user_id = $1
           AND status = 'active'
           AND (expires_at IS NULL OR expires_at > NOW())
         LIMIT 1`,
        [req.user.id]
      );

      if (subscriptionResult.rows.length > 0) {
        return next();
      }

      // Check if user purchased this specific content
      const purchaseResult = await db.query(
        `SELECT 1
         FROM content_purchases
         WHERE user_id = $1 
           AND content_id = $2
           AND (access_expires_at IS NULL OR access_expires_at > NOW())
         LIMIT 1`,
        [req.user.id, contentId]
      );

      if (purchaseResult.rows.length > 0) {
        return next();
      }

      // Access denied
      logger.warn('Content access denied', { 
        userId: req.user.id, 
        contentId 
      });

      res.status(403).json({
        success: false,
        message: 'This content requires a subscription or purchase',
        requiresPayment: true
      });
    } catch (error) {
      logger.error('Content access check error:', error);
      res.status(500).json({
        success: false,
        message: 'Access check failed'
      });
    }
  };
};

/**
 * Verify email is confirmed
 */
const requireEmailVerification = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const result = await db.query(
      'SELECT email_verified FROM accounts WHERE user_id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0 || !result.rows[0].email_verified) {
      return res.status(403).json({
        success: false,
        message: 'Email verification required',
        requiresVerification: true
      });
    }

    next();
  } catch (error) {
    logger.error('Email verification check error:', error);
    res.status(500).json({
      success: false,
      message: 'Verification check failed'
    });
  }
};

/**
 * Load user roles and permissions into request
 * Doesn't restrict access, just loads the data
 */
const loadUserRolesAndPermissions = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next();
    }

    // Get roles
    const rolesResult = await db.query(
      `SELECT r.role_id, r.role_key, r.role_name, r.level
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.role_id
       WHERE ur.user_id = $1 
         AND ur.is_active = TRUE
         AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
      [req.user.id]
    );

    // Get permissions
    const permissionsResult = await db.query(
      `SELECT DISTINCT p.permission_id, p.permission_key, p.permission_name, 
              p.resource, p.action
       FROM user_roles ur
       JOIN role_permissions rp ON ur.role_id = rp.role_id
       JOIN permissions p ON rp.permission_id = p.permission_id
       WHERE ur.user_id = $1 
         AND ur.is_active = TRUE
         AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
      [req.user.id]
    );

    req.user.roles = rolesResult.rows;
    req.user.roleKeys = rolesResult.rows.map(r => r.role_key);
    req.user.permissions = permissionsResult.rows;
    req.user.permissionKeys = permissionsResult.rows.map(p => p.permission_key);
    req.user.maxRoleLevel = Math.max(...rolesResult.rows.map(r => r.level), 0);

    next();
  } catch (error) {
    logger.error('Load roles and permissions error:', error);
    // Don't fail the request, just continue without the data
    next();
  }
};

module.exports = {
  hasRole,
  hasPermission,
  hasMinRoleLevel,
  canAccessContent,
  requireEmailVerification,
  loadUserRolesAndPermissions
};

