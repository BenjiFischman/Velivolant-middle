# Roles and Permissions System Guide

## Overview

Velivolant now includes a comprehensive role-based access control (RBAC) system with support for multiple roles per user, granular permissions, email verification, content management, and subscription/paywall features.

## Core Components

### 1. Roles System

Users can have multiple roles simultaneously. Each role has a hierarchical level and associated permissions.

#### Available Roles

| Role | Level | Key | Description |
|------|-------|-----|-------------|
| Root Administrator | 100 | `root` | Full system access with all privileges |
| Administrator | 90 | `admin` | Platform administrator with management capabilities |
| Developer | 80 | `developer` | API and development access |
| Beta Tester | 70 | `beta_tester` | Access to beta features and testing environment |
| Content Author | 50 | `author` | Can create and publish newsletters and articles |
| Advertiser | 40 | `advertiser` | Can create and manage advertisements |
| Premium Consumer | 30 | `premium_consumer` | Access to premium paid content |
| Consumer | 10 | `consumer` | Standard user with basic access (default) |
| Guest | 0 | `guest` | Limited access for non-authenticated users |

### 2. Permissions System

Permissions are granular capabilities granted through roles.

#### Permission Categories

**User Management**
- `users.manage` - Full user management capabilities
- `users.view` - View user information
- `users.edit_own` - Edit own user profile

**Content Management**
- `content.create` - Create newsletters and articles
- `content.publish` - Publish content to public
- `content.edit_own` - Edit own content
- `content.edit_all` - Edit any content
- `content.delete` - Delete content
- `content.view_premium` - Access premium paid content
- `content.view_free` - Access free content

**Advertisement Management**
- `ads.create` - Create advertisements
- `ads.manage` - Full advertisement management
- `ads.analytics` - View advertisement analytics

**Event Management**
- `events.create` - Create events
- `events.manage` - Full event management
- `events.join` - Join events

**Developer Features**
- `api.access` - Access API endpoints
- `api.manage_keys` - Create and manage API keys
- `beta.access` - Access beta features

**System Administration**
- `system.settings` - Manage system settings
- `system.logs` - View system logs
- `roles.manage` - Create and manage roles

## Content Management System

### Content Types

- **Articles** - Standalone articles
- **Newsletters** - Newsletter editions (can be sent to subscribers)
- **Tutorials** - Educational content
- **News** - Platform news and updates
- **Community** - Community-generated content

### Content Access Control

#### Free Content
- `is_free: true` - Accessible to all users
- No subscription or payment required

#### Premium Content
- `is_premium: true` - Requires subscription or purchase
- Access granted through:
  1. Active premium subscription
  2. One-time content purchase
  3. `content.view_premium` permission
  4. Being the content author

### Multi-Author Support

Content can have multiple authors with different roles:
- **Author** - Primary author
- **Co-Author** - Contributing author
- **Contributor** - Minor contributions
- **Editor** - Editorial oversight

```javascript
// Add co-author to content
POST /api/content/:contentId/authors
{
  "authorId": 123,
  "role": "co-author"
}
```

## Subscription System

### Subscription Tiers

Subscriptions grant access to premium content and features.

**Billing Periods:**
- `monthly` - Monthly recurring
- `yearly` - Annual recurring
- `lifetime` - One-time payment, permanent access

### Creating a Subscription

```javascript
POST /api/subscriptions
{
  "subscriptionTier": "premium",
  "price": 9.99,
  "currency": "USD",
  "billingPeriod": "monthly",
  "paymentMethod": "credit_card"
}
```

### Content Purchases

Users can purchase individual premium content without a subscription:

```javascript
POST /api/subscriptions/purchase
{
  "contentId": 456,
  "amount": 4.99,
  "currency": "USD",
  "paymentMethod": "credit_card",
  "transactionId": "txn_123abc"
}
```

## Email Verification System

### Verification Flow

1. User registers → Verification email sent automatically
2. User clicks link with token → Email verified
3. User gains access to features requiring verification

### Email Service

The system includes a flexible email service supporting:
- Email verification
- Password reset
- Newsletter distribution
- Subscription welcome emails

**Development Mode:** Emails are logged to console
**Production Mode:** Configure email provider (SendGrid, SES, Mailgun, etc.)

### Configuration

```bash
# .env
EMAIL_SERVICE_ENABLED=true
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=your_key_here
EMAIL_FROM=noreply@velivolant.com
FRONTEND_URL=https://yourdomain.com
```

## API Endpoints

### Authentication

```
POST   /api/auth/register              # Register new user
POST   /api/auth/login                 # Login
POST   /api/auth/logout                # Logout
GET    /api/auth/me                    # Get current user with roles & permissions
POST   /api/auth/refresh               # Refresh JWT token
POST   /api/auth/email/verify          # Verify email with token
POST   /api/auth/email/resend          # Resend verification email
POST   /api/auth/password/change       # Change password (authenticated)
POST   /api/auth/password/reset-request # Request password reset
POST   /api/auth/password/reset-confirm # Confirm password reset
```

### Content Management

```
GET    /api/content                    # List all content (filtered by access)
POST   /api/content                    # Create content (requires author role)
GET    /api/content/:identifier        # Get single content (by ID or slug)
PUT    /api/content/:contentId         # Update content
DELETE /api/content/:contentId         # Delete content
POST   /api/content/:contentId/publish-newsletter  # Send newsletter to subscribers
POST   /api/content/:contentId/authors # Add co-author
```

### Subscriptions

```
POST   /api/subscriptions              # Create subscription
GET    /api/subscriptions              # Get user's subscriptions
GET    /api/subscriptions/active       # Get active subscription
POST   /api/subscriptions/:id/cancel   # Cancel subscription
POST   /api/subscriptions/purchase     # Purchase content
GET    /api/subscriptions/purchases    # Get purchased content
POST   /api/subscriptions/newsletter   # Subscribe to newsletter
POST   /api/subscriptions/newsletter/unsubscribe  # Unsubscribe
```

## Middleware

### Role-Based Authorization

```javascript
const { 
  hasRole, 
  hasPermission, 
  hasMinRoleLevel,
  canAccessContent,
  requireEmailVerification,
  loadUserRolesAndPermissions
} = require('./middleware/roleMiddleware');

// Require specific role
router.post('/admin-action', hasRole('admin'), controller.action);

// Require multiple roles (any of)
router.post('/content', hasRole(['author', 'admin']), controller.createContent);

// Require specific permission
router.delete('/content/:id', hasPermission('content.delete'), controller.delete);

// Require minimum role level
router.get('/admin', hasMinRoleLevel(90), controller.adminPanel);

// Check content access (subscription/purchase)
router.get('/content/:id', canAccessContent(), controller.getContent);

// Require email verification
router.post('/publish', requireEmailVerification, controller.publish);

// Load user roles/permissions without restriction
router.get('/profile', loadUserRolesAndPermissions, controller.profile);
```

## Database Schema

### Key Tables

**roles** - Role definitions with hierarchy
**permissions** - Permission definitions
**role_permissions** - Many-to-many role-permission mapping
**user_roles** - User role assignments (supports multiple roles, expiration)

**content** - Articles, newsletters, etc.
**content_authors** - Multi-author support
**content_categories** - Content categorization

**subscriptions** - User subscriptions
**content_purchases** - One-time content purchases
**newsletter_subscriptions** - Newsletter opt-in/out

**advertisements** - Ad management
**api_keys** - Developer API keys

### Running Migrations

```bash
# Run the new migrations
cd middle
npm run db:migrate

# This will create all roles, permissions, and content tables
```

## Usage Examples

### Granting Roles to Users

```sql
-- Grant author role to user
INSERT INTO user_roles (user_id, role_id)
SELECT 123, role_id FROM roles WHERE role_key = 'author';

-- Grant temporary beta tester access (expires in 30 days)
INSERT INTO user_roles (user_id, role_id, expires_at)
SELECT 123, role_id, NOW() + INTERVAL '30 days'
FROM roles WHERE role_key = 'beta_tester';
```

### Creating Premium Content

```javascript
POST /api/content
{
  "title": "Premium Guide to Advanced Features",
  "body": "Content here...",
  "contentType": "article",
  "isPremium": true,
  "isFree": false,
  "price": 9.99,
  "tags": ["tutorial", "advanced"]
}
```

### Publishing Newsletter

```javascript
// 1. Create newsletter
POST /api/content
{
  "title": "Weekly Newsletter - Oct 2025",
  "body": "Newsletter content...",
  "contentType": "newsletter",
  "status": "draft"
}

// 2. Publish and send to subscribers
POST /api/content/123/publish-newsletter
```

### Checking User Access

```javascript
// JWT token includes roles
{
  "id": 123,
  "email": "user@example.com",
  "roles": ["consumer", "author", "premium_consumer"]
}

// Get full user info with permissions
GET /api/auth/me
{
  "success": true,
  "data": {
    "id": 123,
    "email": "user@example.com",
    "roles": ["consumer", "author"],
    "rolesDetailed": [...],
    "permissions": ["content.create", "content.publish", ...],
    "permissionsDetailed": [...]
  }
}
```

## Security Considerations

1. **Email Verification** - Require verification for sensitive actions
2. **Role Expiration** - Temporary roles automatically expire
3. **Permission Checks** - Always verify permissions server-side
4. **JWT Tokens** - Include roles in token, re-validate on sensitive operations
5. **Content Access** - Check subscription/purchase status for premium content

## Future Enhancements

- [ ] Role inheritance (admin automatically gets author permissions)
- [ ] Custom role creation through UI
- [ ] Permission groups/presets
- [ ] Audit logging for role changes
- [ ] API rate limiting by role
- [ ] Content approval workflow
- [ ] Revenue sharing for multi-author content
- [ ] Referral/affiliate system for advertisers

## Migration from Old System

If migrating from a simple role system:

```sql
-- Assign consumer role to all existing users
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.role_id
FROM users u
CROSS JOIN roles r
WHERE r.role_key = 'consumer'
ON CONFLICT DO NOTHING;

-- Upgrade admins
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.role_id
FROM users u
CROSS JOIN roles r
WHERE u.role = 'admin' AND r.role_key = 'admin'
ON CONFLICT DO NOTHING;
```

## Support

For questions or issues with the roles and permissions system:
- Review this guide
- Check the migration files in `db/migrations/002_roles_and_content.sql`
- Review middleware in `middleware/roleMiddleware.js`
- Check controllers for implementation examples

---

**Version:** 1.0.0  
**Last Updated:** October 2025

