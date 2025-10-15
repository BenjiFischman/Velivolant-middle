import db from '../db/postgres';
import logger from '../logger/winstonConfig';
import {
  Resolvers,
  ContentArgs,
  EventArgs,
  CreateContentArgs,
  UpdateContentArgs,
  DeleteContentArgs,
  SubscribeArgs,
  CancelSubscriptionArgs,
  PurchaseContentArgs,
  SubscribeNewsletterArgs,
  ContentByIdArgs,
  ContentBySlugArgs,
  EventByIdArgs,
  UserByIdArgs,
  GraphQLContext,
  Content,
  User,
  ContentConnection,
  EventConnection,
} from '../types/graphql';

/**
 * GraphQL Resolvers (TypeScript)
 * Delegates to database queries
 */

const resolvers: Resolvers = {
  // ===================================================================
  // QUERIES
  // ===================================================================
  
  content: async (args: ContentArgs, context: GraphQLContext): Promise<ContentConnection> => {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        category,
        contentType,
        isPremium,
        authorId,
        tags,
        search,
      } = args;

      const offset = (page - 1) * limit;
      const conditions: string[] = [];
      const params: any[] = [];
      let paramCount = 0;

      // Build WHERE clause
      if (status) {
        params.push(status);
        conditions.push(`c.status = $${++paramCount}`);
      } else {
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

      if (isPremium !== undefined && isPremium !== null) {
        params.push(isPremium);
        conditions.push(`c.is_premium = $${++paramCount}`);
      }

      if (authorId) {
        params.push(authorId);
        conditions.push(`c.author_id = $${++paramCount}`);
      }

      if (tags && tags.length > 0) {
        params.push(tags);
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
          c.content_id, c.title, c.slug, c.subtitle, c.excerpt, c.body,
          c.featured_image_url, c.content_type, c.is_premium, c.is_free,
          c.price, c.tags, c.status, c.published_at, c.view_count, c.created_at,
          c.author_id, c.category_id
        FROM content c
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

      return {
        content: contentResult.rows.map(row => ({
          contentId: row.content_id,
          title: row.title,
          slug: row.slug,
          subtitle: row.subtitle,
          excerpt: row.excerpt,
          body: row.body,
          featuredImageUrl: row.featured_image_url,
          contentType: row.content_type,
          isPremium: row.is_premium,
          isFree: row.is_free,
          price: parseFloat(row.price),
          tags: row.tags || [],
          status: row.status,
          publishedAt: row.published_at?.toISOString(),
          viewCount: row.view_count,
          createdAt: row.created_at?.toISOString(),
          authorId: row.author_id,
          categoryId: row.category_id,
        })),
        pageInfo: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error('GraphQL content query error:', error);
      throw error;
    }
  },

  contentById: async ({ id }: ContentByIdArgs): Promise<Content | null> => {
    const result = await db.query(
      'SELECT * FROM content WHERE content_id = $1',
      [id]
    );
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      contentId: row.content_id,
      title: row.title,
      slug: row.slug,
      subtitle: row.subtitle,
      excerpt: row.excerpt,
      body: row.body,
      featuredImageUrl: row.featured_image_url,
      contentType: row.content_type,
      isPremium: row.is_premium,
      isFree: row.is_free,
      price: parseFloat(row.price),
      tags: row.tags || [],
      status: row.status,
      publishedAt: row.published_at?.toISOString(),
      viewCount: row.view_count,
      createdAt: row.created_at?.toISOString(),
      authorId: row.author_id,
      categoryId: row.category_id,
    };
  },

  contentBySlug: async ({ slug }: ContentBySlugArgs): Promise<Content | null> => {
    const result = await db.query(
      'SELECT * FROM content WHERE slug = $1',
      [slug]
    );
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      contentId: row.content_id,
      title: row.title,
      slug: row.slug,
      subtitle: row.subtitle,
      excerpt: row.excerpt,
      body: row.body,
      featuredImageUrl: row.featured_image_url,
      contentType: row.content_type,
      isPremium: row.is_premium,
      isFree: row.is_free,
      price: parseFloat(row.price),
      tags: row.tags || [],
      status: row.status,
      publishedAt: row.published_at?.toISOString(),
      viewCount: row.view_count,
      createdAt: row.created_at?.toISOString(),
      authorId: row.author_id,
      categoryId: row.category_id,
    };
  },

  events: async (args: EventArgs): Promise<EventConnection> => {
    const { page = 1, limit = 20, status } = args;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM events';
    let countQuery = 'SELECT COUNT(*) as total FROM events';
    const params: any[] = [];

    if (status !== undefined && status !== null) {
      query += ' WHERE status = $1';
      countQuery += ' WHERE status = $1';
      params.push(status);
    }

    query += ` ORDER BY start_time DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const eventResult = await db.query(query, params);
    const countResult = await db.query(countQuery, params.slice(0, -2));
    const total = parseInt(countResult.rows[0].total);

    return {
      events: eventResult.rows.map(row => ({
        eventId: row.event_id,
        name: row.name,
        description: row.description,
        startTime: row.start_time?.toISOString(),
        endTime: row.end_time?.toISOString(),
        organizerId: row.organizer_id,
        location: row.location,
        maxParticipants: row.max_participants,
        type: row.type,
        status: row.status,
        createdAt: row.created_at?.toISOString(),
      })),
      pageInfo: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  eventById: async ({ id }: EventByIdArgs) => {
    const result = await db.query(
      'SELECT * FROM events WHERE event_id = $1',
      [id]
    );
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      eventId: row.event_id,
      name: row.name,
      description: row.description,
      startTime: row.start_time?.toISOString(),
      endTime: row.end_time?.toISOString(),
      organizerId: row.organizer_id,
      location: row.location,
      maxParticipants: row.max_participants,
      type: row.type,
      status: row.status,
      createdAt: row.created_at?.toISOString(),
    };
  },

  me: async (args: {}, context: GraphQLContext): Promise<User | null> => {
    if (!context.user) return null;

    const result = await db.query(
      `SELECT u.id, u.username, u.email, u.created_at,
              a.first_name, a.last_name, a.email_verified
       FROM users u
       LEFT JOIN accounts a ON u.id = a.user_id
       WHERE u.id = $1`,
      [context.user.id]
    );

    if (result.rows.length === 0) return null;

    const user = result.rows[0];

    // Get roles
    const rolesResult = await db.query(
      `SELECT r.role_key
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.role_id
       WHERE ur.user_id = $1 AND ur.is_active = TRUE`,
      [context.user.id]
    );

    // Get permissions
    const permissionsResult = await db.query(
      `SELECT DISTINCT p.permission_key
       FROM user_roles ur
       JOIN role_permissions rp ON ur.role_id = rp.role_id
       JOIN permissions p ON rp.permission_id = p.permission_id
       WHERE ur.user_id = $1 AND ur.is_active = TRUE`,
      [context.user.id]
    );

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      emailVerified: user.email_verified,
      roles: rolesResult.rows.map(r => r.role_key),
      permissions: permissionsResult.rows.map(p => p.permission_key),
      createdAt: user.created_at?.toISOString(),
    };
  },

  user: async ({ id }: UserByIdArgs): Promise<User | null> => {
    const result = await db.query(
      `SELECT u.id, u.username, u.email, u.created_at,
              a.first_name, a.last_name, a.email_verified
       FROM users u
       LEFT JOIN accounts a ON u.id = a.user_id
       WHERE u.id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;

    const user = result.rows[0];
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      emailVerified: user.email_verified,
      roles: [],
      permissions: [],
      createdAt: user.created_at?.toISOString(),
    };
  },

  mySubscription: async (args: {}, context: GraphQLContext) => {
    if (!context.user) return null;

    const result = await db.query(
      `SELECT * FROM subscriptions
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [context.user.id]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      subscriptionId: row.subscription_id,
      userId: row.user_id,
      subscriptionTier: row.subscription_tier,
      status: row.status,
      price: parseFloat(row.price),
      currency: row.currency,
      billingPeriod: row.billing_period,
      expiresAt: row.expires_at?.toISOString(),
      autoRenew: row.auto_renew,
      createdAt: row.created_at?.toISOString(),
    };
  },

  myPurchases: async (args: {}, context: GraphQLContext): Promise<Content[]> => {
    if (!context.user) return [];

    const result = await db.query(
      `SELECT c.* FROM content c
       JOIN content_purchases cp ON c.content_id = cp.content_id
       WHERE cp.user_id = $1`,
      [context.user.id]
    );

    return result.rows.map(row => ({
      contentId: row.content_id,
      title: row.title,
      slug: row.slug,
      subtitle: row.subtitle,
      excerpt: row.excerpt,
      body: row.body,
      featuredImageUrl: row.featured_image_url,
      contentType: row.content_type,
      isPremium: row.is_premium,
      isFree: row.is_free,
      price: parseFloat(row.price),
      tags: row.tags || [],
      status: row.status,
      publishedAt: row.published_at?.toISOString(),
      viewCount: row.view_count,
      createdAt: row.created_at?.toISOString(),
      authorId: row.author_id,
      categoryId: row.category_id,
    }));
  },

  categories: async () => {
    const result = await db.query(
      'SELECT * FROM content_categories ORDER BY name'
    );

    return result.rows.map(row => ({
      categoryId: row.category_id,
      name: row.name,
      slug: row.slug,
      description: row.description,
    }));
  },

  // ===================================================================
  // MUTATIONS
  // ===================================================================
  
  createContent: async ({ input }: CreateContentArgs, context: GraphQLContext): Promise<Content> => {
    if (!context.user) {
      throw new Error('Authentication required');
    }

    const {
      title,
      body,
      subtitle,
      excerpt,
      featuredImageUrl,
      contentType = 'article',
      isPremium = false,
      isFree = true,
      price = 0,
      tags = [],
      categoryId,
      status = 'draft',
    } = input;

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') + '-' + Date.now();

    const result = await db.query(
      `INSERT INTO content (
        title, slug, subtitle, body, excerpt, featured_image_url,
        content_type, is_premium, is_free, price, tags, author_id,
        category_id, status, published_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        title, slug, subtitle, body, excerpt, featuredImageUrl,
        contentType, isPremium, isFree, price, tags, context.user.id,
        categoryId, status, status === 'published' ? new Date() : null
      ]
    );

    const row = result.rows[0];
    return {
      contentId: row.content_id,
      title: row.title,
      slug: row.slug,
      subtitle: row.subtitle,
      excerpt: row.excerpt,
      body: row.body,
      featuredImageUrl: row.featured_image_url,
      contentType: row.content_type,
      isPremium: row.is_premium,
      isFree: row.is_free,
      price: parseFloat(row.price),
      tags: row.tags || [],
      status: row.status,
      publishedAt: row.published_at?.toISOString(),
      viewCount: row.view_count,
      createdAt: row.created_at?.toISOString(),
      authorId: row.author_id,
      categoryId: row.category_id,
    };
  },

  updateContent: async ({ contentId, input }: UpdateContentArgs, context: GraphQLContext): Promise<Content> => {
    if (!context.user) {
      throw new Error('Authentication required');
    }

    const updates: string[] = [];
    const params: any[] = [contentId];
    let paramCount = 1;

    Object.entries(input).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.push(value);
        // Convert camelCase to snake_case
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        updates.push(`${dbKey} = $${++paramCount}`);
      }
    });

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    const result = await db.query(
      `UPDATE content SET ${updates.join(', ')}
       WHERE content_id = $1
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      throw new Error('Content not found');
    }

    const row = result.rows[0];
    return {
      contentId: row.content_id,
      title: row.title,
      slug: row.slug,
      subtitle: row.subtitle,
      excerpt: row.excerpt,
      body: row.body,
      featuredImageUrl: row.featured_image_url,
      contentType: row.content_type,
      isPremium: row.is_premium,
      isFree: row.is_free,
      price: parseFloat(row.price),
      tags: row.tags || [],
      status: row.status,
      publishedAt: row.published_at?.toISOString(),
      viewCount: row.view_count,
      createdAt: row.created_at?.toISOString(),
      authorId: row.author_id,
      categoryId: row.category_id,
    };
  },

  deleteContent: async ({ contentId }: DeleteContentArgs, context: GraphQLContext): Promise<boolean> => {
    if (!context.user) {
      throw new Error('Authentication required');
    }

    await db.query('DELETE FROM content WHERE content_id = $1', [contentId]);
    return true;
  },

  subscribe: async ({ input }: SubscribeArgs, context: GraphQLContext) => {
    if (!context.user) {
      throw new Error('Authentication required');
    }

    const { subscriptionTier, price, billingPeriod, paymentMethod } = input;

    let expiresAt: Date | null;
    const now = new Date();
    
    switch (billingPeriod) {
      case 'monthly':
        expiresAt = new Date(now.setMonth(now.getMonth() + 1));
        break;
      case 'yearly':
        expiresAt = new Date(now.setFullYear(now.getFullYear() + 1));
        break;
      case 'lifetime':
        expiresAt = null;
        break;
      default:
        throw new Error('Invalid billing period');
    }

    const result = await db.query(
      `INSERT INTO subscriptions (
        user_id, subscription_tier, status, price, currency,
        billing_period, payment_method, expires_at
      ) VALUES ($1, $2, 'active', $3, 'USD', $4, $5, $6)
      RETURNING *`,
      [context.user.id, subscriptionTier, price, billingPeriod, paymentMethod, expiresAt]
    );

    const row = result.rows[0];
    return {
      subscriptionId: row.subscription_id,
      userId: row.user_id,
      subscriptionTier: row.subscription_tier,
      status: row.status,
      price: parseFloat(row.price),
      currency: row.currency,
      billingPeriod: row.billing_period,
      expiresAt: row.expires_at?.toISOString(),
      autoRenew: row.auto_renew,
      createdAt: row.created_at?.toISOString(),
    };
  },

  cancelSubscription: async ({ subscriptionId }: CancelSubscriptionArgs, context: GraphQLContext): Promise<boolean> => {
    if (!context.user) {
      throw new Error('Authentication required');
    }

    await db.query(
      `UPDATE subscriptions
       SET status = 'cancelled', cancelled_at = NOW()
       WHERE subscription_id = $1 AND user_id = $2`,
      [subscriptionId, context.user.id]
    );

    return true;
  },

  purchaseContent: async ({ contentId, amount }: PurchaseContentArgs, context: GraphQLContext): Promise<boolean> => {
    if (!context.user) {
      throw new Error('Authentication required');
    }

    await db.query(
      `INSERT INTO content_purchases (user_id, content_id, amount)
       VALUES ($1, $2, $3)`,
      [context.user.id, contentId, amount]
    );

    return true;
  },

  subscribeNewsletter: async ({ frequency = 'weekly' }: SubscribeNewsletterArgs, context: GraphQLContext): Promise<boolean> => {
    if (!context.user) {
      throw new Error('Authentication required');
    }

    const userResult = await db.query(
      'SELECT email FROM users WHERE id = $1',
      [context.user.id]
    );

    await db.query(
      `INSERT INTO newsletter_subscriptions (user_id, email, frequency)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
       SET subscribed = TRUE, frequency = $3`,
      [context.user.id, userResult.rows[0].email, frequency]
    );

    return true;
  },

  unsubscribeNewsletter: async (args: {}, context: GraphQLContext): Promise<boolean> => {
    if (!context.user) {
      throw new Error('Authentication required');
    }

    await db.query(
      `UPDATE newsletter_subscriptions
       SET subscribed = FALSE
       WHERE user_id = $1`,
      [context.user.id]
    );

    return true;
  },

  // ===================================================================
  // FIELD RESOLVERS
  // ===================================================================
  
  Content_author: async (parent: Content): Promise<User | null> => {
    if (!parent.authorId) return null;

    const result = await db.query(
      `SELECT u.id, u.username, u.email, u.created_at,
              a.first_name, a.last_name, a.email_verified
       FROM users u
       LEFT JOIN accounts a ON u.id = a.user_id
       WHERE u.id = $1`,
      [parent.authorId]
    );

    if (result.rows.length === 0) return null;

    const user = result.rows[0];
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      emailVerified: user.email_verified,
      roles: [],
      permissions: [],
      createdAt: user.created_at?.toISOString(),
    };
  },

  Content_category: async (parent: Content) => {
    if (!parent.categoryId) return null;

    const result = await db.query(
      'SELECT * FROM content_categories WHERE category_id = $1',
      [parent.categoryId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      categoryId: row.category_id,
      name: row.name,
      slug: row.slug,
      description: row.description,
    };
  },

  Content_authors: async (parent: Content) => {
    const result = await db.query(
      `SELECT ca.role, u.id as user_id, u.username
       FROM content_authors ca
       JOIN users u ON ca.author_id = u.id
       WHERE ca.content_id = $1`,
      [parent.contentId]
    );

    return result.rows.map(row => ({
      userId: row.user_id,
      username: row.username,
      role: row.role,
    }));
  },
};

export default resolvers;

