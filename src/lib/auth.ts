import 'server-only';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { db } from '@/db';
import * as schema from '@/db/schema';
export const auth = betterAuth({ database: drizzleAdapter(db, { provider: 'pg', schema }), baseURL: process.env.BETTER_AUTH_URL, secret: process.env.BETTER_AUTH_SECRET, emailAndPassword: { enabled: true, disableSignUp: process.env.ALLOW_REGISTRATION !== 'true', minPasswordLength: 12 }, rateLimit: { enabled: true }, session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 } });
