import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Protects /admin with HTTP Basic Auth.
// Set env var ADMIN_BASIC_AUTH="username:password" in Vercel.
export function proxy(request: NextRequest) {
  const expected = process.env.ADMIN_BASIC_AUTH;

  if (!expected) {
    return new NextResponse("Admin auth is not configured.", { status: 500 });
  }

  const auth = request.headers.get("authorization");
  if (!auth || !auth.startsWith("Basic ")) {
    return unauthorized();
  }

  const provided = auth.slice(6).trim();
  const expectedB64 = btoa(expected);

  if (provided !== expectedB64) {
    return unauthorized();
  }

  return NextResponse.next();
}

function unauthorized() {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="EAA Scorer Admin", charset="UTF-8"',
    },
  });
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
