"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Icons } from "./icons";
import { ThemeToggle } from "./custom/theme-toggle";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";
import { Button } from "./ui/button";
import {
  MenuIcon,
  UsersIcon,
  ReceiptText,
  MessageCircleQuestion,
  Settings,
  MessageSquareIcon,
  LayoutDashboardIcon,
} from "lucide-react";
import { SessionProvider, signOut, useSession } from "next-auth/react";
import { UserNav } from "./user-nav";
import { useRouter } from "next/navigation";
import { env } from "@/env.mjs";

const HeaderComponent = () => {
  const { data: session, status, update } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const { pathname } = useRouter();

  const isGuest = session?.user?.isGuest;
  const isLawyer = session?.user?.role?.name === "lawyer";
  const isGlobalChatUser = session?.user?.role?.name === "global-chat";

  // Avoid forcing session refresh loops; rely on initial session

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <header className="z-30 flex items-center justify-between px-6 py-4 border-b-2 bg-background border-muted">
      <div>
        <Link
          href={status === "authenticated" ? "/app" : "/"}
          className="text-lg font-semibold md:hidden"
          prefetch={false}
        >
          <div className="flex items-center gap-2">
            <img src="/icon.png" alt="logo" width={50} height={50} />
            <span className="text-xl font-bold md:text-3xl">
              {env.NEXT_PUBLIC_APP_NAME.slice(0, -2)}
              <span className="text-primary">
                {env.NEXT_PUBLIC_APP_NAME.slice(-2)}
              </span>
            </span>
          </div>
        </Link>
      </div>
      <nav className="items-center hidden gap-4 md:flex">
        <UserNav session={session} />
        <ThemeToggle />
      </nav>
      <Sheet open={isOpen} onOpenChange={(open) => setIsOpen(open)}>
        <SheetTrigger asChild>
          <div className="flex gap-2 md:hidden">
            <UserNav session={session} />
            {isGlobalChatUser ? null : <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setIsOpen(true)}
            >
              <MenuIcon className="w-6 h-6" />
            </Button>}
          </div>
        </SheetTrigger>
        <SheetContent
          className="flex flex-col justify-between h-full shadow-lg"
          side="left"
        >
          <div className="flex-1 p-6 space-y-4">
            <Link
              href={status === "authenticated" ? "/app" : "/"}
              className="flex items-center gap-2 text-xl font-semibold"
              prefetch={false}
              onClick={() => setIsOpen(false)}
            >
              <img src="/icon.png" alt="logo" width={50} height={50} />
              <span className="text-xl font-bold md:text-3xl">
                {env.NEXT_PUBLIC_APP_NAME.slice(0, -2)}
                <span className="text-primary">
                  {env.NEXT_PUBLIC_APP_NAME.slice(-2)}
                </span>
              </span>
            </Link>
            <nav className="grid gap-6">
              {isGlobalChatUser ? (
                <Link
                  href="/global-chat"
                  className="flex items-center gap-2 font-medium text-md"
                  prefetch={false}
                  onClick={() => setIsOpen(false)}
                >
                  <MessageSquareIcon className="w-4 h-4" />
                  Global Chat
                </Link>
              ) : (
                <>
                  <Link
                    href="/ui-dashboard"
                    className="flex items-center gap-2 font-medium text-md"
                    prefetch={false}
                    onClick={() => setIsOpen(false)}
                  >
                    <LayoutDashboardIcon className="w-4 h-4" />
                    Dashboard
                  </Link>
                  <Link
                    href="/contracts"
                    className="flex items-center gap-2 font-medium text-md"
                    prefetch={false}
                    onClick={() => setIsOpen(false)}
                  >
                    <ReceiptText className="w-4 h-4" />
                    Documents
                  </Link>
                  {/* {!isLawyer && (
                    <Link
                      href="/lawyers"
                      className="flex items-center gap-2 font-medium text-md"
                      prefetch={false}
                      onClick={() => setIsOpen(false)}
                    >
                      <UsersIcon className="w-4 h-4" />
                      Marketplace
                    </Link>
                  )}
                  <Link
                    href="/chats"
                    className={
                      isGuest
                        ? "opacity-50 cursor-not-allowed flex items-center gap-2 font-medium text-md"
                        : "flex items-center gap-2 font-medium text-md"
                    }
                    prefetch={false}
                    onClick={() => setIsOpen(false)}
                  >
                    <MessageSquareIcon className="w-4 h-4" />
                    Chats
                  </Link> */}
                </>
              )}
            </nav>
          </div>
          <div className="p-6 border-t">
            {!isGlobalChatUser && (
              <nav className="space-y-4">
                <Link
                  href="/support"
                  className={
                    isGuest
                      ? "opacity-50 cursor-not-allowed flex items-center gap-2 font-medium text-md"
                      : "flex items-center gap-2 font-medium text-md"
                  }
                  prefetch={false}
                  onClick={() => setIsOpen(false)}
                >
                  <MessageCircleQuestion className="w-4 h-4" />
                  Support
                </Link>
                <Link
                  href="/settings"
                  className={
                    isGuest
                      ? "opacity-50 cursor-not-allowed flex items-center gap-2 font-medium text-md"
                      : "flex items-center gap-2 font-medium text-md"
                  }
                  prefetch={false}
                  onClick={() => setIsOpen(false)}
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </Link>
              </nav>
            )}
            <div className="flex justify-between mt-6">
              {isGuest ? (
                <Button
                  onClick={() =>
                    signOut({ callbackUrl: "/login", redirect: true })
                  }
                  variant="ghost"
                  size="sm"
                  className="text-sm font-medium"
                >
                  Create Account
                </Button>
              ) : (
                <Button
                  onClick={() =>
                    signOut({ callbackUrl: "/login", redirect: true })
                  }
                  variant="ghost"
                  size="sm"
                  className="text-sm font-medium"
                >
                  Sign Out
                </Button>
              )}
              <ThemeToggle />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
};

export const AppHeader = () => {
  return (
    <HeaderComponent />
  );
};
