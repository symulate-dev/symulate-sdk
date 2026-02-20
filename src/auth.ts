import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { PLATFORM_CONFIG } from "./platformConfig";

const AUTH_CONFIG_DIR = path.join(os.homedir(), ".symulate");
const AUTH_CONFIG_FILE = path.join(AUTH_CONFIG_DIR, "auth.json");

export interface AuthSession {
  sessionToken: string;
  userId: string;
  email: string;
  expiresAt: number;
  accessToken?: string;
  // Organization and project context
  currentOrgId?: string;
  currentProjectId?: string;
}

/**
 * Generate a random session token for CLI authentication
 */
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Ensure the auth config directory exists
 */
function ensureAuthDir(): void {
  if (!fs.existsSync(AUTH_CONFIG_DIR)) {
    fs.mkdirSync(AUTH_CONFIG_DIR, { recursive: true });
  }
}

/**
 * Decode JWT and check if it's expired
 */
function isJwtExpired(token: string): boolean {
  try {
    // JWT format: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) {
      return true;
    }

    // Decode payload (base64url)
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

    // Check expiration (exp is in seconds, Date.now() is in milliseconds)
    if (payload.exp) {
      return payload.exp * 1000 < Date.now();
    }

    // If no exp claim, consider it expired
    return true;
  } catch (error) {
    // If we can't decode it, consider it expired
    return true;
  }
}

/**
 * Refresh the JWT access token using the session token
 */
async function refreshAccessToken(session: AuthSession): Promise<string | null> {
  try {
    const pollUrl = PLATFORM_CONFIG.api.authPoll;

    const response = await fetch(pollUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": PLATFORM_CONFIG.supabase.anonKey,
        "Authorization": `Bearer ${PLATFORM_CONFIG.supabase.anonKey}`,
      },
      body: JSON.stringify({ sessionToken: session.sessionToken }),
    });

    if (response.ok) {
      const data = await response.json() as { authenticated?: boolean; accessToken?: string };
      if (data.authenticated && data.accessToken) {
        return data.accessToken;
      }
    }

    return null;
  } catch (error) {
    console.error("[Symulate] Failed to refresh access token:", error);
    return null;
  }
}

/**
 * Get the current auth session from local storage
 */
export function getAuthSession(): AuthSession | null {
  try {
    if (!fs.existsSync(AUTH_CONFIG_FILE)) {
      return null;
    }

    const content = fs.readFileSync(AUTH_CONFIG_FILE, "utf-8");
    const session: AuthSession = JSON.parse(content);

    // Check if session is expired
    if (session.expiresAt && session.expiresAt < Date.now()) {
      console.log("[Symulate] Session expired. Please run 'npx symulate login'");
      return null;
    }

    // Check if JWT access token is expired
    if (session.accessToken && isJwtExpired(session.accessToken)) {
      console.log("[Symulate] Access token expired, refreshing...");
      // Don't use async here - return a promise that callers can await if needed
      // For now, just mark as expired and user needs to login
      // TODO: Implement proper async refresh in a separate function
      console.log("[Symulate] Please run 'npx symulate login' to refresh your session");
      return null;
    }

    return session;
  } catch (error) {
    console.warn("[Symulate] Failed to read auth session:", error);
    return null;
  }
}

/**
 * Get auth session with automatic token refresh
 * Use this for API calls that need a valid access token
 */
export async function getAuthSessionWithRefresh(): Promise<AuthSession | null> {
  try {
    if (!fs.existsSync(AUTH_CONFIG_FILE)) {
      return null;
    }

    const content = fs.readFileSync(AUTH_CONFIG_FILE, "utf-8");
    const session: AuthSession = JSON.parse(content);

    // Check if session is expired
    if (session.expiresAt && session.expiresAt < Date.now()) {
      console.log("[Symulate] Session expired. Please run 'npx symulate login'");
      return null;
    }

    // Check if JWT access token is expired and refresh if needed
    if (session.accessToken && isJwtExpired(session.accessToken)) {
      console.log("[Symulate] Access token expired, refreshing...");
      const newAccessToken = await refreshAccessToken(session);

      if (newAccessToken) {
        session.accessToken = newAccessToken;
        saveAuthSession(session);
        console.log("[Symulate] ✓ Access token refreshed");
        return session;
      } else {
        console.log("[Symulate] Failed to refresh token. Please run 'npx symulate login'");
        return null;
      }
    }

    return session;
  } catch (error) {
    console.warn("[Symulate] Failed to read auth session:", error);
    return null;
  }
}

/**
 * Save the auth session to local storage
 */
export function saveAuthSession(session: AuthSession): void {
  try {
    ensureAuthDir();
    fs.writeFileSync(AUTH_CONFIG_FILE, JSON.stringify(session, null, 2), "utf-8");
    console.log("[Symulate] ✓ Session saved");
  } catch (error) {
    console.error("[Symulate] Failed to save auth session:", error);
    throw error;
  }
}

/**
 * Clear the auth session from local storage
 */
export function clearAuthSession(): void {
  try {
    if (fs.existsSync(AUTH_CONFIG_FILE)) {
      fs.unlinkSync(AUTH_CONFIG_FILE);
      console.log("[Symulate] ✓ Session cleared");
    }
  } catch (error) {
    console.warn("[Symulate] Failed to clear auth session:", error);
  }
}

/**
 * Get org/project context from the old session file (even if expired)
 */
function getPreviousContext(): { orgId?: string; projectId?: string } {
  try {
    if (!fs.existsSync(AUTH_CONFIG_FILE)) {
      return {};
    }

    const content = fs.readFileSync(AUTH_CONFIG_FILE, "utf-8");
    const session: AuthSession = JSON.parse(content);

    return {
      orgId: session.currentOrgId,
      projectId: session.currentProjectId,
    };
  } catch (error) {
    return {};
  }
}

/**
 * Poll the platform API to check if authentication succeeded
 */
async function pollAuthStatus(sessionToken: string, maxAttempts = 60): Promise<AuthSession | null> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const pollUrl = PLATFORM_CONFIG.api.authPoll;

      const response = await fetch(pollUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": PLATFORM_CONFIG.supabase.anonKey,
          "Authorization": `Bearer ${PLATFORM_CONFIG.supabase.anonKey}`,
        },
        body: JSON.stringify({ sessionToken }),
      });

      if (response.ok) {
        const data = await response.json() as {
          authenticated?: boolean;
          userId?: string;
          email?: string;
          expiresAt?: string | number;
          accessToken?: string;
          defaultOrgId?: string;
          defaultProjectId?: string;
        };

        if (data.authenticated && data.userId && data.email && data.expiresAt) {
          // Get previously used org/project even if session is expired
          const previousContext = getPreviousContext();

          return {
            sessionToken,
            userId: data.userId,
            email: data.email,
            expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : new Date(data.expiresAt).getTime(),
            accessToken: data.accessToken,
            // Prioritize: 1) server defaults (current system), 2) previous session context (if no server default), 3) undefined
            // This ensures switching between Supabase instances uses the correct org/project
            currentOrgId: data.defaultOrgId || previousContext.orgId,
            currentProjectId: data.defaultProjectId || previousContext.projectId,
          };
        }
      }

      // Wait 2 seconds before next poll
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error("[Symulate] Polling error:", error);
    }
  }

  return null;
}

/**
 * Create an unauthenticated session record in the database
 */
async function createSessionRecord(sessionToken: string): Promise<boolean> {
  try {
    const response = await fetch(`${PLATFORM_CONFIG.api.rest}/cli_sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": PLATFORM_CONFIG.supabase.anonKey,
        "Authorization": `Bearer ${PLATFORM_CONFIG.supabase.anonKey}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify({
        session_token: sessionToken,
        authenticated: false,
        user_id: null,
      }),
    });

    if (!response.ok) {
      console.error("[Symulate] Failed to create session. Please try again.");
      return false;
    }

    return true;
  } catch (error) {
    console.error("[Symulate] Error creating session. Please try again.");
    return false;
  }
}

/**
 * Initiate CLI login flow
 * 1. Generate session token
 * 2. Create session record in database
 * 3. Open browser to platform auth page
 * 4. Poll for auth completion
 * 5. Save session locally
 */
export async function login(): Promise<boolean> {
  const sessionToken = generateSessionToken();

  // Create initial session record in database
  console.log("[Symulate] Creating session...");
  const sessionCreated = await createSessionRecord(sessionToken);

  if (!sessionCreated) {
    console.error("[Symulate] ✗ Failed to create session. Please try again.");
    return false;
  }

  const authUrl = `${PLATFORM_CONFIG.platformUrl}/auth/cli?token=${sessionToken}`;

  console.log("\n[Symulate] Opening browser for authentication...");
  console.log(`If the browser doesn't open automatically, visit:\n  ${authUrl}\n`);

  // Open browser (cross-platform)
  try {
    const open = await import("open");
    await open.default(authUrl);
  } catch (error) {
    console.warn("[Symulate] Could not open browser automatically");
  }

  console.log("[Symulate] Waiting for authentication...");
  console.log("[Symulate] (This may take up to 2 minutes)\n");

  const session = await pollAuthStatus(sessionToken);

  if (session) {
    saveAuthSession(session);
    console.log(`\n[Symulate] ✓ Successfully authenticated as ${session.email}`);

    // Fetch and show org/project names
    if (session.currentOrgId && session.currentProjectId) {
      try {
        const authHeader = session.accessToken
          ? `Bearer ${session.accessToken}`
          : `Bearer ${PLATFORM_CONFIG.supabase.anonKey}`;

        // Fetch organization details
        const orgResponse = await fetch(
          `${PLATFORM_CONFIG.api.rest}/organization_members?select=role,organizations(name,slug)&organization_id=eq.${session.currentOrgId}&user_id=eq.${session.userId}`,
          {
            headers: {
              apikey: PLATFORM_CONFIG.supabase.anonKey,
              Authorization: authHeader,
              "Content-Type": "application/json",
            },
          }
        );

        // Fetch project details
        const projectResponse = await fetch(
          `${PLATFORM_CONFIG.api.rest}/projects?id=eq.${session.currentProjectId}&select=name,slug`,
          {
            headers: {
              apikey: PLATFORM_CONFIG.supabase.anonKey,
              Authorization: authHeader,
              "Content-Type": "application/json",
            },
          }
        );

        let orgName = session.currentOrgId;
        let projectName = session.currentProjectId;

        if (orgResponse.ok) {
          const orgData = (await orgResponse.json()) as any[];
          if (orgData.length > 0 && orgData[0].organizations) {
            const org = Array.isArray(orgData[0].organizations)
              ? orgData[0].organizations[0]
              : orgData[0].organizations;
            orgName = `${org.name} (${org.slug})`;
          }
        }

        if (projectResponse.ok) {
          const projectData = (await projectResponse.json()) as any[];
          if (projectData.length > 0) {
            projectName = `${projectData[0].name} (${projectData[0].slug})`;
          }
        }

        console.log(`[Symulate] ✓ Auto-selected organization and project`);
        console.log(`[Symulate]   Organization: ${orgName}`);
        console.log(`[Symulate]   Project: ${projectName}`);
      } catch (error) {
        console.log(`[Symulate] ✓ Auto-selected organization and project`);
        console.log(`[Symulate]   Organization ID: ${session.currentOrgId}`);
        console.log(`[Symulate]   Project ID: ${session.currentProjectId}`);
      }
      console.log(`\n[Symulate] 💡 Tip: You can switch organizations or projects anytime:`);
      console.log(`[Symulate]   • npx symulate orgs list`);
      console.log(`[Symulate]   • npx symulate projects list`);
    } else if (session.currentOrgId) {
      try {
        const authHeader = session.accessToken
          ? `Bearer ${session.accessToken}`
          : `Bearer ${PLATFORM_CONFIG.supabase.anonKey}`;

        const orgResponse = await fetch(
          `${PLATFORM_CONFIG.api.rest}/organizations?id=eq.${session.currentOrgId}&select=name,slug`,
          {
            headers: {
              apikey: PLATFORM_CONFIG.supabase.anonKey,
              Authorization: authHeader,
              "Content-Type": "application/json",
            },
          }
        );

        if (orgResponse.ok) {
          const orgs = (await orgResponse.json()) as any[];
          if (orgs.length > 0) {
            console.log(`[Symulate] ✓ Auto-selected organization: ${orgs[0].name} (${orgs[0].slug})`);
          } else {
            console.log(`[Symulate] ✓ Auto-selected organization: ${session.currentOrgId}`);
          }
        } else {
          console.log(`[Symulate] ✓ Auto-selected organization: ${session.currentOrgId}`);
        }
      } catch (error) {
        console.log(`[Symulate] ✓ Auto-selected organization: ${session.currentOrgId}`);
      }
      console.log(`[Symulate] ⚠️  No projects found. Create one at https://platform.symulate.dev/dashboard/projects`);
    } else {
      console.log(`[Symulate] ⚠️  No organizations found. One should be created automatically.`);
      console.log(`[Symulate]   Visit https://platform.symulate.dev/dashboard to set up your account`);
    }

    return true;
  } else {
    console.log("\n[Symulate] ✗ Authentication timed out or failed");
    console.log("[Symulate] Please try again with 'npx symulate login'");
    return false;
  }
}

/**
 * Logout - clear the local session
 */
export function logout(): void {
  clearAuthSession();
  console.log("[Symulate] ✓ Logged out successfully");
}

/**
 * Get info about the current authenticated user
 */
export async function whoami(): Promise<void> {
  const session = getAuthSession();

  if (!session) {
    console.log("[Symulate] Not authenticated");
    console.log("[Symulate] Run 'npx symulate login' to authenticate");
    return;
  }

  console.log("\n[Symulate] Current User:");
  console.log(`  Email: ${session.email}`);
  console.log(`  User ID: ${session.userId}`);

  // Fetch organization and project details if available
  if (session.currentOrgId) {
    try {
      const authHeader = session.accessToken
        ? `Bearer ${session.accessToken}`
        : `Bearer ${PLATFORM_CONFIG.supabase.anonKey}`;

      // Fetch organization details with user role
      const orgResponse = await fetch(
        `${PLATFORM_CONFIG.api.rest}/organization_members?select=role,organizations(name,slug)&organization_id=eq.${session.currentOrgId}&user_id=eq.${session.userId}`,
        {
          headers: {
            apikey: PLATFORM_CONFIG.supabase.anonKey,
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
        }
      );

      if (orgResponse.ok) {
        const orgData = (await orgResponse.json()) as any[];
        if (orgData.length > 0 && orgData[0].organizations) {
          const org = Array.isArray(orgData[0].organizations)
            ? orgData[0].organizations[0]
            : orgData[0].organizations;
          const role = orgData[0].role;
          console.log(`  Current Organization: ${org.name} (${org.slug})`);
          console.log(`    ID: ${session.currentOrgId}`);
          console.log(`    Your Role: ${role}`);
        } else {
          console.log(`  Current Organization: ${session.currentOrgId}`);
        }
      } else {
        console.log(`  Current Organization: ${session.currentOrgId}`);
      }
    } catch (error) {
      console.log(`  Current Organization: ${session.currentOrgId}`);
    }
  }

  if (session.currentProjectId) {
    try {
      const authHeader = session.accessToken
        ? `Bearer ${session.accessToken}`
        : `Bearer ${PLATFORM_CONFIG.supabase.anonKey}`;

      const projectResponse = await fetch(
        `${PLATFORM_CONFIG.api.rest}/projects?id=eq.${session.currentProjectId}&select=name,slug`,
        {
          headers: {
            apikey: PLATFORM_CONFIG.supabase.anonKey,
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
        }
      );

      if (projectResponse.ok) {
        const projects = (await projectResponse.json()) as any[];
        if (projects.length > 0) {
          const project = projects[0];
          console.log(`  Current Project: ${project.name} (${project.slug})`);
          console.log(`    ID: ${session.currentProjectId}`);
        } else {
          console.log(`  Current Project: ${session.currentProjectId}`);
        }
      } else {
        console.log(`  Current Project: ${session.currentProjectId}`);
      }
    } catch (error) {
      console.log(`  Current Project: ${session.currentProjectId}`);
    }
  }

  console.log(`  Expires: ${new Date(session.expiresAt).toLocaleString()}`);
  console.log();
}

/**
 * Get current organization and project context
 */
export function getCurrentContext(): {
  orgId?: string;
  projectId?: string;
} {
  const session = getAuthSession();
  if (!session) {
    return {};
  }

  return {
    orgId: session.currentOrgId,
    projectId: session.currentProjectId,
  };
}

/**
 * Set the current organization context
 */
export function setCurrentOrganization(orgId: string): void {
  const session = getAuthSession();

  if (!session) {
    console.error("[Symulate] No active session. Please login first.");
    return;
  }

  session.currentOrgId = orgId;
  // Clear project when switching organizations
  session.currentProjectId = undefined;

  saveAuthSession(session);
  console.log(`[Symulate] ✓ Switched to organization: ${orgId}`);
}

/**
 * Set the current project context
 */
export function setCurrentProject(projectId: string): void {
  const session = getAuthSession();

  if (!session) {
    console.error("[Symulate] No active session. Please login first.");
    return;
  }

  if (!session.currentOrgId) {
    console.error(
      "[Symulate] No organization selected. Please select an organization first."
    );
    return;
  }

  session.currentProjectId = projectId;
  saveAuthSession(session);
  console.log(`[Symulate] ✓ Switched to project: ${projectId}`);
}
