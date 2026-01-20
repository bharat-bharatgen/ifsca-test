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
      image: true,
    },
  });

  if (!user) {
    return <SignOutRedirect />;
  }

  return (
    <div className="flex h-screen">
      {/* <aside className="hidden max-w-[200px] flex-col md:flex z-30">
        <AppNav />
      </aside> */}
      <main className="z-20 flex flex-col flex-1 w-full overflow-hidden overflow-y-scroll">
        {children}
      </main>
    </div>
  );
}
