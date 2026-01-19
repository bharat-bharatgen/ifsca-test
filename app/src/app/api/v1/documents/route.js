import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export const GET = async (req) => {
  try {
    const { searchParams } = new URL(req.url);

    // Determine if request is from React Admin (it sends `range`, `sort`, or `filter`)
    const isReactAdmin = searchParams.has("range") || searchParams.has("sort") || searchParams.has("filter");

    // Optional authentication check
    const session = await getServerSession({ req });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate user and get their organization
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    // Default values for UI dashboard (no pagination)
    let skip = 0;
    let take = undefined;
    let orderBy = { uploadedAt: "desc" };
    
    // Filter documents by organization - this is the key for document isolation
    let where = {};
    if (user.organizationId) {
      where.organizationId = user.organizationId;
    } else {
      // If user has no organization, only show their own documents
      where.userId = user.id;
    }

    // If React Admin request — apply pagination, sorting, and filtering
    if (isReactAdmin) {
      const range = JSON.parse(searchParams.get("range") || "[0,9]");
      const sort = JSON.parse(searchParams.get("sort") || `["id","ASC"]`);
      const filter = JSON.parse(searchParams.get("filter") || "{}");

      skip = range[0];
      take = range[1] - range[0] + 1;
      orderBy = { [sort[0]]: sort[1].toLowerCase() };

      for (const key in filter) {
        if (filter[key]) where[key] = { contains: filter[key], mode: "insensitive" };
      }
    }

    // Fetch documents filtered by organization
    const documents = await prisma.document.findMany({
      where,
      orderBy,
      skip,
      take,
    });

    if (isReactAdmin) {
      const total = await prisma.document.count({ where });
      const res = NextResponse.json(documents);
      res.headers.set("Content-Range", `documents ${skip}-${skip + (take || 0) - 1}/${total}`);
      res.headers.set("Access-Control-Expose-Headers", "Content-Range");
      return res;
    } else {
      // UI dashboard expects { documents: [...] }
      return NextResponse.json({ documents });
    }
  } catch (error) {
    console.error("GET /documents error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
};
