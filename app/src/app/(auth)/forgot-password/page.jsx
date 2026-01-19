"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { AuthSkeleton } from "@/components/pages/auth/auth-skeleton";
import axios from "axios";
import { toast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await axios.post("/api/v1/forgot-pass", { email });

      if (response.status === 200) {
        toast({
          title: "Password reset link sent",
          description: "Check your email for a link to reset your password.",
          variant: "default",
        });

        setEmail("");
      }
    } catch (error) {
      console.error("Failed to send reset link:", error);
      const errorMessage =
        error.response?.data?.error || "An unexpected error occurred.";
      toast({
        title: "Failed to send reset link",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container grid flex-col items-center justify-center w-screen h-screen lg:max-w-none lg:grid-cols-2 lg:px-0">
      <div className="items-center justify-center hidden h-full bg-muted lg:flex">
        <Image
          src="/assets/images/forgot-password.svg"
          alt="Forgot Password Image"
          width={500}
          height={500}
        />
      </div>
      <div className="lg:p-8">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <div className="flex flex-col items-center space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              Forgot your password?
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter your email to reset your password
            </p>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button
              type="submit"
              disabled={isLoading}
              className={cn(buttonVariants({ variant: "default" }), "w-full")}
            >
              {isLoading ? "Sending..." : "Send Reset Link"}
            </button>
          </form>
          <p className="px-8 text-sm text-center text-muted-foreground">
            <Link
              href="/login"
              className="underline hover:text-brand underline-offset-4"
            >
              Remember your password? Log In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
