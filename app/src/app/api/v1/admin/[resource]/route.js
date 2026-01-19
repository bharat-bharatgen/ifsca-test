import { defaultHandler } from "ra-data-simple-prisma";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";

const handler = async (req) => {
  const body = await req.json();

  if (body.params.data && body.params.data.password) {
    const hashedPassword = await hash(body.params.data.password, 10);
    body.params.data.password = hashedPassword;
  }
  if (body.params.data && body.params.data.emailVerified) {
    body.params.data.emailVerified = new Date(body.params.data.emailVerified);
  }

  try {
    const result = await defaultHandler(body, prisma);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error handling request:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};

export { handler as GET, handler as POST };
