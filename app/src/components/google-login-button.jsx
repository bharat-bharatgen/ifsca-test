"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { useState } from "react";

export function GoogleLoginButton() {
  const [isLoading, setIsLoading] = useState(false);
  const searchParams = useSearchParams();

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true);
      const from = searchParams.get("from");
      await signIn("google", {
        callbackUrl: from || "/global-chat"
      });
    } catch (error) {
      console.error("Google login error:", error);
      setIsLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full flex items-center justify-center space-x-2"
      onClick={handleGoogleLogin}
      disabled={isLoading}
    >
      {isLoading ? (
        <Icons.spinner className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <Icons.google className="w-4 h-4 mr-2" />
      )}
      <span>Sign in with Google</span>
    </Button>
  );
}