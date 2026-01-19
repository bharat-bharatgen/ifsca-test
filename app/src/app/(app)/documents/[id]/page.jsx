import { DocumentWrapper } from "@/components/pages/app/documents/Preview/context";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

export default async function DocumentView(context) {
  const params = await context.params
  const id = params.id
  const session = await getServerSession();

  if (!session) {
    redirect("/");
  }

  // get user from db
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    redirect("/");
  }

  const document = await prisma.document.findFirst({
    where: {
      id: id,
    },
    include: {
      documentInfo: true,
      documentMetadata: true, // include explicit metadata
    },
  });

  if (!document) {
    notFound();
  }

  if (document.documentType === "GENERATED") {
    // If you have an editor route for documents, redirect there
    // redirect(`/documents/${document.id}/editor`);
  }

  const documentSummary = await prisma.documentSummary.findFirst({
    where: { documentId: document.id, isActive: true },
  });

  const documentChats = await prisma.aiChat.findMany({
    where: { documentId: document.id, userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <DocumentWrapper
      document={document}
      documentInfo={document.documentInfo}
      documentSummary={documentSummary}
      documentChats={documentChats}
      session={session}
      isGuest={false}
    />
  );
}

