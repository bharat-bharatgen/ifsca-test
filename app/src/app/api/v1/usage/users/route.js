import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth"; 

const ADMIN_EMAIL = "admin@example.com";

export const GET = async (req) => {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 🧩 Parse pagination from React Admin query params
    const { searchParams } = new URL(req.url);
    const range = JSON.parse(searchParams.get("range") || "[0,9]");
    const start = range[0];
    const end = range[1];
    const take = end - start + 1;

    // ✅ Count total users
    const total = await prisma.user.count();

    // ✅ Fetch paginated users
    const users = await prisma.user.findMany({
      skip: start,
      take,
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });

    // ✅ Add pagination headers
    const res = NextResponse.json(users, { status: 200 });
    res.headers.set("Content-Range", `users ${start}-${end}/${total}`);
    res.headers.set("Access-Control-Expose-Headers", "Content-Range");
    return res;
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
};
