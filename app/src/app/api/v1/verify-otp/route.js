import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const POST = async (req) => {
  try {
    const { email, otpCode } = await req.json();
    if (!email || !otpCode) {
      return NextResponse.json({ error: "Email and OTP code are required" }, { status: 400 });
    }

    // Find user and verify OTP
    const otp = await prisma.otp.findFirst({
      where: { user: { email }, otpCode, expires: { gt: new Date() } },
      include: { user: true },
    });
    if (!otp) {
      return NextResponse.json({ error: "Invalid or expired OTP code" }, { status: 400 });
    }
    // Update user to mark as verified
    await prisma.user.update({ where: { id: otp.userId }, data: { emailVerified: new Date() } });
    await prisma.otp.delete({ where: { id: otp.id } });
    return NextResponse.json({ message: "OTP verification successful", userId: otp.userId });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
};
