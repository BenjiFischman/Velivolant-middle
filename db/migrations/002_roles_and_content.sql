-- ===================================================================
-- ROLES AND PERMISSIONS SYSTEM
-- ===================================================================

-- Create roles table with hierarchical levels
CREATE TABLE IF NOT EXISTS roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) UNIQUE NOT NULL,
    role_key VARCHAR(50) UNIQUE NOT NULL, -- Technical identifier (e.g., 'admin', 'author')
    description TEXT,
    level INTEGER NOT NULL DEFAULT 0, -- Hierarchical level (higher = more privileges)
    is_system_role BOOLEAN DEFAULT FALSE, -- Cannot be deleted
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default roles with hierarchical levels
INSERT INTO roles (role_name, role_key, description, level, is_system_role) VALUES
    ('Root Administrator', 'root', 'Full system access with all privileges', 100, true),
    ('Administrator', 'admin', 'Platform administrator with management capabilities', 90, true),
    ('Developer', 'developer', 'API and development access', 80, true),
    ('Beta Tester', 'beta_tester', 'Access to beta features and testing environment', 70, true),
    ('Content Author', 'author', 'Can create and publish newsletters and articles', 50, true),
    ('Advertiser', 'advertiser', 'Can create and manage advertisements', 40, true),
    ('Premium Consumer', 'premium_consumer', 'Access to premium paid content', 30, true),
    ('Consumer', 'consumer', 'Standard user with basic access', 10, true),
    ('Guest', 'guest', 'Limited access for non-authenticated users', 0, true)
ON CONFLICT (role_key) DO NOTHING;

-- Create permissions table
CREATE TABLE IF NOT EXISTS permissions (
    permission_id SERIAL PRIMARY KEY,
    permission_name VARCHAR(100) UNIQUE NOT NULL,
    permission_key VARCHAR(100) UNIQUE NOT NULL, -- e.g., 'content.create', 'users.manage'
    description TEXT,
    resource VARCHAR(50) NOT NULL, -- e.g., 'content', 'users', 'events'
    action VARCHAR(50) NOT NULL, -- e.g., 'create', 'read', 'update', 'delete'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default permissions
INSERT INTO permissions (permission_name, permission_key, description, resource, action) VALUES
    -- User management
    ('Manage Users', 'users.manage', 'Full user management capabilities', 'users', 'manage'),
    ('View Users', 'users.view', 'View user information', 'users', 'read'),
    ('Edit Own Profile', 'users.edit_own', 'Edit own user profile', 'users', 'update'),
    
    -- Content management
    ('Create Content', 'content.create', 'Create newsletters and articles', 'content', 'create'),
    ('Publish Content', 'content.publish', 'Publish content to public', 'content', 'publish'),
    ('Edit Own Content', 'content.edit_own', 'Edit own content', 'content', 'update'),
    ('Edit All Content', 'content.edit_all', 'Edit any content', 'content', 'manage'),
    ('Delete Content', 'content.delete', 'Delete content', 'content', 'delete'),
    ('View Premium Content', 'content.view_premium', 'Access premium paid content', 'content', 'read'),
    ('View Free Content', 'content.view_free', 'Access free content', 'content', 'read'),
    
    -- Advertisement management
    ('Create Ads', 'ads.create', 'Create advertisements', 'ads', 'create'),
    ('Manage Ads', 'ads.manage', 'Full advertisement management', 'ads', 'manage'),
    ('View Ad Analytics', 'ads.analytics', 'View advertisement analytics', 'ads', 'read'),
    
    -- Event management
    ('Create Events', 'events.create', 'Create events', 'events', 'create'),
    ('Manage Events', 'events.manage', 'Full event management', 'events', 'manage'),
    ('Join Events', 'events.join', 'Join events', 'events', 'participate'),
    
    -- Beta features
    ('Access Beta Features', 'beta.access', 'Access beta features', 'beta', 'read'),
    
    -- Developer features
    ('API Access', 'api.access', 'Access API endpoints', 'api', 'read'),
    ('Manage API Keys', 'api.manage_keys', 'Create and manage API keys', 'api', 'manage'),
    
    -- System administration
    ('System Settings', 'system.settings', 'Manage system settings', 'system', 'manage'),
    ('View Logs', 'system.logs', 'View system logs', 'system', 'read'),
    ('Manage Roles', 'roles.manage', 'Create and manage roles', 'roles', 'manage')
ON CONFLICT (permission_key) DO NOTHING;

-- Create role_permissions join table
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INTEGER REFERENCES roles(role_id) ON DELETE CASCADE,
    permission_id INTEGER REFERENCES permissions(permission_id) ON DELETE CASCADE,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_id)
);

-- Create user_roles table (many-to-many: users can have multiple roles)
CREATE TABLE IF NOT EXISTS user_roles (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role_id INTEGER REFERENCES roles(role_id) ON DELETE CASCADE,
    granted_by INTEGER REFERENCES users(id), -- Admin who granted this role
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE, -- Optional expiration for temporary roles
    is_active BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (user_id, role_id)
);

-- Assign default permissions to roles
DO $$
DECLARE
    root_id INTEGER;
    admin_id INTEGER;
    developer_id INTEGER;
    beta_tester_id INTEGER;
    author_id INTEGER;
    advertiser_id INTEGER;
    premium_id INTEGER;
    consumer_id INTEGER;
BEGIN
    -- Get role IDs
    SELECT role_id INTO root_id FROM roles WHERE role_key = 'root';
    SELECT role_id INTO admin_id FROM roles WHERE role_key = 'admin';
    SELECT role_id INTO developer_id FROM roles WHERE role_key = 'developer';
    SELECT role_id INTO beta_tester_id FROM roles WHERE role_key = 'beta_tester';
    SELECT role_id INTO author_id FROM roles WHERE role_key = 'author';
    SELECT role_id INTO advertiser_id FROM roles WHERE role_key = 'advertiser';
    SELECT role_id INTO premium_id FROM roles WHERE role_key = 'premium_consumer';
    SELECT role_id INTO consumer_id FROM roles WHERE role_key = 'consumer';

    -- Root gets all permissions
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT root_id, permission_id FROM permissions
    ON CONFLICT DO NOTHING;

    -- Admin permissions (almost all)
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT admin_id, permission_id FROM permissions 
    WHERE permission_key NOT IN ('roles.manage')
    ON CONFLICT DO NOTHING;

    -- Developer permissions
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT developer_id, permission_id FROM permissions 
    WHERE permission_key IN ('api.access', 'api.manage_keys', 'beta.access', 'content.view_free', 
                             'events.join', 'users.edit_own', 'system.logs')
    ON CONFLICT DO NOTHING;

    -- Beta Tester permissions
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT beta_tester_id, permission_id FROM permissions 
    WHERE permission_key IN ('beta.access', 'content.view_free', 'events.join', 'users.edit_own')
    ON CONFLICT DO NOTHING;

    -- Author permissions
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT author_id, permission_id FROM permissions 
    WHERE permission_key IN ('content.create', 'content.publish', 'content.edit_own', 
                             'content.view_free', 'content.view_premium', 'events.create', 
                             'events.join', 'users.edit_own')
    ON CONFLICT DO NOTHING;

    -- Advertiser permissions
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT advertiser_id, permission_id FROM permissions 
    WHERE permission_key IN ('ads.create', 'ads.manage', 'ads.analytics', 'content.view_free', 
                             'events.join', 'users.edit_own')
    ON CONFLICT DO NOTHING;

    -- Premium Consumer permissions
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT premium_id, permission_id FROM permissions 
    WHERE permission_key IN ('content.view_premium', 'content.view_free', 'events.join', 'users.edit_own')
    ON CONFLICT DO NOTHING;

    -- Consumer permissions (basic)
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT consumer_id, permission_id FROM permissions 
    WHERE permission_key IN ('content.view_free', 'events.join', 'users.edit_own')
    ON CONFLICT DO NOTHING;
END $$;

-- ===================================================================
-- CONTENT MANAGEMENT SYSTEM
-- ===================================================================

-- Create content_categories table
CREATE TABLE IF NOT EXISTS content_categories (
    category_id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    parent_category_id INTEGER REFERENCES content_categories(category_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default categories
INSERT INTO content_categories (name, slug, description) VALUES
    ('Newsletter', 'newsletter', 'Newsletter editions'),
    ('Article', 'article', 'Standalone articles'),
    ('Tutorial', 'tutorial', 'Educational tutorials'),
    ('News', 'news', 'Platform news and updates'),
    ('Community', 'community', 'Community content')
ON CONFLICT (slug) DO NOTHING;

-- Create content table (newsletters, articles, etc.)
CREATE TABLE IF NOT EXISTS content (
    content_id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    subtitle VARCHAR(500),
    body TEXT NOT NULL,
    excerpt TEXT, -- Short summary for listings
    featured_image_url TEXT,
    
    -- Content metadata
    category_id INTEGER REFERENCES content_categories(category_id),
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft, published, archived, scheduled
    content_type VARCHAR(50) NOT NULL DEFAULT 'article', -- article, newsletter, tutorial, etc.
    
    -- Access control
    is_premium BOOLEAN DEFAULT FALSE, -- Requires payment/subscription
    is_free BOOLEAN DEFAULT TRUE, -- Free for all users
    price DECIMAL(10, 2) DEFAULT 0.00, -- One-time purchase price (if applicable)
    
    -- SEO and metadata
    meta_title VARCHAR(255),
    meta_description TEXT,
    tags TEXT[], -- Array of tags
    
    -- Publishing
    published_at TIMESTAMP WITH TIME ZONE,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    
    -- Analytics
    view_count INTEGER DEFAULT 0,
    share_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT check_price CHECK (price >= 0),
    CONSTRAINT check_status CHECK (status IN ('draft', 'published', 'archived', 'scheduled'))
);

-- Create content_authors table (multiple authors per content)
CREATE TABLE IF NOT EXISTS content_authors (
    content_id INTEGER REFERENCES content(content_id) ON DELETE CASCADE,
    author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'author', -- author, co-author, contributor, editor
    contribution_note TEXT,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (content_id, author_id)
);

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
    subscription_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    subscription_tier VARCHAR(50) NOT NULL, -- basic, premium, pro, etc.
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, cancelled, expired, paused
    
    -- Pricing
    price DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    billing_period VARCHAR(20) NOT NULL, -- monthly, yearly, lifetime
    
    -- Dates
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    
    -- Payment
    payment_method VARCHAR(50),
    last_payment_date TIMESTAMP WITH TIME ZONE,
    next_billing_date TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    auto_renew BOOLEAN DEFAULT TRUE,
    trial_end_date TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT check_subscription_status CHECK (status IN ('active', 'cancelled', 'expired', 'paused')),
    CONSTRAINT check_billing_period CHECK (billing_period IN ('monthly', 'yearly', 'lifetime'))
);

-- Create content_purchases table (one-time content purchases)
CREATE TABLE IF NOT EXISTS content_purchases (
    purchase_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    content_id INTEGER REFERENCES content(content_id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    payment_method VARCHAR(50),
    transaction_id VARCHAR(255) UNIQUE,
    purchased_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    access_expires_at TIMESTAMP WITH TIME ZONE, -- Optional expiration
    UNIQUE (user_id, content_id)
);

-- Create content_views table (analytics)
CREATE TABLE IF NOT EXISTS content_views (
    view_id BIGSERIAL PRIMARY KEY,
    content_id INTEGER REFERENCES content(content_id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ip_address INET,
    user_agent TEXT,
    referer TEXT,
    viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reading_time_seconds INTEGER -- How long they spent reading
);

-- Create newsletter_subscriptions table
CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
    subscription_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL, -- Denormalized for easy access
    subscribed BOOLEAN DEFAULT TRUE,
    frequency VARCHAR(20) DEFAULT 'weekly', -- daily, weekly, monthly
    subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    unsubscribed_at TIMESTAMP WITH TIME ZONE,
    UNIQUE (user_id)
);

-- ===================================================================
-- ADVERTISEMENT SYSTEM
-- ===================================================================

-- Create advertisements table
CREATE TABLE IF NOT EXISTS advertisements (
    ad_id SERIAL PRIMARY KEY,
    advertiser_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    
    -- Ad content
    title VARCHAR(255) NOT NULL,
    description TEXT,
    image_url TEXT,
    destination_url TEXT NOT NULL,
    
    -- Placement
    placement VARCHAR(50) NOT NULL, -- banner, sidebar, inline, popup
    content_category_id INTEGER REFERENCES content_categories(category_id),
    
    -- Campaign info
    campaign_name VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending', -- pending, approved, active, paused, completed, rejected
    
    -- Budget and billing
    budget DECIMAL(10, 2),
    cost_per_click DECIMAL(10, 4),
    cost_per_impression DECIMAL(10, 4),
    
    -- Scheduling
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    
    -- Analytics
    impression_count INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT check_ad_status CHECK (status IN ('pending', 'approved', 'active', 'paused', 'completed', 'rejected'))
);

-- ===================================================================
-- API KEYS AND DEVELOPER ACCESS
-- ===================================================================

-- Create api_keys table
CREATE TABLE IF NOT EXISTS api_keys (
    key_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    key_name VARCHAR(100) NOT NULL,
    api_key VARCHAR(255) UNIQUE NOT NULL, -- Hashed key
    key_prefix VARCHAR(10) NOT NULL, -- First few chars for identification
    
    -- Permissions
    scopes TEXT[], -- Array of allowed scopes/permissions
    rate_limit INTEGER DEFAULT 1000, -- Requests per hour
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    
    -- Expiration
    expires_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ===================================================================
-- INDEXES FOR PERFORMANCE
-- ===================================================================

-- Role and permission indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_active ON user_roles(is_active);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);

-- Content indexes
CREATE INDEX IF NOT EXISTS idx_content_author ON content(author_id);
CREATE INDEX IF NOT EXISTS idx_content_status ON content(status);
CREATE INDEX IF NOT EXISTS idx_content_category ON content(category_id);
CREATE INDEX IF NOT EXISTS idx_content_published ON content(published_at);
CREATE INDEX IF NOT EXISTS idx_content_premium ON content(is_premium);
CREATE INDEX IF NOT EXISTS idx_content_tags ON content USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_content_slug ON content(slug);

-- Content authors index
CREATE INDEX IF NOT EXISTS idx_content_authors_content ON content_authors(content_id);
CREATE INDEX IF NOT EXISTS idx_content_authors_author ON content_authors(author_id);

-- Subscription indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON subscriptions(expires_at);

-- Content purchase indexes
CREATE INDEX IF NOT EXISTS idx_content_purchases_user ON content_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_content_purchases_content ON content_purchases(content_id);

-- Advertisement indexes
CREATE INDEX IF NOT EXISTS idx_ads_advertiser ON advertisements(advertiser_id);
CREATE INDEX IF NOT EXISTS idx_ads_status ON advertisements(status);
CREATE INDEX IF NOT EXISTS idx_ads_placement ON advertisements(placement);

-- API key indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);

-- Newsletter subscription index
CREATE INDEX IF NOT EXISTS idx_newsletter_subs_email ON newsletter_subscriptions(email);
CREATE INDEX IF NOT EXISTS idx_newsletter_subs_user ON newsletter_subscriptions(user_id);

-- ===================================================================
-- TRIGGERS
-- ===================================================================

-- Apply updated_at trigger to new tables
DROP TRIGGER IF EXISTS update_roles_updated_at ON roles;
CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_content_updated_at ON content;
CREATE TRIGGER update_content_updated_at BEFORE UPDATE ON content
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_advertisements_updated_at ON advertisements;
CREATE TRIGGER update_advertisements_updated_at BEFORE UPDATE ON advertisements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_api_keys_updated_at ON api_keys;
CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to auto-assign consumer role to new users
CREATE OR REPLACE FUNCTION assign_default_role()
RETURNS TRIGGER AS $$
DECLARE
    consumer_role_id INTEGER;
BEGIN
    SELECT role_id INTO consumer_role_id FROM roles WHERE role_key = 'consumer';
    
    INSERT INTO user_roles (user_id, role_id)
    VALUES (NEW.id, consumer_role_id)
    ON CONFLICT DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_assign_consumer_role ON users;
CREATE TRIGGER auto_assign_consumer_role
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION assign_default_role();

-- Trigger to update content view count
CREATE OR REPLACE FUNCTION increment_content_views()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE content 
    SET view_count = view_count + 1 
    WHERE content_id = NEW.content_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_increment_views ON content_views;
CREATE TRIGGER auto_increment_views
    AFTER INSERT ON content_views
    FOR EACH ROW
    EXECUTE FUNCTION increment_content_views();

