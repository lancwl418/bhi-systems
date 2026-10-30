import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";

// Bearer-token auth for the external /api/v1 support API. The token lives in
// SUPPORT_API_TOKEN (env) and grants read/write on tickets only — these routes
// never touch other tables.

export function requireApiToken(req: NextRequest): NextResponse | null {
  const expected = process.env.SUPPORT_API_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "API not configured (SUPPORT_API_TOKEN missing)" },
      { status: 503 }
    );
  }

  const header = req.headers.get("authorization") ?? "";
  const provided = header.replace(/^Bearer\s+/i, "").trim();

  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  if (!provided || !timingSafeEqual(a, b)) {
    return NextResponse.json(
      { ok: false, error: "Invalid or missing bearer token" },
      { status: 401 }
    );
  }

  return null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// Escape a user-supplied term for use inside PostgREST .or()/.ilike. Commas
// and parens would otherwise break the filter expression.
export function likeTerm(q: string): string {
  return `%${q.replace(/[,()%\\]/g, " ").trim()}%`;
}

export function apiError(message: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}
