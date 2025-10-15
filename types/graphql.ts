/**
 * Shared TypeScript Type Definitions for GraphQL
 * Used by both frontend and backend
 */

import { Request } from 'express';

// ===================================================================
// CONTEXT TYPES
// ===================================================================

export interface GraphQLContext {
  user?: JWTPayload;
  req: Request;
}

export interface JWTPayload {
  id: number;
  email: string;
  roles: string[];
}

// ===================================================================
// DATABASE ROW TYPES
// ===================================================================

export interface UserRow {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  salt: string;
  display_name?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AccountRow {
  account_id: number;
  user_id: number;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  email_verified: boolean;
  phone_verified: boolean;
  balance: string;
  lifetime_max_bac: string;
  last_login?: Date;
  created_at: Date;
}

export interface ContentRow {
  content_id: number;
  title: string;
  slug: string;
  subtitle?: string;
  body: string;
  excerpt?: string;
  featured_image_url?: string;
  content_type: string;
  is_premium: boolean;
  is_free: boolean;
  price: string;
  tags?: string[];
  status: string;
  published_at?: Date;
  view_count: number;
  author_id: number;
  category_id?: number;
  created_at: Date;
  updated_at: Date;
}

export interface EventRow {
  event_id: number;
  name: string;
  description?: string;
  start_time: Date;
  end_time: Date;
  organizer_id: number;
  location?: string;
  max_participants?: number;
  type: number;
  status: number;
  created_at: Date;
  updated_at: Date;
}

export interface SubscriptionRow {
  subscription_id: number;
  user_id: number;
  subscription_tier: string;
  status: string;
  price: string;
  currency: string;
  billing_period: string;
  started_at: Date;
  expires_at?: Date;
  cancelled_at?: Date;
  auto_renew: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CategoryRow {
  category_id: number;
  name: string;
  slug: string;
  description?: string;
  parent_category_id?: number;
  created_at: Date;
}

// ===================================================================
// GRAPHQL RESPONSE TYPES
// ===================================================================

export interface User {
  id: number;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  emailVerified: boolean;
  roles: string[];
  permissions: string[];
  createdAt: string;
}

export interface Content {
  contentId: number;
  title: string;
  slug: string;
  subtitle?: string;
  body: string;
  excerpt?: string;
  featuredImageUrl?: string;
  contentType: string;
  isPremium: boolean;
  isFree: boolean;
  price: number;
  tags: string[];
  status: string;
  publishedAt?: string;
  viewCount: number;
  author?: User;
  category?: Category;
  authors?: ContentAuthor[];
  createdAt: string;
  // Internal fields (not exposed in GraphQL)
  authorId?: number;
  categoryId?: number;
}

export interface ContentAuthor {
  userId: number;
  username: string;
  role: string;
}

export interface Category {
  categoryId: number;
  name: string;
  slug: string;
  description?: string;
}

export interface Event {
  eventId: number;
  name: string;
  description?: string;
  startTime: string;
  endTime: string;
  organizerId: number;
  location?: string;
  maxParticipants?: number;
  type: number;
  status: number;
  createdAt: string;
}

export interface Subscription {
  subscriptionId: number;
  userId: number;
  subscriptionTier: string;
  status: string;
  price: number;
  currency: string;
  billingPeriod: string;
  expiresAt?: string;
  autoRenew: boolean;
  createdAt: string;
}

export interface PageInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ContentConnection {
  content: Content[];
  pageInfo: PageInfo;
}

export interface EventConnection {
  events: Event[];
  pageInfo: PageInfo;
}

// ===================================================================
// INPUT TYPES
// ===================================================================

export interface CreateContentInput {
  title: string;
  body: string;
  subtitle?: string;
  excerpt?: string;
  featuredImageUrl?: string;
  contentType?: string;
  isPremium?: boolean;
  isFree?: boolean;
  price?: number;
  tags?: string[];
  categoryId?: number;
  status?: string;
}

export interface UpdateContentInput {
  title?: string;
  body?: string;
  subtitle?: string;
  excerpt?: string;
  status?: string;
  tags?: string[];
}

export interface SubscribeInput {
  subscriptionTier: string;
  price: number;
  billingPeriod: string;
  paymentMethod?: string;
}

// ===================================================================
// RESOLVER ARGUMENTS
// ===================================================================

export interface ContentArgs {
  page?: number;
  limit?: number;
  status?: string;
  category?: string;
  contentType?: string;
  isPremium?: boolean;
  authorId?: number;
  tags?: string[];
  search?: string;
}

export interface EventArgs {
  page?: number;
  limit?: number;
  status?: number;
}

export interface ContentByIdArgs {
  id: number;
}

export interface ContentBySlugArgs {
  slug: string;
}

export interface EventByIdArgs {
  id: number;
}

export interface UserByIdArgs {
  id: number;
}

export interface CreateContentArgs {
  input: CreateContentInput;
}

export interface UpdateContentArgs {
  contentId: number;
  input: UpdateContentInput;
}

export interface DeleteContentArgs {
  contentId: number;
}

export interface SubscribeArgs {
  input: SubscribeInput;
}

export interface CancelSubscriptionArgs {
  subscriptionId: number;
}

export interface PurchaseContentArgs {
  contentId: number;
  amount: number;
}

export interface SubscribeNewsletterArgs {
  frequency?: string;
}

// ===================================================================
// RESOLVER TYPES
// ===================================================================

export type Resolver<TArgs = any, TResult = any> = (
  args: TArgs,
  context: GraphQLContext
) => Promise<TResult> | TResult;

export interface Resolvers {
  // Queries
  content: Resolver<ContentArgs, ContentConnection>;
  contentById: Resolver<ContentByIdArgs, Content | null>;
  contentBySlug: Resolver<ContentBySlugArgs, Content | null>;
  events: Resolver<EventArgs, EventConnection>;
  eventById: Resolver<EventByIdArgs, Event | null>;
  me: Resolver<{}, User | null>;
  user: Resolver<UserByIdArgs, User | null>;
  mySubscription: Resolver<{}, Subscription | null>;
  myPurchases: Resolver<{}, Content[]>;
  categories: Resolver<{}, Category[]>;

  // Mutations
  createContent: Resolver<CreateContentArgs, Content>;
  updateContent: Resolver<UpdateContentArgs, Content>;
  deleteContent: Resolver<DeleteContentArgs, boolean>;
  subscribe: Resolver<SubscribeArgs, Subscription>;
  cancelSubscription: Resolver<CancelSubscriptionArgs, boolean>;
  purchaseContent: Resolver<PurchaseContentArgs, boolean>;
  subscribeNewsletter: Resolver<SubscribeNewsletterArgs, boolean>;
  unsubscribeNewsletter: Resolver<{}, boolean>;

  // Field resolvers
  Content_author?: (parent: Content) => Promise<User | null>;
  Content_category?: (parent: Content) => Promise<Category | null>;
  Content_authors?: (parent: Content) => Promise<ContentAuthor[]>;
}

