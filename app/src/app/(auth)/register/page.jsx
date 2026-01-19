import Link from "next/link";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { UserAuthForm } from "@/components/user-auth-form";
import { AuthSkeleton } from "@/components/pages/auth/auth-skeleton";
import { Suspense } from "react";
import Image from "next/image";
import { env } from "@/env.mjs";

export const metadata = {
  title: `Register | ${env.NEXT_PUBLIC_APP_NAME}`,
  description: `Create an account to get access of ${env.NEXT_PUBLIC_APP_NAME}!`,
};

export default function RegisterPage() {
  return (
    <div className="container grid flex-col items-center justify-center w-screen h-screen lg:max-w-none lg:grid-cols-2 lg:px-0">
      <Link
        href="/login"
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "absolute right-4 top-4 md:right-8 md:top-8"
        )}
      >
        Login
      </Link>
      <div className="items-center justify-center hidden h-full bg-muted lg:flex">
        <Image
          src="/assets/images/register.svg"
          alt="Auth Image"
          width={500}
          height={500}
        />
      </div>
      <div className="lg:p-8">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <div className="flex flex-col items-center space-y-2 text-center">
            <img src="/icon.png" alt="logo" width={50} height={50} />
            <h1 className="text-2xl font-semibold tracking-tight">
              Create an account
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter your email below to create your account
            </p>
          </div>
          <Suspense fallback={<AuthSkeleton />}>
            <UserAuthForm formType="register" />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
