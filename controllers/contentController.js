const db = require('../db/postgres');
const logger = require('../logger/winstonConfig');
const emailService = require('../services/emailService');

const contentController = {
  /**
   * Create new content (article/newsletter)
   * POST /api/content
   */
  createContent: async (req, res) => {
    try {
      const {
        title,
        slug,
        subtitle,
        body,
        excerpt,
        featuredImageUrl,
        categoryId,
        contentType,
        isPremium,
        isFree,
        price,
        tags,
        metaTitle,
        metaDescription,
        status,
        scheduledAt
      } = req.body;

      const authorId = req.user.id;

      // Validate required fields
      if (!title || !body) {
        return res.status(400).json({
          success: false,
          message: 'Title and body are required'
        });
      }

      // Generate slug if not provided
      const contentSlug = slug || title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') + '-' + Date.now();

      // Check if slug exists
      const existingSlug = await db.query(
        'SELECT content_id FROM content WHERE slug = $1',
        [contentSlug]
      );

      if (existingSlug.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Content with this slug already exists'
        });
      }

      const result = await db.query(
        `INSERT INTO content (
          title, slug, subtitle, body, excerpt, featured_image_url,
          category_id, author_id, status, content_type, is_premium, is_free,
          price, meta_title, meta_description, tags, scheduled_at,
          published_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING *`,
        [
          title,
          contentSlug,
          subtitle || null,
          body,
          excerpt || null,
          featuredImageUrl || null,
          categoryId || null,
          authorId,
          status || 'draft',
          contentType || 'article',
          isPremium || false,
          isFree !== false, // Default to true
          price || 0,
          metaTitle || title,
          metaDescription || excerpt || null,
          tags || [],
          scheduledAt || null,
          status === 'published' ? new Date() : null
        ]
      );

      const content = result.rows[0];

      // Add to content_authors table
      await db.query(
        'INSERT INTO content_authors (content_id, author_id, role) VALUES ($1, $2, $3)',
        [content.content_id, authorId, 'author']
      );

      logger.info('Content created', { 
        contentId: content.content_id, 
        authorId, 
        title 
      });

      res.status(201).json({
        success: true,
        message: 'Content created successfully',
        data: content
      });
    } catch (error) {
      logger.error('Create content error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create content',
        error: process.env.NODE_ENV === 'production' ? undefined : error.message
      });
    }
  },

  /**
   * Get all content (with filters)
   * GET /api/content
   */
  getContent: async (req, res) => {
    try {
      const {
        status,
        category,
        contentType,
        isPremium,
        authorId,
        tags,
        page = 1,
        limit = 20,
        search
      } = req.query;

      const offset = (page - 1) * limit;
      const conditions = [];
      const params = [];
      let paramCount = 0;

      // Build WHERE clause
      if (status) {
        params.push(status);
        conditions.push(`c.status = $${++paramCount}`);
      } else {
        // Default to only published content for non-authenticated or non-author users
        params.push('published');
        conditions.push(`c.status = $${++paramCount}`);
      }

      if (category) {
        params.push(category);
        conditions.push(`cat.slug = $${++paramCount}`);
      }

      if (contentType) {
        params.push(contentType);
        conditions.push(`c.content_type = $${++paramCount}`);
      }

      if (isPremium !== undefined) {
        params.push(isPremium === 'true');
        conditions.push(`c.is_premium = $${++paramCount}`);
      }

      if (authorId) {
        params.push(parseInt(authorId));
        conditions.push(`c.author_id = $${++paramCount}`);
      }

      if (tags) {
        params.push(tags.split(','));
        conditions.push(`c.tags && $${++paramCount}`);
      }

      if (search) {
        params.push(`%${search}%`);
        conditions.push(`(c.title ILIKE $${++paramCount} OR c.body ILIKE $${paramCount})`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get content
      params.push(limit, offset);
      const contentQuery = `
        SELECT 
          c.content_id, c.title, c.slug, c.subtitle, c.excerpt, 
          c.featured_image_url, c.content_type, c.is_premium, c.is_free,
          c.price, c.tags, c.status, c.published_at, c.view_count, c.created_at,
          c.author_id, u.username as author_username, u.display_name as author_name,
          cat.name as category_name, cat.slug as category_slug
        FROM content c
        LEFT JOIN users u ON c.author_id = u.id
        LEFT JOIN content_categories cat ON c.category_id = cat.category_id
        ${whereClause}
        ORDER BY c.published_at DESC NULLS LAST, c.created_at DESC
        LIMIT $${++paramCount} OFFSET $${++paramCount}
      `;

      const contentResult = await db.query(contentQuery, params);

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM content c
        LEFT JOIN content_categories cat ON c.category_id = cat.category_id
        ${whereClause}
      `;

      const countResult = await db.query(countQuery, params.slice(0, -2));
      const total = parseInt(countResult.rows[0].total);

      res.json({
        success: true,
        data: {
          content: contentResult.rows,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      logger.error('Get content error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch content'
      });
    }
  },

  /**
   * Get single content by ID or slug
   * GET /api/content/:identifier
   */
  getContentById: async (req, res) => {
    try {
      const { identifier } = req.params;
      const userId = req.user?.id;

      // Check if identifier is numeric (ID) or string (slug)
      const isNumeric = /^\d+$/.test(identifier);
      const query = isNumeric 
        ? 'c.content_id = $1'
        : 'c.slug = $1';

      const result = await db.query(
        `SELECT 
          c.*, 
          u.username as author_username, 
          u.display_name as author_name,
          cat.name as category_name, 
          cat.slug as category_slug,
          ARRAY_AGG(DISTINCT jsonb_build_object(
            'user_id', ca_u.id,
            'username', ca_u.username,
            'role', ca.role
          )) FILTER (WHERE ca_u.id IS NOT NULL) as authors
        FROM content c
        LEFT JOIN users u ON c.author_id = u.id
        LEFT JOIN content_categories cat ON c.category_id = cat.category_id
        LEFT JOIN content_authors ca ON c.content_id = ca.content_id
        LEFT JOIN users ca_u ON ca.author_id = ca_u.id
        WHERE ${query}
        GROUP BY c.content_id, u.id, cat.category_id`,
        [identifier]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Content not found'
        });
      }

      const content = result.rows[0];

      // Track view if user is authenticated
      if (userId && content.status === 'published') {
        await db.query(
          `INSERT INTO content_views (content_id, user_id, ip_address, user_agent)
           VALUES ($1, $2, $3, $4)`,
          [content.content_id, userId, req.ip, req.get('user-agent')]
        );
      }

      res.json({
        success: true,
        data: content
      });
    } catch (error) {
      logger.error('Get content by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch content'
      });
    }
  },

  /**
   * Update content
   * PUT /api/content/:contentId
   */
  updateContent: async (req, res) => {
    try {
      const { contentId } = req.params;
      const userId = req.user.id;

      const {
        title,
        slug,
        subtitle,
        body,
        excerpt,
        featuredImageUrl,
        categoryId,
        status,
        isPremium,
        isFree,
        price,
        tags,
        metaTitle,
        metaDescription,
        scheduledAt
      } = req.body;

      // Check if user is the author or has edit permissions
      const contentCheck = await db.query(
        'SELECT author_id FROM content WHERE content_id = $1',
        [contentId]
      );

      if (contentCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Content not found'
        });
      }

      const isAuthor = contentCheck.rows[0].author_id === userId;
      const hasEditPermission = req.user.permissionKeys?.includes('content.edit_all');

      if (!isAuthor && !hasEditPermission) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to edit this content'
        });
      }

      // Build update query dynamically
      const updates = [];
      const params = [contentId];
      let paramCount = 1;

      if (title !== undefined) {
        updates.push(`title = $${++paramCount}`);
        params.push(title);
      }
      if (slug !== undefined) {
        updates.push(`slug = $${++paramCount}`);
        params.push(slug);
      }
      if (subtitle !== undefined) {
        updates.push(`subtitle = $${++paramCount}`);
        params.push(subtitle);
      }
      if (body !== undefined) {
        updates.push(`body = $${++paramCount}`);
        params.push(body);
      }
      if (excerpt !== undefined) {
        updates.push(`excerpt = $${++paramCount}`);
        params.push(excerpt);
      }
      if (featuredImageUrl !== undefined) {
        updates.push(`featured_image_url = $${++paramCount}`);
        params.push(featuredImageUrl);
      }
      if (categoryId !== undefined) {
        updates.push(`category_id = $${++paramCount}`);
        params.push(categoryId);
      }
      if (status !== undefined) {
        updates.push(`status = $${++paramCount}`);
        params.push(status);
        
        // Set published_at if status is changing to published
        if (status === 'published') {
          updates.push(`published_at = COALESCE(published_at, CURRENT_TIMESTAMP)`);
        }
      }
      if (isPremium !== undefined) {
        updates.push(`is_premium = $${++paramCount}`);
        params.push(isPremium);
      }
      if (isFree !== undefined) {
        updates.push(`is_free = $${++paramCount}`);
        params.push(isFree);
      }
      if (price !== undefined) {
        updates.push(`price = $${++paramCount}`);
        params.push(price);
      }
      if (tags !== undefined) {
        updates.push(`tags = $${++paramCount}`);
        params.push(tags);
      }
      if (metaTitle !== undefined) {
        updates.push(`meta_title = $${++paramCount}`);
        params.push(metaTitle);
      }
      if (metaDescription !== undefined) {
        updates.push(`meta_description = $${++paramCount}`);
        params.push(metaDescription);
      }
      if (scheduledAt !== undefined) {
        updates.push(`scheduled_at = $${++paramCount}`);
        params.push(scheduledAt);
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No fields to update'
        });
      }

      const result = await db.query(
        `UPDATE content 
         SET ${updates.join(', ')}
         WHERE content_id = $1
         RETURNING *`,
        params
      );

      logger.info('Content updated', { contentId, userId });

      res.json({
        success: true,
        message: 'Content updated successfully',
        data: result.rows[0]
      });
    } catch (error) {
      logger.error('Update content error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update content'
      });
    }
  },

  /**
   * Delete content
   * DELETE /api/content/:contentId
   */
  deleteContent: async (req, res) => {
    try {
      const { contentId } = req.params;
      const userId = req.user.id;

      // Check authorization
      const contentCheck = await db.query(
        'SELECT author_id FROM content WHERE content_id = $1',
        [contentId]
      );

      if (contentCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Content not found'
        });
      }

      const isAuthor = contentCheck.rows[0].author_id === userId;
      const hasDeletePermission = req.user.permissionKeys?.includes('content.delete');

      if (!isAuthor && !hasDeletePermission) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete this content'
        });
      }

      await db.query('DELETE FROM content WHERE content_id = $1', [contentId]);

      logger.info('Content deleted', { contentId, userId });

      res.json({
        success: true,
        message: 'Content deleted successfully'
      });
    } catch (error) {
      logger.error('Delete content error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete content'
      });
    }
  },

  /**
   * Publish newsletter to subscribers
   * POST /api/content/:contentId/publish-newsletter
   */
  publishNewsletter: async (req, res) => {
    try {
      const { contentId } = req.params;
      const userId = req.user.id;

      // Get content
      const contentResult = await db.query(
        `SELECT c.*, u.username
         FROM content c
         JOIN users u ON c.author_id = u.id
         WHERE c.content_id = $1 AND c.content_type = 'newsletter'`,
        [contentId]
      );

      if (contentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Newsletter not found'
        });
      }

      const newsletter = contentResult.rows[0];

      // Check authorization
      if (newsletter.author_id !== userId && !req.user.permissionKeys?.includes('content.publish')) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to publish this newsletter'
        });
      }

      // Get all newsletter subscribers
      const subscribersResult = await db.query(
        `SELECT email, u.username
         FROM newsletter_subscriptions ns
         JOIN users u ON ns.user_id = u.id
         WHERE ns.subscribed = TRUE`
      );

      // Send emails to all subscribers (in production, use a queue)
      const emailPromises = subscribersResult.rows.map(subscriber =>
        emailService.sendNewsletter(subscriber.email, subscriber.username, newsletter)
      );

      await Promise.allSettled(emailPromises);

      // Update content status to published
      await db.query(
        `UPDATE content 
         SET status = 'published', published_at = COALESCE(published_at, CURRENT_TIMESTAMP)
         WHERE content_id = $1`,
        [contentId]
      );

      logger.info('Newsletter published', { 
        contentId, 
        subscriberCount: subscribersResult.rows.length 
      });

      res.json({
        success: true,
        message: `Newsletter sent to ${subscribersResult.rows.length} subscribers`,
        data: {
          subscriberCount: subscribersResult.rows.length
        }
      });
    } catch (error) {
      logger.error('Publish newsletter error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to publish newsletter'
      });
    }
  },

  /**
   * Add co-author to content
   * POST /api/content/:contentId/authors
   */
  addCoAuthor: async (req, res) => {
    try {
      const { contentId } = req.params;
      const { authorId, role = 'co-author' } = req.body;
      const userId = req.user.id;

      // Check if user is the primary author
      const contentCheck = await db.query(
        'SELECT author_id FROM content WHERE content_id = $1',
        [contentId]
      );

      if (contentCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Content not found'
        });
      }

      if (contentCheck.rows[0].author_id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Only the primary author can add co-authors'
        });
      }

      // Add co-author
      await db.query(
        `INSERT INTO content_authors (content_id, author_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (content_id, author_id) DO UPDATE
         SET role = $3`,
        [contentId, authorId, role]
      );

      logger.info('Co-author added', { contentId, authorId, role });

      res.json({
        success: true,
        message: 'Co-author added successfully'
      });
    } catch (error) {
      logger.error('Add co-author error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to add co-author'
      });
    }
  }
};

module.exports = contentController;

