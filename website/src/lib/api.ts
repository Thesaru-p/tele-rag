import { createSessionManager } from "../../session.js";
export type Document = {
  id: string;
  file_name: string;
  status: "ready" | "processing" | "failed";
  chunk_count: number;
  error_message?: string;
  created_at: string;
};
export type Business = { id: string; name: string };
export type Telegram = { connected: boolean; username: string | null };
export type Dashboard = {
  documents: number;
  readyDocuments: number;
  chunks: number;
  usage: { used: number; limit: number; month: string };
  conversations: {
    id: string;
    chat_id: string;
    role: string;
    content: string;
    sources: string[];
    created_at: string;
  }[];
  unanswered: { id: string; question: string; created_at: string }[];
};
export type Answer = { answer: string; sources: string[]; supported: boolean };
export type AuthState = "loading" | "signedout" | "signedin" | "recovery";
type Session = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};
export class ApiClient {
  private config?: { supabaseUrl: string; supabaseAnonKey: string };
  private initialization?: Promise<AuthState>;
  private revision = 0;
  readonly sessions;
  constructor(private onExpired: () => void) {
    this.sessions = createSessionManager({
      storage: sessionStorage,
      request: (path: string, body: unknown) => this.auth(path, body),
      onExpired,
    });
  }
  async auth(
    path: string,
    body?: unknown,
    method = "POST",
    token?: string,
  ): Promise<Session> {
    if (!this.config)
      throw new Error(
        "Application settings are not ready. Reload and try again.",
      );
    const headers: Record<string, string> = {
      apikey: this.config.supabaseAnonKey,
      "Content-Type": "application/json",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${this.config.supabaseUrl}/auth/v1/${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        data.msg ||
          data.message ||
          data.error_description ||
          "Authentication failed.",
      );
    return data;
  }
  initialize(): Promise<AuthState> {
    if (!this.initialization) this.initialization = this.load();
    return this.initialization;
  }
  private async load(): Promise<AuthState> {
    const response = await fetch("/api/config");
    if (!response.ok)
      throw new Error(
        "Could not load application settings. Check your server configuration and reload.",
      );
    this.config = await response.json();
    if (!this.config?.supabaseUrl || !this.config.supabaseAnonKey)
      throw new Error(
        "Supabase is not configured. Add its URL and public key to your environment, then restart the server.",
      );
    const hash = new URLSearchParams(location.hash.slice(1));
    if (hash.has("access_token") || hash.has("error_description")) {
      history.replaceState(null, "", location.pathname + location.search);
      if (hash.has("error_description"))
        throw new Error(hash.get("error_description")!);
      const access_token = hash.get("access_token")!;
      await this.auth("user", undefined, "GET", access_token);
      this.sessions.save({
        access_token,
        refresh_token: hash.get("refresh_token"),
        expires_in: Number(hash.get("expires_in")) || 3600,
      });
      return hash.get("type") === "recovery" ? "recovery" : "signedin";
    }
    if (!this.sessions.read()) return "signedout";
    await this.sessions.accessToken();
    return "signedin";
  }
  async signIn(email: string, password: string, signup: boolean) {
    const result = await this.auth(
      signup ? "signup" : "token?grant_type=password",
      { email, password },
    );
    if (!result.access_token) return false;
    this.revision++;
    this.sessions.save(result);
    return true;
  }
  async recover(email: string) {
    await this.auth(
      `recover?redirect_to=${encodeURIComponent(location.origin + "/workspace")}`,
      { email },
    );
  }
  async updatePassword(password: string) {
    await this.auth(
      "user",
      { password },
      "PUT",
      await this.sessions.accessToken(),
    );
  }
  signOut() {
    const token = this.sessions.read()?.access_token;
    this.revision++;
    this.sessions.clear();
    if (token)
      void this.auth("logout", undefined, "POST", token).catch(() => {});
  }
  async api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const started = this.revision;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.sessions.accessToken()}`,
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const request = () =>
      fetch(path, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    let response = await request();
    if (response.status === 401) {
      headers.Authorization = `Bearer ${await this.sessions.accessToken(true)}`;
      response = await request();
    }
    if (started !== this.revision) throw new Error("You have signed out.");
    if (response.status === 401) {
      this.signOut();
      this.onExpired();
      throw new Error("Your session has expired. Sign in again.");
    }
    const data = await response.json().catch(() => {
      throw new Error(
        "The server returned an unexpected response. Please try again.",
      );
    });
    if (!response.ok) throw new Error(data.error || "The request failed.");
    return data;
  }
}
