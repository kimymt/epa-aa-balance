import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkBasicAuth } from "@/lib/auth";

// Protects /admin with HTTP Basic Auth.
// Set env var ADMIN_BASIC_AUTH="username:password" in Vercel.
export function proxy(request: NextRequest) {
  const result = checkBasicAuth(
    request.headers.get("authorization"),
    process.env.ADMIN_BASIC_AUTH
  );

  if (result.ok) {
    return NextResponse.next();
  }

  if (result.reason === "missing-config") {
    return new NextResponse("Admin auth is not configured.", { status: 500 });
  }

  return unauthorized();
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
