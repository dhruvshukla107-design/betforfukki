/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Relational Database Schema (Cloud SQL PostgreSQL + Drizzle ORM)
 */

import { relations } from 'drizzle-orm';
import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp
} from 'drizzle-orm/pg-core';

// 1. Users Table (Linked directly to Firebase Auth UID)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  photoUrl: text('photo_url'),
  createdAt: timestamp('created_at').defaultNow()
});

// 2. Monitored Zones Table
export const zones = pgTable('zones', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.uid),
  name: text('name').notNull(),
  pointsJson: text('points_json').notNull(),
  color: text('color').notNull(),
  alertOnCategories: text('alert_on_categories').notNull(),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at').defaultNow()
});

// 3. Security Event Ledger & Incidents Table
export const securityEvents = pgTable('security_events', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  trackId: integer('track_id'),
  cls: text('cls').notNull(),
  category: text('category').notNull(),
  confidence: doublePrecision('confidence').notNull(),
  distanceM: doublePrecision('distance_m'),
  zoneName: text('zone_name'),
  status: text('status').notNull().default('new'),
  notes: text('notes'),
  isPossibleWeapon: boolean('is_possible_weapon').default(false),
  createdAt: timestamp('created_at').defaultNow()
});

// 4. Gemini Chatbot Conversation History & Grounding Sources
export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  userId: text('user_id'),
  role: text('role').notNull(), // 'user' | 'model' | 'system'
  content: text('content').notNull(),
  sourcesJson: text('sources_json'), // Google Search citations
  createdAt: timestamp('created_at').defaultNow()
});

// 5. Camera Geographic Locations for Google Maps Integration
export const cameraLocations = pgTable('camera_locations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  address: text('address'),
  streamUrl: text('stream_url'),
  status: text('status').default('online'),
  createdAt: timestamp('created_at').defaultNow()
});

// Relationships
export const usersRelations = relations(users, ({ many }) => ({
  zones: many(zones)
}));

export const zonesRelations = relations(zones, ({ one }) => ({
  user: one(users, {
    fields: [zones.userId],
    references: [users.uid]
  })
}));
