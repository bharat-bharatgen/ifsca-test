import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { UserAuthForm } from "@/components/user-auth-form";
import { Suspense } from "react";
import { AuthSkeleton } from "@/components/pages/auth/auth-skeleton";
import Image from "next/image";
import { env } from "@/env.mjs";

export const metadata = {
  title: `Login | ${env.NEXT_PUBLIC_APP_NAME}`,
  description: `Login to your account to access your favorite features of ${env.NEXT_PUBLIC_APP_NAME}!`,
};

export default function LoginPage() {
  return (
    <div className="container grid flex-col items-center justify-center w-screen h-screen lg:max-w-none lg:grid-cols-2 lg:px-0">
      <Link
        href="/"
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "absolute right-4 top-4 md:right-8 md:top-8"
        )}
      >
        <Icons.chevronLeft className="w-4 h-4 mr-2" />
        Back
      </Link>
      <div className="items-center justify-center hidden h-full bg-muted lg:flex">
        <Image
          src="/assets/images/login.svg"
          alt="Auth Image"
          width={500}
          height={500}
        />
      </div>
      <div className="lg:p-8">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <div className="flex flex-col items-center space-y-2 text-center">
            <Image src="/icon.png" alt="logo" width={50} height={50} />
            <h1 className="text-2xl font-semibold tracking-tight">
              Welcome back
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter your email to sign in to your account
            </p>
          </div>
          <Suspense fallback={<AuthSkeleton />}>
            <UserAuthForm formType="login" />
          </Suspense>
          {/* <p className="px-8 text-sm text-center text-muted-foreground">
            <Link
              href="/register"
              className="underline hover:text-brand underline-offset-4"
            >
              Don&apos;t have an account? Sign Up
            </Link>
          </p> */}
          <p className="px-8 text-sm text-center text-muted-foreground">
            <Link
              href="/forgot-password"
              className="underline hover:text-brand underline-offset-4"
            >
              Forgot password?
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
