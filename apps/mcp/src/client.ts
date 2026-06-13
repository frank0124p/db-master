/**
 * READONLY REST client for db-master API.
 *
 * This file MUST only contain GET requests and these two allowed POSTs:
 *   - POST /api/v1/ask/link-only  (read-only: no side effects)
 *   - POST /api/v1/ask            (read-only: no side effects)
 *
 * Any HTTP method other than GET or the two allowed POSTs is FORBIDDEN.
 * Enforced by lint rule (no-restricted-syntax) and unit tests.
 */

export interface SearchHit {
  ref: string;
  kind: string;
  label: string;
  definition?: string;
  score: number;
  reasons?: string[];
  owner?: string;
  sensitivity?: string;
  deprecated?: boolean;
  replacedBy?: string;
}

export interface SearchAssetsResult {
  hits: SearchHit[];
  question: string;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: string;
  meta?: Record<string, unknown>;
}

export interface GraphNode {
  ref: string;
  kind: string;
  label: string;
  meta?: Record<string, unknown>;
}

export interface GetAssetResult {
  node: GraphNode;
  edges: GraphEdge[];
}

export interface JoinStep {
  from: string;
  to: string;
  on: string;
  via?: string;
  edgeKind?: string;
}

export interface JoinPathResult {
  from: string;
  to: string;
  steps: JoinStep[];
  totalCost: number;
  caveats?: string[];
}

export interface ConceptCard {
  id: number;
  slug: string;
  name: string;
  stdName: string;
  definition: string;
  aliases: string[];
  domain?: string;
  status: string;
  tableHints?: Array<{ tableName: string; role: string; note?: string }>;
}

export interface AskResult {
  question: string;
  answerFields?: unknown[];
  joinPath?: JoinPathResult;
  sql?: string;
  confidence?: number;
  warnings?: string[];
  abstain?: boolean;
  abstainReason?: string;
}

export class DbMasterClient {
  private readonly baseUrl: string;
  private readonly token: string | undefined;

  constructor(baseUrl: string, token?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    return headers;
  }

  /**
   * Search data assets using the linking engine.
   * Calls POST /api/v1/ask/link-only (READ-ONLY allowed POST).
   */
  async searchAssets(
    query: string,
    topK?: number,
    kinds?: string[],
  ): Promise<SearchAssetsResult> {
    const body: Record<string, unknown> = { question: query };
    if (topK !== undefined) body["top_k"] = topK;
    if (kinds?.length) body["kinds"] = kinds;

    const resp = await fetch(`${this.baseUrl}/api/v1/ask/link-only`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`searchAssets failed (${resp.status}): ${text}`);
    }

    const data = (await resp.json()) as {
      hits?: SearchHit[];
      question?: string;
      linking?: { hits?: SearchHit[] };
    };

    // Handle both possible response shapes
    const hits: SearchHit[] = data.hits ?? data.linking?.hits ?? [];
    return { hits, question: data.question ?? query };
  }

  /**
   * Get a single asset node with all its edges.
   * Calls GET /api/v1/graph/node/:ref (READ-ONLY GET).
   */
  async getAsset(ref: string): Promise<GetAssetResult> {
    const encoded = encodeURIComponent(ref);
    const resp = await fetch(`${this.baseUrl}/api/v1/graph/node/${encoded}`, {
      method: "GET",
      headers: this.buildHeaders(),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`getAsset failed (${resp.status}): ${text}`);
    }

    return (await resp.json()) as GetAssetResult;
  }

  /**
   * Get the join path between two tables/governed wide tables.
   * Calls GET /api/v1/graph/join-path (READ-ONLY GET).
   * Returns null when NOT_CONNECTED (404).
   */
  async getJoinPath(
    from: string,
    to: string,
    maxHops?: number,
  ): Promise<JoinPathResult | null> {
    const params = new URLSearchParams({ from, to });
    if (maxHops !== undefined) params.set("max_hops", String(maxHops));

    const resp = await fetch(
      `${this.baseUrl}/api/v1/graph/join-path?${params.toString()}`,
      {
        method: "GET",
        headers: this.buildHeaders(),
      },
    );

    if (resp.status === 404) {
      return null;
    }

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`getJoinPath failed (${resp.status}): ${text}`);
    }

    return (await resp.json()) as JoinPathResult;
  }

  /**
   * List business concepts/glossary entries.
   * Calls GET /api/v1/knowledge/concepts (READ-ONLY GET).
   */
  async listConcepts(domain?: string, query?: string): Promise<ConceptCard[]> {
    const params = new URLSearchParams();
    if (domain) params.set("domain", domain);
    if (query) params.set("q", query);

    const qs = params.toString();
    const url = `${this.baseUrl}/api/v1/knowledge/concepts${qs ? `?${qs}` : ""}`;

    const resp = await fetch(url, {
      method: "GET",
      headers: this.buildHeaders(),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`listConcepts failed (${resp.status}): ${text}`);
    }

    return (await resp.json()) as ConceptCard[];
  }

  /**
   * Ask a question and wait for the final result (non-streaming).
   * Calls POST /api/v1/ask (READ-ONLY allowed POST).
   * Consumes the SSE stream and returns only the final "result" event.
   */
  async askQuestion(question: string): Promise<AskResult> {
    const resp = await fetch(`${this.baseUrl}/api/v1/ask`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({ question }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`askQuestion failed (${resp.status}): ${text}`);
    }

    const body = await resp.text();
    let lastResult: AskResult | undefined;

    for (const line of body.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6)) as {
          type?: string;
          question?: string;
          answerFields?: unknown[];
          joinPath?: JoinPathResult;
          sql?: string;
          confidence?: number;
          warnings?: string[];
          abstain?: boolean;
          abstainReason?: string;
        };
        if (event.type === "result" || event.type === "done") {
          lastResult = {
            question: event.question ?? question,
            answerFields: event.answerFields,
            joinPath: event.joinPath,
            sql: event.sql,
            confidence: event.confidence,
            warnings: event.warnings,
            abstain: event.abstain,
            abstainReason: event.abstainReason,
          };
        }
      } catch {
        // ignore parse errors for non-JSON lines
      }
    }

    return lastResult ?? { question, abstain: true, abstainReason: "No result event received" };
  }
}
