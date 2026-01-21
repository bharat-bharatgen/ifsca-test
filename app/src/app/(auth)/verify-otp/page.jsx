"use client";
import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form"; // Import Controller
import axios from "axios";
import { getSession, signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp"; // Import OTP components
import { toast } from "@/components/ui/use-toast";
import Image from "next/image";

export default function VerifyOTPPage() {
  // Add `control` from useForm
  const { handleSubmit, getValues, control } = useForm();
  const [session, setSession] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    getSession().then((s) => {
      setSession(s);
    });
  }, []);

  const onSubmit = async (data) => {
    const email = session?.user?.email || data.email;
    if (!email) {
      toast({ variant: "destructive", title: "Missing email", description: "Please enter your email" });
      return;
    }
    setIsVerifying(true);
    try {
      // data.otp will be a 6-digit string
      await axios.post("/api/v1/verify-otp", { email, otpCode: data.otp });
      // Refresh session so JWT reflects emailVerified (align with app-root)
      const updatedSession = await getSession();
      setSession(updatedSession);
      toast({ title: "Verified", description: "Email verified successfully" });
      window.location.href = "/global-chat";
    } catch (e) {
      console.error("[verify-otp] error:", e?.response?.data || e?.message);
      const message = e?.response?.data?.error || "Verification failed";
      toast({ variant: "destructive", title: message });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    const email = session?.user?.email || getValues("email");
    if (!email) {
      toast({ variant: "destructive", title: "Missing email", description: "Please enter your email" });
      return;
    }
    setIsResending(true);
    try {
      const result = await signIn("resend-otp", { email, redirect: false });
      if (result?.error || result?.ok === false) {
        const message = result?.error || "Failed to resend OTP. Please try again.";
        toast({ variant: "destructive", title: message });
      } else {
        toast({ title: "OTP Resent", description: "A new OTP has been sent to your email" });
        // Start 30s cooldown after a successful resend
        setCooldownSeconds(30);
      }
    } catch (e) {
      console.error("[resend-otp] error:", e?.response?.data || e?.message);
      const message = e?.response?.data?.error || "Failed to resend OTP. Please try again.";
      toast({ variant: "destructive", title: message });
    } finally {
      setIsResending(false);
    }
  };

  // Countdown effect for resend cooldown
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timerId = setInterval(() => {
      setCooldownSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timerId);
  }, [cooldownSeconds]);

  return (
    <main className="min-h-dvh grid lg:grid-cols-2">
      {/* Column 1: Image Panel (Hidden on mobile) */}
      <div className="items-center justify-center hidden h-full bg-muted lg:flex">
        <Image
          src="/assets/images/verify-otp.svg"
          alt="Auth Image"
          width={500}
          height={500}
        />
      </div>

      {/* Column 2: Form Panel (Always visible and centered) */}
      <div className="grid place-items-center p-6">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex w-full flex-col justify-center space-y-6 max-w-sm"
        >
          <h1 className="text-2xl font-semibold tracking-tight text-center">
            Verify your account
          </h1>
          <p className="text-sm text-muted-foreground text-center">
            Enter the OTP sent to your email to complete the verification.
          </p>

          {/* === START: NEW OTP INPUT === */}
          <div className="flex justify-center">
            <Controller
              control={control}
              name="otp"
              rules={{ required: "OTP is required", minLength: { value: 6, message: "OTP must be 6 digits" } }}
              render={({ field }) => (
                <InputOTP maxLength={6} {...field}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              )}
            />
          </div>
          {/* === END: NEW OTP INPUT === */}

          {/* === START: CLEANED UP BUTTONS === */}
          <Button className="w-full" type="submit" disabled={isVerifying}>
            {isVerifying ? "Verifying..." : "Verify"}
          </Button>
          <div className="text-center">
            <Button
              type="button"
              variant="link"
              onClick={handleResendOtp}
              disabled={isResending}
            >
              {isResending ? "Resending..." : "Resend OTP"}
            </Button>
          </div>
          {/* === END: CLEANED UP BUTTONS === */}
        </form>
      </div>
    </main>
  );
}