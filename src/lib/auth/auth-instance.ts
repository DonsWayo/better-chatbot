// Base auth instance without "server-only" - can be used in seed scripts
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin as adminPlugin } from "better-auth/plugins";
import { pgDb } from "lib/db/pg/db.pg";
import { headers } from "next/headers";
import {
  AccountTable,
  SessionTable,
  UserTable,
  VerificationTable,
} from "lib/db/pg/schema.pg";
import { eq } from "drizzle-orm";
import { getAuthConfig } from "./config";
import logger from "logger";
import { userRepository } from "lib/db/repository";
import { DEFAULT_USER_ROLE, USER_ROLES } from "app-types/roles";
import { admin, editor, user, ac } from "./roles";
import { roleFromEntraClaims, parseJwtClaims } from "./entra-claims";

const {
  emailAndPasswordEnabled,
  signUpEnabled,
  socialAuthenticationProviders,
} = getAuthConfig();

const options = {
  secret: process.env.BETTER_AUTH_SECRET!,
  plugins: [
    adminPlugin({
      defaultRole: DEFAULT_USER_ROLE,
      adminRoles: [USER_ROLES.ADMIN],
      ac,
      roles: {
        admin,
        editor,
        user,
      },
    }),
    nextCookies(),
  ],
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_BASE_URL,
  user: {
    changeEmail: {
      enabled: true,
    },
    deleteUser: {
      enabled: true,
    },
  },
  database: drizzleAdapter(pgDb, {
    provider: "pg",
    schema: {
      user: UserTable,
      session: SessionTable,
      account: AccountTable,
      verification: VerificationTable,
    },
  }),
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // This hook ONLY runs during user creation (sign-up), not on sign-in
          // Use our optimized getIsFirstUser function with caching
          const isFirstUser = await getIsFirstUser();

          // Set role based on whether this is the first user
          const role = isFirstUser ? USER_ROLES.ADMIN : DEFAULT_USER_ROLE;

          logger.info(
            `User creation hook: ${user.email} will get role: ${role} (isFirstUser: ${isFirstUser})`,
          );

          return {
            data: {
              ...user,
              role,
            },
          };
        },
        // Wave 4: after user record is written, check for Entra group claims and
        // update the role accordingly (ADR-0005). Runs after account row exists.
        after: async (user) => {
          // Don't override a first-user admin grant
          if (user.role === USER_ROLES.ADMIN) return;

          // Look up the account row that was just created for this user
          const accounts = await pgDb
            .select()
            .from(AccountTable)
            .where(eq(AccountTable.userId, user.id as string));

          const microsoftAccount = accounts.find(
            (a) => a.providerId === "microsoft",
          );
          if (!microsoftAccount) return;

          // Prefer id_token (OIDC); fall back to access_token
          // The groups claim is typically in the id_token for Entra ID.
          const tokenToParse =
            microsoftAccount.idToken ?? microsoftAccount.accessToken;

          if (!tokenToParse) {
            // TODO(Wave 4): configure Entra to include group claims in id_token
            // (Token configuration → Groups claim → "Security groups")
            logger.info(
              `Wave 4 Entra claim mapping: no token available for user ${user.id} — skipping group→role mapping`,
            );
            return;
          }

          const claims = parseJwtClaims(tokenToParse);
          const groupIds: string[] = Array.isArray(claims?.groups)
            ? (claims.groups as string[])
            : [];

          if (groupIds.length === 0) {
            // Apply the env-configured default SSO role if set
            const defaultRole = process.env.ASAFE_DEFAULT_SSO_ROLE;
            if (
              defaultRole === "admin" ||
              defaultRole === "editor" ||
              defaultRole === "user"
            ) {
              await pgDb
                .update(UserTable)
                .set({ role: defaultRole })
                .where(eq(UserTable.id, user.id as string));
              logger.info(
                `Wave 4 Entra: no group claims for ${user.email}, applied default SSO role: ${defaultRole}`,
              );
            }
            return;
          }

          const mappedRole = roleFromEntraClaims(groupIds);
          await pgDb
            .update(UserTable)
            .set({ role: mappedRole })
            .where(eq(UserTable.id, user.id as string));

          logger.info(
            `Wave 4 Entra: mapped ${groupIds.length} group claim(s) → role "${mappedRole}" for ${user.email}`,
          );
        },
      },
    },
  },
  emailAndPassword: {
    enabled: emailAndPasswordEnabled,
    disableSignUp: !signUpEnabled,
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60,
    },
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day (every 1 day the session expiration is updated)
  },
  advanced: {
    useSecureCookies:
      process.env.NO_HTTPS == "1"
        ? false
        : process.env.NODE_ENV === "production",
    database: {
      generateId: false,
    },
  },
  account: {
    accountLinking: {
      trustedProviders: (
        Object.keys(
          socialAuthenticationProviders,
        ) as (keyof typeof socialAuthenticationProviders)[]
      ).filter((key) => socialAuthenticationProviders[key]),
    },
  },
  socialProviders: socialAuthenticationProviders,
} satisfies BetterAuthOptions;

export const auth = betterAuth({
  ...options,
  plugins: [...(options.plugins ?? [])],
});

export const getSession = async () => {
  const reqHeaders = await headers();
  try {
    const session = await auth.api.getSession({
      headers: reqHeaders,
    });
    return session ?? null;
  } catch (error) {
    logger.error("Error getting session:", error);
    return null;
  }
};

// Cache the first user check to avoid repeated DB queries
let isFirstUserCache: boolean | null = null;

export const getIsFirstUser = async () => {
  // If we already know there's at least one user, return false immediately
  // This in-memory cache prevents any DB calls once we know users exist
  if (isFirstUserCache === false) {
    return false;
  }

  try {
    // Direct database query - simple and reliable
    const userCount = await userRepository.getUserCount();
    const isFirstUser = userCount === 0;

    // Once we have at least one user, cache it permanently in memory
    if (!isFirstUser) {
      isFirstUserCache = false;
    }

    return isFirstUser;
  } catch (error) {
    logger.error("Error checking if first user:", error);
    // Cache as false on error to prevent repeated attempts
    isFirstUserCache = false;
    return false;
  }
};
