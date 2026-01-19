import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";

const USAGE_ACCOUNT_EMAIL = "usage@example.com";

export default async function proxy(req) {
  const { pathname, search } = req.nextUrl;

  // Get the session token
  const token = await getToken({ req });
  const isAuth = !!token;

  // Extract user info from token
  const userEmail = token?.email;
  const userRole = token?.role?.name;
  const isGuest = token?.isGuest;
  const isGoogleUser = token?.provider === "google";
  const isEmailVerified = token?.emailVerified || isGoogleUser;
  const isUsageAccount = userEmail === USAGE_ACCOUNT_EMAIL;

  // Public routes allowed without auth
  const publicRoutes = [
    "/",
    "/login",
    "/register",
    "/verify-otp",
    "/forgot-password",
    "/reset-pass",
  ];
  const isPublic = publicRoutes.some((p) => pathname === p || pathname.startsWith(p + "/"));

  // Always allow Next.js internals and auth endpoints
  const alwaysAllowPrefixes = [
    "/_next/",
    "/favicon.ico",
    "/icon.png",
    "/assets/",
    "/api/auth",
    "/api/v1/verify-otp",
    "/api/v1/forgot-pass",
    "/api/v1/reset-pass",
    "/api/v1/contact",
    "/api/v1/newsletter",
    "/api/v1/register",
    "/api/v1/signup-otp",
    "/api/v1/verify-signup-otp",
    "/api/v1/public", // Public API routes (API key auth handled in route)
  ];
  if (alwaysAllowPrefixes.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check if user is a guest and restrict access
  const restrictedPaths =
    pathname.startsWith("/chats") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/support") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/admin");

  if (isAuth && isGuest && restrictedPaths) {
    return NextResponse.redirect(new URL("/app", req.url));
  }

  // Organization invitation handling
  if (pathname === "/onboarding/create-organization") {
    const inviteToken = req.nextUrl.searchParams.get("invitation");
    if (inviteToken) {
      return NextResponse.redirect(
        new URL(`/organization/join?token=${inviteToken}`, req.url)
      );
    }
  }

  const isAuthPage =
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/reset-pass") ||
    pathname.startsWith("/forgot-password");

  const isVerifyOTPPage = pathname.startsWith("/verify-otp");

  // Allow auth pages without authentication
  if (isAuthPage) {
    // If already authenticated, redirect to app
    if (isAuth) {
      if (!isEmailVerified && !isGoogleUser && !isUsageAccount) {
        return NextResponse.redirect(new URL("/verify-otp", req.url));
      }
      return NextResponse.redirect(new URL("/app", req.url));
    }
    // Allow access to auth pages for unauthenticated users
    return NextResponse.next();
  }

  if (isPublic) {
    return NextResponse.next();
  }

  // Skip OTP verification for Google users
  if (isGoogleUser && isVerifyOTPPage) {
    return NextResponse.redirect(new URL("/app", req.url));
  }

  // Allow access to OTP verification page if authenticated but email not verified
  if (isVerifyOTPPage) {
    if (!isAuth) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (isEmailVerified || isUsageAccount) {
      return NextResponse.redirect(new URL("/app", req.url));
    }
    return NextResponse.next();
  }

  // Check if trying to access /usage page
  const isUsagePage = pathname === "/usage" || pathname.startsWith("/usage/");
  
  // Restrict /usage page to usage account only - redirect others to dashboard
  if (isUsagePage && isAuth && !isUsageAccount) {
    return NextResponse.redirect(new URL("/ui-dashboard", req.url));
  }

  // If accessing /usage page and user is usage account, allow access (even if not verified)
  if (isUsagePage && isUsageAccount) {
    return NextResponse.next();
  }

  // Handle verified cookie for email verification
  const verifiedCookie = req.cookies.get("verified")?.value === "1";

  // Redirect to OTP verification if authenticated but email not verified
  // Skip this check for Google users, auth pages, API routes, and usage account
  if (isAuth && !isEmailVerified && !isGoogleUser && !isUsageAccount && !isAuthPage && !pathname.startsWith("/api/") && !verifiedCookie) {
    return NextResponse.redirect(new URL("/verify-otp", req.url));
  }

  const isAdminPage = pathname.startsWith("/admin");
  const isApi = pathname.startsWith("/api/v1");
  const isBlogPage = pathname.startsWith("/blogs");

  if (isBlogPage) {
    return NextResponse.next();
  }

  if (isApi && !isAuth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (isAdminPage && isAuth && userRole !== "admin") {
    return NextResponse.redirect(new URL("/app", req.url));
  }

  if (isAuth && userRole === "global-chat") {
    const allowedPaths = ["/global-chat", "/api/v1/chat/global", "/api/v1/chat/history", "/api/auth"];
    const isAllowedPath = allowedPaths.some(path => pathname.startsWith(path));
    
    if (!isAllowedPath) {
      return NextResponse.redirect(new URL("/global-chat", req.url));
    }
  }

  if (!isAuth) {
    const url = new URL("/login", req.url);
    const from = pathname + (search || "");
    url.searchParams.set("from", from);
    return NextResponse.redirect(url);
  }

  // If allowing due to verified cookie, clear it once session reflects verification
  const res = NextResponse.next();
  if (verifiedCookie && isEmailVerified) {
    res.cookies.set("verified", "", { path: "/", maxAge: 0 });
  }
  return res;
}

export const config = {
  // Run on all routes except static assets
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|assets).*)"],
};
