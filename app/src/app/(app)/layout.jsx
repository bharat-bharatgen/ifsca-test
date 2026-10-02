import { AppNav } from "@/components/app-nav";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { SignOutRedirect } from "@/components/signout";
import { env } from "@/env.mjs";

export const metadata = {
  title: `App | ${env.NEXT_PUBLIC_APP_NAME}`,
  description: `${env.NEXT_PUBLIC_APP_NAME} is the lawyer you need to analyze your documents and agreements.`,
};

export default async function AppLayout({ children }) {
  const session = await getServerSession();

  if (!session) {
    return <SignOutRedirect />;
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      email: true,
      name: true,
      emailVerified: true,
      roleId: true,
      role: { select: { name: true } },
      image: true,
    },
  });

  if (!user) {
    return <SignOutRedirect />;
  }

  return (
    <div className="workspace-shell flex h-dvh flex-col">
      <AppNav roleName={user.role?.name} />
      <main className="flex flex-1 flex-col min-w-0 min-h-0 overflow-y-auto">{children}</main>
    </div>
  );
}
