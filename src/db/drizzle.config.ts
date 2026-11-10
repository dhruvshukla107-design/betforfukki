/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Drizzle Kit Configuration for Cloud SQL Schema Migrations
 */

import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

const sqlHost = process.env.SQL_HOST;
const sqlDbName = process.env.SQL_DB_NAME;
const user = process.env.SQL_ADMIN_USER;
const password = process.env.SQL_ADMIN_PASSWORD;

if (!sqlHost) {
  console.warn("SQL_HOST is not set in environment variables.");
}
if (!sqlDbName) {
  console.warn("SQL_DB_NAME is not set in environment variables.");
}
if (!user) {
  console.warn("SQL_ADMIN_USER is not set in environment variables.");
}
if (!password) {
  console.warn("SQL_ADMIN_PASSWORD is not set in environment variables.");
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials: {
    host: sqlHost || '',
    user: user || '',
    password: password || '',
    database: sqlDbName || '',
    ssl: false,
  },
  verbose: true,
});
