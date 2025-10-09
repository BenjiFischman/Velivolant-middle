const express = require('express');
const authController = require('../controllers/authController');
const { authMiddleware } = require('../');
const { 
  registerValidation, 
  loginValidation,
  changePasswordValidation 
} = require('../middleware/validation');

const router = express.Router();

// Public routes (no authentication required)
router.post('/register', registerValidation, authController.register);
router.post('/login', loginValidation, authController.login);
router.post('/logout', authController.logout);

// Password reset flow
router.post('/password/reset-request', authController.requestPasswordReset);
router.post('/password/reset-verify', authController.verifyResetToken);
router.post('/password/reset-confirm', authController.confirmPasswordReset);

// Protected routes (authentication required)
router.get('/me', authMiddleware.verifyToken, authController.getCurrentUser);
router.post('/password/change', authMiddleware.verifyToken, changePasswordValidation, authController.changePassword);
router.post('/refresh', authMiddleware.verifyToken, authController.refreshToken);

// Email verification
router.post('/email/verify', authController.verifyEmail);
router.post('/email/resend', authMiddleware.verifyToken, authController.resendVerificationEmail);

module.exports = router;
