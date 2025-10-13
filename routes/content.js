const express = require('express');
const router = express.Router();
const contentController = require('../controllers/contentController');
const { requireAuth } = require('../authMiddleware');
const { 
  hasPermission, 
  canAccessContent, 
  requireEmailVerification,
  loadUserRolesAndPermissions
} = require('../middleware/roleMiddleware');

/**
 * Public routes (with optional auth)
 */

// Get all content (public, but filters based on auth)
router.get('/', 
  loadUserRolesAndPermissions, 
  contentController.getContent
);

// Get single content (access control is handled in controller)
router.get('/:identifier', 
  loadUserRolesAndPermissions, 
  canAccessContent((req) => req.params.identifier),
  contentController.getContentById
);

/**
 * Protected routes (require authentication)
 */

// Create content (requires author permission)
router.post('/', 
  requireAuth,
  requireEmailVerification,
  hasPermission('content.create'),
  contentController.createContent
);

// Update content (requires ownership or edit permission)
router.put('/:contentId',
  requireAuth,
  requireEmailVerification,
  loadUserRolesAndPermissions,
  contentController.updateContent
);

// Delete content (requires ownership or delete permission)
router.delete('/:contentId',
  requireAuth,
  loadUserRolesAndPermissions,
  contentController.deleteContent
);

// Publish newsletter to subscribers
router.post('/:contentId/publish-newsletter',
  requireAuth,
  requireEmailVerification,
  hasPermission('content.publish'),
  contentController.publishNewsletter
);

// Add co-author to content
router.post('/:contentId/authors',
  requireAuth,
  requireEmailVerification,
  contentController.addCoAuthor
);

module.exports = router;

