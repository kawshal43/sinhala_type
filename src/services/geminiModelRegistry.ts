export interface GeminiModelInfo {
  name: string;
  displayName: string;
  description?: string;
  supportedGenerationMethods?: string[];
  inputTokenLimit?: number;
}

export type ModelPreference = "flash" | "pro";

interface CachedRegistry {
  timestamp: number;
  models: GeminiModelInfo[];
  preferredCandidate: string | null;
}

export class GeminiModelRegistry {
  private cache = new Map<string, CachedRegistry>();
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  private getKeyId(apiKey: string): string {
    if (!apiKey) return "anonymous";
    // Key identity hash (last 8 characters)
    return apiKey.slice(-8);
  }

  /**
   * Fetches all available Gemini models with pagination support.
   */
  public async discoverModels(apiKey: string): Promise<GeminiModelInfo[]> {
    const keyId = this.getKeyId(apiKey);
    const cached = this.cache.get(keyId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.models;
    }

    const allModels: GeminiModelInfo[] = [];
    let pageToken = "";
    let hasMore = true;

    while (hasMore) {
      const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
      url.searchParams.set("key", apiKey);
      url.searchParams.set("pageSize", "50");
      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const res = await fetch(url.toString(), { method: "GET" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data?.error?.message || `HTTP ${res.status}`;
        throw new Error(`Gemini Model Discovery Failed: ${msg}`);
      }

      const json = await res.json();
      const models: any[] = json.models || [];

      for (const m of models) {
        // Must support content generation and be a gemini model
        const name = (m.name || "").replace(/^models\//, "");
        const methods: string[] = m.supportedGenerationMethods || [];
        if (methods.includes("generateContent") && name.includes("gemini")) {
          allModels.push({
            name,
            displayName: m.displayName || name,
            description: m.description,
            supportedGenerationMethods: methods,
            inputTokenLimit: m.inputTokenLimit
          });
        }
      }

      pageToken = json.nextPageToken || "";
      hasMore = Boolean(pageToken);
    }

    this.cache.set(keyId, {
      timestamp: Date.now(),
      models: allModels,
      preferredCandidate: null
    });

    return allModels;
  }

  /**
   * Ranks candidate model names according to user tier preference.
   */
  public rankModels(
    models: GeminiModelInfo[],
    preference: ModelPreference = "flash",
    lastSuccessfulModel?: string
  ): string[] {
    const names = models.map((m) => m.name);

    const scored = names.map((name) => {
      let score = 0;

      // Bonus for last working model
      if (lastSuccessfulModel && name === lastSuccessfulModel) {
        score += 100;
      }

      const isFlash = name.includes("flash");
      const isPro = name.includes("pro");
      const isLite = name.includes("lite");

      if (preference === "flash") {
        if (isFlash && !isLite) score += 50;
        if (isLite) score += 40;
        if (isPro) score += 10; // Keep pro available as fallback, but ranked lower
      } else {
        if (isPro) score += 50;
        if (isFlash && !isLite) score += 30;
        if (isLite) score += 20;
      }

      // Generation recency scoring
      if (name.includes("2.5")) score += 8;
      else if (name.includes("2.0")) score += 7;
      else if (name.includes("1.5")) score += 5;

      // Penalize legacy / experimental preview models
      if (name.includes("preview") || name.includes("exp")) score -= 5;

      return { name, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.name);
  }

  /**
   * Returns ranked candidate model list for an API key.
   * Falls back to standard verified production models if discovery fails.
   */
  public async getCandidateModels(
    apiKey: string,
    preference: ModelPreference = "flash"
  ): Promise<string[]> {
    const defaultModels = preference === "flash"
      ? ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.0-flash-lite", "gemini-2.5-flash", "gemini-1.5-pro"]
      : ["gemini-1.5-pro", "gemini-2.0-pro", "gemini-2.0-flash", "gemini-1.5-flash"];

    if (!apiKey) return defaultModels;

    try {
      const keyId = this.getKeyId(apiKey);
      const cached = this.cache.get(keyId);
      const lastSuccess = cached?.preferredCandidate || undefined;

      const discovered = await this.discoverModels(apiKey);
      if (discovered.length === 0) return defaultModels;

      return this.rankModels(discovered, preference, lastSuccess);
    } catch {
      return defaultModels;
    }
  }

  /**
   * Remembers a verified model that successfully completed a transcription.
   */
  public rememberSuccessfulModel(apiKey: string, modelName: string): void {
    const keyId = this.getKeyId(apiKey);
    const existing = this.cache.get(keyId);
    if (existing) {
      existing.preferredCandidate = modelName;
    } else {
      this.cache.set(keyId, {
        timestamp: Date.now(),
        models: [],
        preferredCandidate: modelName
      });
    }
  }

  public invalidateCache(apiKey?: string): void {
    if (apiKey) {
      this.cache.delete(this.getKeyId(apiKey));
    } else {
      this.cache.clear();
    }
  }
}

export const geminiModelRegistry = new GeminiModelRegistry();
