import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { SignJWT } from "jose";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/websocket/token
 * Issues a short-lived JWT token for WebSocket authentication
 * Token includes userId and email for BE2 to verify task ownership
 */
export async function GET(req) {
  try {
    // Get authenticated session
    const session = await getServerSession({ req });

    if (!session || !session.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = session.user.id || session.user.email;
    
    // JWT secret - should be shared between BE1 and BE2
    // Use NEXTAUTH_SECRET or JWT_SECRET from environment
    const jwtSecret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
    
    if (!jwtSecret) {
      console.error("[JWT] JWT_SECRET or NEXTAUTH_SECRET not set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Create JWT secret key for jose
    const secretKey = new TextEncoder().encode(jwtSecret);

    // Create JWT payload
    // Token expires in 10 minutes (600 seconds)
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      userId: userId,
      email: session.user.email,
      // taskIds will be validated on the backend when subscribing
      // We include userId so BE2 can verify task ownership
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(now)
      .setExpirationTime(now + 600) // 10 minutes
      .sign(secretKey);

    // Get WebSocket URL - prefer explicit WebSocket URL, fallback to converting HTTP URL
    let wsUrl;
    if (process.env.NEXT_PUBLIC_APP_WS_URL) {
      // Use explicit WebSocket URL if provided (e.g., wss://dms.outriskai.com/api/socket)
      wsUrl = process.env.NEXT_PUBLIC_APP_WS_URL;
    } else {
      // Fallback: convert HTTP URL to WebSocket URL and append /ws/tasks
      const documentApiUrl = process.env.NEXT_PUBLIC_DOCUMENT_API_URL || "http://localhost:9219";
      wsUrl = documentApiUrl.replace(/^http/, "ws");
      wsUrl = `${wsUrl}/ws/tasks`;
    }

    return NextResponse.json({
      token,
      wsUrl,
      expiresIn: 600, // seconds
    });
  } catch (error) {
    console.error("[JWT] Error generating token:", error);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}

