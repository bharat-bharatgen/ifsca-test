
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/custom/theme-toggle";
import { env } from "@/env.mjs";
import { useSession } from "next-auth/react";

export const CustomSheet = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => setIsOpen(open)}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setIsOpen(true)}
        >
          <MenuIcon className="w-6 h-6" />
        </Button>
      </SheetTrigger>
      <SheetContent
        className="flex flex-col justify-between h-full shadow-lg"
        side="left"
      >
        <div className="p-6 space-y-4">
          <Link
            href="/"
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
          <nav className="grid gap-4 text-lg font-medium text-left">
            <Button
              variant="link"
              className="text-left"
              style={{ justifyContent: "flex-start" }}
              onClick={() => {
                setIsOpen(false);
                setTimeout(() => {
                  document
                    .querySelector("#features")
                    ?.scrollIntoView({ behavior: "smooth" });
                }, 200);
              }}
            >
              Features
            </Button>
            <Button
              variant="link"
              className="text-left"
              style={{ justifyContent: "flex-start" }}
              onClick={() => {
                setIsOpen(false);
                setTimeout(() => {
                  document
                    .querySelector("#demo")
                    ?.scrollIntoView({ behavior: "smooth" });
                }, 200);
              }}
            >
              Demo
            </Button>
            <Button
              variant="link"
              className="text-left"
              style={{ justifyContent: "flex-start" }}
              onClick={() => {
                setIsOpen(false);
                setTimeout(() => {
                  document
                    .querySelector("#pricing")
                    ?.scrollIntoView({ behavior: "smooth" });
                }, 200);
              }}
            >
              Pricing
            </Button>
            <Button
              variant="link"
              className="text-left"
              style={{ justifyContent: "flex-start" }}
              onClick={() => {
                setIsOpen(false);
                setTimeout(() => {
                  document
                    .querySelector("#faq")
                    ?.scrollIntoView({ behavior: "smooth" });
                }, 200);
              }}
            >
              Faq
            </Button>
            <Button
              variant="link"
              className="text-left"
              style={{ justifyContent: "flex-start" }}
              onClick={() => {
                setIsOpen(false);
                setTimeout(() => {
                  document
                    .querySelector("#contact")
                    ?.scrollIntoView({ behavior: "smooth" });
                }, 200);
              }}
            >
              Contact
            </Button>
            <Button
              variant="link"
              className="text-left"
              style={{ justifyContent: "flex-start" }}
              onClick={() => {
                setIsOpen(false);
                setTimeout(() => {
                  router.push("/blogs");
                }, 200);
              }}
            >
              Blog
            </Button>
          </nav>
          {!session && (
            <Button
              variant="link"
              className="text-left"
              style={{ justifyContent: "flex-start" }}
              onClick={() => {
                setIsOpen(false);
                setTimeout(() => {
                  router.push("/login");
                }, 200);
              }}
            >
              Login
            </Button>
          )}
        </div>
        <div className="flex justify-between p-6 border-t">
          <ThemeToggle />
        </div>
      </SheetContent>
    </Sheet>
  );
};