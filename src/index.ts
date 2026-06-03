/**
 * SecretVault SDK
 *
 * Connects to a SecretVault server using a linking key — no master key or
 * Supabase credentials needed. All operations go through the REST API.
 *
 * Usage:
 *   import { SecretVault } from '@itsaygea/secretvault-sdk';
 *   const vault = new SecretVault({ serverUrl: 'http://localhost:3004', linkingKey: 'sv_abc...' });
 *   await vault.listSecrets();
 *   await vault.proxyFetch('my-service', '/api/v2/data');
 */

export interface SecretVaultConfig {
  /** SecretVault server URL, e.g. "http://localhost:3004" */
  serverUrl: string;
  /** Linking key for the user, e.g. "sv_abc123..." */
  linkingKey: string;
}

export interface SecretInfo {
  id: string;
  name: string;
  display_name: string | null;
  masked_preview: string | null;
  environment: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string | null;
}

export interface ServiceProfile {
  id: string;
  name: string;
  target_url: string;
  auth_method: string;
  user_secret_name: string | null;
  pass_secret_name: string | null;
  header_name: string | null;
  cookie_name: string | null;
}

export interface UserInfo {
  id: string;
  username: string;
  is_admin: boolean;
  api_key_prefix: string | null;
  created_at: string;
}

export class SecretVault {
  private serverUrl: string;
  private linkingKey: string;

  constructor(config: SecretVaultConfig) {
    this.serverUrl = config.serverUrl.replace(/\/+$/, "");
    this.linkingKey = config.linkingKey;

    if (!this.linkingKey.startsWith("sv_")) {
      throw new Error("Linking key must start with 'sv_'");
    }
  }

  // ── Internal ──────────────────────────────────────────────────────

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.linkingKey}` };
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${this.serverUrl}${path}`, {
      ...options,
      headers: {
        ...this.authHeaders(),
        "Content-Type": "application/json",
        ...(options?.headers ?? {}),
      },
    });

    const body = (await res.json()) as T & { error?: string };
    if ("error" in body && body.error) {
      throw new Error(body.error);
    }
    return body as T;
  }

  // ── User ──────────────────────────────────────────────────────────

  /** Get info about the current user */
  async me(): Promise<UserInfo> {
    return this.request("/api/me");
  }

  // ── Secrets ───────────────────────────────────────────────────────

  /** List all secrets (masked values only) */
  async listSecrets(): Promise<SecretInfo[]> {
    return this.request("/api/secrets");
  }

  /** Search secrets by keyword and/or tags (client-side filtering) */
  async searchSecrets(query: {
    keyword?: string;
    tags?: string[];
  }): Promise<SecretInfo[]> {
    const all = await this.listSecrets();
    let results = all;
    if (query.keyword) {
      const kw = query.keyword.toLowerCase();
      results = results.filter(
        (s) =>
          s.name.toLowerCase().includes(kw) ||
          (s.display_name?.toLowerCase().includes(kw) ?? false),
      );
    }
    if (query.tags?.length) {
      results = results.filter(
        (s) => s.tags?.some((t) => query.tags!.includes(t)),
      );
    }
    return results;
  }

  /** Get a secret reference token and usage example. Never returns raw values. */
  async getSecretReference(
    name: string,
  ): Promise<{ reference: string; masked_preview: string; usage_example: string }> {
    const secrets = await this.listSecrets();
    const secret = secrets.find(
      (s) => s.name === name.toLowerCase() || s.display_name === name,
    );
    if (!secret) throw new Error(`Secret '${name}' not found`);
    return {
      reference: `sv://${this.serverUrl}/secrets/${secret.name}`,
      masked_preview: secret.masked_preview ?? "",
      usage_example: `const vault = new SecretVault({ serverUrl: "${this.serverUrl}", linkingKey: "sv_..." });\nawait vault.proxyFetch("${secret.name.split("_")[0]}", "/path");`,
    };
  }

  /** Create a new secret. The value is encrypted server-side. */
  async createSecret(
    name: string,
    value: string,
    options?: { environment?: string; tags?: string[] },
  ): Promise<{ created: boolean; name: string; display_name: string; masked_preview: string }> {
    return this.request("/api/secrets", {
      method: "POST",
      body: JSON.stringify({
        name,
        value,
        environment: options?.environment ?? "development",
        tags: options?.tags ?? [],
      }),
    });
  }

  /** Rotate a secret's value. The old value is replaced. */
  async rotateSecret(
    name: string,
    newValue: string,
  ): Promise<{ rotated: boolean; name: string; display_name: string; new_masked_preview: string }> {
    return this.request(`/api/secrets/${encodeURIComponent(name)}/rotate`, {
      method: "POST",
      body: JSON.stringify({ new_value: newValue }),
    });
  }

  /** Delete a secret permanently. */
  async deleteSecret(
    name: string,
  ): Promise<{ deleted: boolean; name: string; display_name: string }> {
    return this.request(`/api/secrets/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
  }

  // ── Service Profiles ──────────────────────────────────────────────

  /** List service profiles for the current user */
  async listProfiles(): Promise<ServiceProfile[]> {
    return this.request("/api/service-profiles");
  }

  /** Create a new service profile */
  async createProfile(profile: {
    name: string;
    target_url: string;
    auth_method: "basic" | "bearer" | "header" | "cookie";
    pass_secret_name: string;
    user_secret_name?: string;
    header_name?: string;
    cookie_name?: string;
  }): Promise<ServiceProfile> {
    return this.request("/api/service-profiles", {
      method: "POST",
      body: JSON.stringify(profile),
    });
  }

  /** Delete a service profile */
  async deleteProfile(
    profileId: string,
  ): Promise<{ deleted: boolean }> {
    return this.request(`/api/service-profiles/${profileId}`, {
      method: "DELETE",
    });
  }

  // ── Proxy ─────────────────────────────────────────────────────────

  /**
   * Fetch a URL through the credential proxy for a given service.
   * Handles auth injection automatically — you never see real credentials.
   */
  async proxyFetch(serviceName: string, path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${this.serverUrl}/proxy/${serviceName}${path}`, {
      ...init,
      headers: {
        ...this.authHeaders(),
        ...(init?.headers ?? {}),
      },
    });
  }

  /**
   * Get the proxy URL for a service.
   * Use with proxyHeaders() for manual fetch calls.
   */
  proxyUrl(serviceName: string, path = "/"): string {
    return `${this.serverUrl}/proxy/${serviceName}${path}`;
  }

  /**
   * Get the authorization headers needed for proxy access.
   */
  proxyHeaders(): Record<string, string> {
    return this.authHeaders();
  }
}
