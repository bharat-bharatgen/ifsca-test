import { NextResponse } from "next/server";
import { addHours } from "date-fns";
import { prisma } from "@/lib/prisma";
import { generateToken } from "@/lib/tokenGenerator";
import { sendResetPasswordMail } from "@/lib/forgotPasswordMailer";

export const POST = async (req) => {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Only send reset email if user exists, but always return success
    // to prevent email enumeration attacks
    if (user) {
      const token = generateToken();
      const expires = addHours(new Date(), 1);

      await prisma.passwordResetToken.create({
        data: {
          token,
          userId: user.id,
          expires,
        },
      });

      await sendResetPasswordMail({ email, token });
    }

    // Always return generic success message regardless of whether user exists
    return NextResponse.json({
      message: "If an account exists with this email, a password reset link will be sent.",
    });
  } catch (error) {
    console.error("[forgot-pass] Error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
};
