"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icons } from "@/components/icons";
import { toast } from "./ui/use-toast";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTheme } from "next-themes";

const USAGE_ACCOUNT_EMAIL = "usage@example.com";
const USAGE_PAGE_PATH = "/usage";

const schemas = {
  signInWithEmail: z.object({
    email: z
      .string()
      .email("Invalid email address")
      .min(1, "Email is required"),
  }),
  signInWithCredentials: z.object({
    email: z
      .string()
      .email("Invalid email address")
      .min(1, "Email is required"),
    password: z.string().min(8, "Password must be at least 8 characters"),
  }),
  signUpWithEmail: z.object({
    email: z
      .string()
      .email("Invalid email address")
      .min(1, "Email is required"),
  }),
  signUpWithCredentials: z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z
      .string()
      .email("Invalid email address")
      .min(1, "Email is required"),
    password: z.string().min(8, "Password must be at least 8 characters"),
  }),
};

// Function to get the appropriate schema based on formType and providerType
const getSchema = (formType, providerType) => {
  if (formType === "login" && providerType === "email") {
    return schemas.signInWithEmail;
  }
  if (formType === "login" && providerType === "credentials") {
    return schemas.signInWithCredentials;
  }
  if (formType === "register" && providerType === "email") {
    return schemas.signUpWithEmail;
  }
  if (formType === "register" && providerType === "credentials") {
    return schemas.signUpWithCredentials;
  }
  return null;
};

// Custom resolver that dynamically selects the Zod schema
const customResolver = async (data, context, options) => {
  const schema = getSchema(context.formType, context.providerType);

  if (!schema) {
    throw new Error("Invalid form type or provider type.");
  }

  const zodResult = await zodResolver(schema)(data, context, options);

  // Removed the agreeToTerms check
  return zodResult;
};

export const UserAuthForm = ({ className, formType, onSuccess, ...props }) => {
  const router = useRouter();
  const [providerType, setProviderType] = useState("email");
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: customResolver,
    context: { formType, providerType }, // Removed agreeToTerms
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  // Removed agreeToTerms state
  const searchParams = useSearchParams();
  const { theme } = useTheme();

  const googleButtonVariant = theme === "dark" ? "outline" : "secondary";

  const validateFields = (data) => {
    // Basic validation for login - just check if fields are present
    if (formType === "login") {
      if (!data.email || !data.password) {
        toast({
          title: "Required Fields",
          description: "Email and password are required",
          variant: "destructive",
        });
        return false;
      }
      return true;
    }

    // Detailed validation for registration
    if (formType === "register") {
      if (!data.email || !data.password) {
        toast({
          title: "Required Fields",
          description: "Email and password are required",
          variant: "destructive",
        });
        return false;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email)) {
        toast({
          title: "Invalid Email",
          description: "Please enter a valid email address",
          variant: "destructive",
        });
        return false;
      }

      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*])(?=.{8,})/;
      if (!passwordRegex.test(data.password)) {
        toast({
          title: "Invalid Password",
          description:
            "Password must contain at least 8 characters, 1 uppercase letter, 1 lowercase letter, and 1 special character",
          variant: "destructive",
        });
        return false;
      }
    }

    return true;
  };

  // Removed useEffect that checked local storage for agreeToTerms

  const authOnType = async (data) => {
    let authType = "email";
    if (formType === "register") authType = "register";
    else if (formType === "login") authType = "login";

    const signInResult = await signIn(authType, {
      email: data.email.toLowerCase(),
      password: data.password,
      name: data.name,
      redirect: false,
    });

    if (signInResult?.ok) {
      const email = (data.email || "").toLowerCase();
      const isUsageAccount = email === USAGE_ACCOUNT_EMAIL;
      
      if (formType === "register") {
        // For registration, redirect usage account to /usage, others to verify-otp
        window.location.href = isUsageAccount ? USAGE_PAGE_PATH : "/verify-otp";
      } else {
        // For login, redirect usage account to /usage, others to callback URL or /ui-dashboard
        window.location.href = isUsageAccount 
          ? USAGE_PAGE_PATH 
          : (searchParams?.get("from") || "/ui-dashboard");
      }
    }

    return signInResult;
  };

  const onSubmit = async (data) => {
    if (!validateFields(data)) {
      return;
    }

    // Removed the agreeToTerms check
    
    try {
      setIsLoading(true);
      const signInResult = await authOnType(data);
      setIsLoading(false);

      const email = (data.email || "").toLowerCase();
      const isUsageAccount = email === USAGE_ACCOUNT_EMAIL;

      if (!signInResult?.ok) {
        // Special handling for usage account registration error
        if (formType === "register" && isUsageAccount && signInResult?.error === "User already exists") {
          toast({
            title: "Account exists",
            description: "Usage account already exists. Please log in instead.",
            variant: "destructive",
          });
          router.push("/login");
          return;
        }
        
        if (signInResult?.error === "User already exists") {
          toast({
            title: "Registration Failed",
            description:
              "An account with this email already exists. Please try logging in instead.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Authentication Failed",
            description:
              formType === "login"
                ? "Invalid email or password. Please try again."
                : "Failed to create account. Please try again.",
            variant: "destructive",
          });
        }
        return;
      }

      if (formType === "register") {
        // Check if it's usage account - redirect to /usage instead of verify-otp
        // Note: Usage account should be created via seed script, not registration
        if (isUsageAccount) {
          toast({
            title: "Success",
            description: "Account created successfully. Redirecting to usage dashboard.",
          });
          router.push(USAGE_PAGE_PATH);
          return;
        }
        
        toast({
          title: "Check your email.",
          description:
            "A 6-digit OTP has been sent to your email for verification.",
        });
        router.push("/verify-otp");
        return;
      }

      if (formType === "login" && signInResult?.ok) {
        toast({
          title: "Success",
          description: "You have been signed in successfully.",
        });

        // Redirect usage account to /usage page
        if (isUsageAccount) {
          router.push(USAGE_PAGE_PATH);
          return;
        }

        const redirectUrl = searchParams?.get("from") || "/ui-dashboard";
        router.push(redirectUrl);
        return;
      }
    } catch (error) {
      console.error("Authentication error:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Removed handleCheckboxChange function

  return (
    <div className={cn("grid gap-6", className)} {...props}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid gap-2">
          {formType === "register" && (
            <div className="grid gap-2">
              <Label className="sr-only" htmlFor="name">
                Name
              </Label>
              <Input
                id="name"
                placeholder="Name"
                type="text"
                autoComplete="name"
                autoCorrect="off"
                autoFocus={true}
                disabled={isLoading}
                {...register("name")}
              />
              {errors?.name && (
                <p className="px-1 text-sm text-red-600">
                  {errors.name.message}
                </p>
              )}
            </div>
          )}
          <div className="grid gap-1">
            <Label className="sr-only" htmlFor="email">
              Email
            </Label>
            <Input
              id="email"
              placeholder="name@example.com"
              type="email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect="off"
              required={true}
              disabled={isLoading}
              {...register("email")}
            />
            {errors?.email && (
              <p className="px-1 text-sm text-red-600">
                {errors.email.message}
              </p>
            )}
            {/* Input field with Label - Email ===== Ends here */}
          </div>
          {providerType === "credentials" && (
            <div className="grid gap-1">
              {/* Input field with Label - Password */}
              <Label className="sr-only" htmlFor="password">
                Password
              </Label>
              <Input
                id="password"
                placeholder="********"
                type="password"
                autoCapitalize="none"
                autoComplete="password"
                autoCorrect="off"
                disabled={isLoading}
                {...register("password")}
              />
              {errors?.password && (
                <p className="px-1 text-sm text-red-600">
                  {errors.password.message}
                </p>
              )}
            </div>
          )}

          <Button
            type="button"
            onClick={async (e) => {
              e.preventDefault();
              setProviderType("credentials");
              await new Promise((resolve) => setTimeout(resolve, 10));
              await handleSubmit(onSubmit)();
            }}
            className={cn(buttonVariants())}
            disabled={isLoading}
          >
            {isLoading && (
              <Icons.spinner className="w-4 h-4 mr-2 animate-spin" />
            )}
            {formType === "login"
              ? "Sign In with Password"
              : "Sign Up with Password"}
          </Button>
          {/* <div className="relative flex justify-center text-xs uppercase">
            <span className="px-2 bg-background text-muted-foreground">Or</span>
          </div>
          <Button
            type="button"
            onClick={async (e) => {
              e.preventDefault();
              setProviderType("email");
              await new Promise((resolve) => setTimeout(resolve, 10));
              if (providerType === "email") {
                await handleSubmit(onSubmit)();
              }
            }}
            className={cn(buttonVariants())}
            disabled={isLoading}
          >
            {isLoading && (
              <Icons.spinner className="w-4 h-4 mr-2 animate-spin" />
            )}
            {formType === "login"
              ? "Sign In with Magic Link"
              : "Sign Up with Magic Link"}
          </Button> */}
        </div>
      </form>
      {/* <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="px-2 bg-background text-muted-foreground">
            Or continue with
          </span>
        </div>
      </div>
      <Button
        type="button"
        className={cn(buttonVariants({ variant: googleButtonVariant }))}
        onClick={async () => {
          // Removed the if/else check for agreeToTerms
          setIsLoading(true);
          setIsGoogleLoading(true);
            try {
            await signIn("google", {
              callbackUrl: searchParams?.get("from") || "/ui-dashboard",
            });
          } catch (error) {
            setIsLoading(false);
            setIsGoogleLoading(false);
            toast({
              title: "Google sign-in failed",
              description: error?.message || "An error occurred during sign-in.",
              variant: "destructive",
            });
          }
        }}
        disabled={isLoading || isGoogleLoading}
      >
        {isLoading || isGoogleLoading ? (
          <Icons.spinner className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Icons.google className="w-4 h-4 mr-2" />
        )}{" "}
        Google
      </Button> */}
    </div>
  );
};