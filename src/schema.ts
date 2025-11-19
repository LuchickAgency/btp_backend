import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  numeric
} from "drizzle-orm/pg-core";

/* --------------------------------------------------
   USERS
-------------------------------------------------- */
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 30 }).default("USER"),
  isEmailVerified: boolean("is_email_verified").default(false).notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

/* --------------------------------------------------
   PROFILES
-------------------------------------------------- */
export const profiles = pgTable("profiles", {
  id: uuid("id").defaultRandom().primaryKey(),

  userId: uuid("user_id").notNull().unique(),

  displayName: varchar("display_name", { length: 100 }).notNull(),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),

  avatarUrl: text("avatar_url"),
  coverUrl: text("cover_url"),

  headline: varchar("headline", { length: 255 }),
  bio: text("bio"),

  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 100 }),

  btpRoles: text("btp_roles"),
  experienceYears: integer("experience_years"),
});

/* --------------------------------------------------
   COMPANIES
-------------------------------------------------- */
export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),

  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),

  siret: varchar("siret", { length: 14 }),
  description: text("description"),

  address: text("address"),
  postalCode: varchar("postal_code", { length: 20 }),
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 100 }),

  phone: varchar("phone", { length: 30 }),
  email: varchar("email", { length: 255 }),
  website: varchar("website", { length: 255 }),

  logoUrl: text("logo_url"),
  bannerUrl: text("banner_url"),

  createdByUserId: uuid("created_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),

  averageRating: numeric("average_rating", { precision: 3, scale: 2 }),
  ratingsCount: integer("ratings_count").default(0).notNull(),
});

/* --------------------------------------------------
   COMPANY MEMBERSHIPS
-------------------------------------------------- */
export const companyMemberships = pgTable("company_memberships", {
  id: uuid("id").defaultRandom().primaryKey(),

  userId: uuid("user_id").notNull(),
  companyId: uuid("company_id").notNull(),

  roles: text("roles").notNull(),
  status: varchar("status", { length: 20 }).default("active"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

/* --------------------------------------------------
   TAGS
-------------------------------------------------- */
export const tags = pgTable("tags", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  label: varchar("label", { length: 100 }).notNull(),
  type: varchar("type", { length: 30 }).notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

/* --------------------------------------------------
   TAG LINKS
-------------------------------------------------- */
export const tagLinks = pgTable("tag_links", {
  id: uuid("id").defaultRandom().primaryKey(),

  tagId: uuid("tag_id").notNull(),
  entityType: varchar("entity_type", { length: 30 }).notNull(),
  entityId: uuid("entity_id").notNull(),
});

/* --------------------------------------------------
   CONTENT
-------------------------------------------------- */
export const content = pgTable("content", {
  id: uuid("id").defaultRandom().primaryKey(),

  type: varchar("type", { length: 30 }).notNull(),

  authorUserId: uuid("author_user_id").notNull(),
  companyId: uuid("company_id"),

  title: varchar("title", { length: 255 }),
  body: text("body"),

  isPublic: boolean("is_public").default(true).notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),

  meta: text("meta"),
});

/* --------------------------------------------------
   WORK REQUESTS
-------------------------------------------------- */
export const workRequests = pgTable("work_requests", {
  id: uuid("id").primaryKey(), // ID fourni manuellement

  requesterUserId: uuid("requester_user_id").notNull(),

  budgetMin: integer("budget_min"),
  budgetMax: integer("budget_max"),

  city: varchar("city", { length: 100 }),
  postalCode: varchar("postal_code", { length: 20 }),

  status: varchar("status", { length: 20 }).default("OPEN"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

/* --------------------------------------------------
   WORK PROPOSALS
-------------------------------------------------- */
export const workProposals = pgTable("work_proposals", {
  id: uuid("id").defaultRandom().primaryKey(),

  workRequestId: uuid("work_request_id").notNull(),
  companyId: uuid("company_id").notNull(),

  proposedAmount: integer("proposed_amount"),
  message: text("message"),

  status: varchar("status", { length: 20 }).default("PENDING"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

/* --------------------------------------------------
   JOB OFFERS
-------------------------------------------------- */
export const jobOffers = pgTable("job_offers", {
  id: uuid("id").primaryKey(),

  companyId: uuid("company_id").notNull(),

  contractType: varchar("contract_type", { length: 50 }),
  locationCity: varchar("location_city", { length: 100 }),
  locationCountry: varchar("location_country", { length: 100 }),

  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),

  status: varchar("status", { length: 20 }).default("OPEN"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

/* --------------------------------------------------
   JOB APPLICATIONS
-------------------------------------------------- */
export const jobApplications = pgTable("job_applications", {
  id: uuid("id").defaultRandom().primaryKey(),

  jobOfferId: uuid("job_offer_id").notNull(),
  applicantUserId: uuid("applicant_user_id").notNull(),

  cvUrl: text("cv_url"),
  message: text("message"),

  status: varchar("status", { length: 20 }).default("PENDING"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

/* --------------------------------------------------
   TENDERS
-------------------------------------------------- */
export const tenders = pgTable("tenders", {
  id: uuid("id").primaryKey(),

  issuingCompanyId: uuid("issuing_company_id").notNull(),

  budgetEstimate: integer("budget_estimate"),
  deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),

  status: varchar("status", { length: 20 }).default("OPEN"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

/* --------------------------------------------------
   TENDER RESPONSES
-------------------------------------------------- */
export const tenderResponses = pgTable("tender_responses", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenderId: uuid("tender_id").notNull(),
  companyId: uuid("company_id").notNull(),

  amount: integer("amount"),
  message: text("message"),

  status: varchar("status", { length: 20 }).default("PENDING"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

/* --------------------------------------------------
   LEGAL ARTICLES (INGEST + Public + Resumés)
-------------------------------------------------- */
export const legalArticles = pgTable("legal_articles", {
  id: uuid("id").primaryKey(),

  title: varchar("title", { length: 500 }),

  body: text("body"),                        // <-- AJOUT ICI

  rawContent: text("raw_content"),
  source: varchar("source", { length: 50 }),
  sourceUrl: text("source_url"),

  publishedAt: timestamp("published_at", { withTimezone: true }),

  autoGenerated: boolean("auto_generated").default(false),
  status: varchar("status", { length: 20 }).default("READY"),

  aiSummary: text("ai_summary"),
  humanSummary: text("human_summary"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});




/* --------------------------------------------------
   LEGAL ARTICLE TAGS
-------------------------------------------------- */
export const legalArticleTags = pgTable("legal_article_tags", {
  id: uuid("id").defaultRandom().primaryKey(),

  articleId: uuid("article_id").notNull(),
  tag: varchar("tag", { length: 50 }).notNull(),
});

/* --------------------------------------------------
   COMMENTS
-------------------------------------------------- */
export const comments = pgTable("comments", {
  id: uuid("id").defaultRandom().primaryKey(),

  contentId: uuid("content_id").notNull(),
  authorUserId: uuid("author_user_id").notNull(),

  body: text("body").notNull(),
  parentCommentId: uuid("parent_comment_id"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

/* --------------------------------------------------
   COMPANY RATINGS
-------------------------------------------------- */
export const companyRatings = pgTable("company_ratings", {
  id: uuid("id").defaultRandom().primaryKey(),

  companyId: uuid("company_id").notNull(),
  userId: uuid("user_id").notNull(),

  rating: integer("rating").notNull(),
  comment: text("comment"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

/* --------------------------------------------------
   COMPANY ADMIN RECOVERY REQUESTS
-------------------------------------------------- */
export const companyAdminRequests = pgTable("company_admin_requests", {
  id: uuid("id").defaultRandom().primaryKey(),

  companyId: uuid("company_id").notNull(),
  userId: uuid("user_id").notNull(),

  status: varchar("status", { length: 20 }).default("pending"),
  domainUsed: varchar("domain_used", { length: 255 }),

  token: varchar("token", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
