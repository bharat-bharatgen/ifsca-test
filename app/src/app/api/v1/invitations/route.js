import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { generateToken } from "@/lib/tokenGenerator";
import { sendInvitationMail } from "@/lib/invitationMailer";

/**
 * Generate a secure random password
 * @returns {string} A random password with lowercase, uppercase, number, and special char
 */
function generateSecurePassword() {
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";
  const special = "!@#$%^&*";
  
  // Ensure at least one of each required character type
  let password = "";
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  // Fill the rest with random characters from all types
  const allChars = lowercase + uppercase + numbers + special;
  for (let i = 0; i < 8; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password
  return password.split("").sort(() => Math.random() - 0.5).join("");
}

/**
 * POST /api/v1/invitations
 * Send an invitation to a new user
 */
export const POST = async (req) => {
  try {
    const session = await getServerSession({ req });
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get current user with organization membership
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        organization: true,
        organizationMembers: {
          where: { organizationId: session.user.organizationId || undefined },
        },
      },
    });

    if (!currentUser || !currentUser.organizationId) {
      return NextResponse.json(
        { error: "You must belong to an organization to invite users" },
        { status: 403 }
      );
    }

    // Check if user is admin of the organization
    const membership = currentUser.organizationMembers[0];
    if (!membership || membership.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only organization admins can invite users" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { email, name, role = "MEMBER" } = body;

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Check if user already exists with this email
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      // Check if user is already in this organization
      const existingMembership = await prisma.organizationMember.findFirst({
        where: {
          userId: existingUser.id,
          organizationId: currentUser.organizationId,
        },
      });

      if (existingMembership) {
        return NextResponse.json(
          { error: "This user is already a member of your organization" },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: "A user with this email already exists. They can request to join your organization." },
        { status: 400 }
      );
    }

    // Check for existing pending invitation
    const existingInvitation = await prisma.invitation.findFirst({
      where: {
        email: email.toLowerCase(),
        organizationId: currentUser.organizationId,
        status: "PENDING",
      },
    });

    if (existingInvitation) {
      return NextResponse.json(
        { error: "An invitation has already been sent to this email" },
        { status: 400 }
      );
    }

    // Generate password and token
    const generatedPassword = generateSecurePassword();
    const hashedPassword = await hash(generatedPassword, 10);
    const invitationToken = generateToken(32);

    // Ensure default role exists
    let defaultRole = await prisma.role.findUnique({ where: { id: 1 } });
    if (!defaultRole) {
      const existingByName = await prisma.role.findFirst({ where: { name: "user" } });
      defaultRole = existingByName || (await prisma.role.create({ data: { id: 1, name: "user" } }));
    }

    // Create user and invitation in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the new user
      const newUser = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          name: name || email.split("@")[0],
          password: hashedPassword,
          emailVerified: new Date(), // Auto-verify invited users
          roleId: defaultRole.id,
          organizationId: currentUser.organizationId,
        },
      });

      // Create organization membership
      await tx.organizationMember.create({
        data: {
          userId: newUser.id,
          organizationId: currentUser.organizationId,
          role: role === "ADMIN" ? "ADMIN" : "MEMBER",
        },
      });

      // Create invitation record for tracking
      const invitation = await tx.invitation.create({
        data: {
          email: email.toLowerCase(),
          organizationId: currentUser.organizationId,
          role: role === "ADMIN" ? "ADMIN" : "MEMBER",
          status: "ACCEPTED", // Mark as accepted since user is created directly
          token: invitationToken,
          invitedById: currentUser.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });

      return { newUser, invitation };
    });

    // Send invitation email with credentials
    try {
      await sendInvitationMail({
        email: email.toLowerCase(),
        password: generatedPassword,
        organizationName: currentUser.organization.name,
        invitedByName: currentUser.name || currentUser.email,
      });
    } catch (emailError) {
      console.error("[invitation] Failed to send email:", emailError);
      // Don't fail the request, user is created
    }

    return NextResponse.json({
      message: "Invitation sent successfully",
      user: {
        id: result.newUser.id,
        email: result.newUser.email,
        name: result.newUser.name,
      },
    });
  } catch (error) {
    console.error("POST /invitations error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
};

/**
 * GET /api/v1/invitations
 * Get all members and pending invitations for the organization
 */
export const GET = async (req) => {
  try {
    const session = await getServerSession({ req });
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        organization: true,
        organizationMembers: true,
      },
    });

    if (!currentUser || !currentUser.organizationId) {
      return NextResponse.json(
        { error: "You must belong to an organization" },
        { status: 403 }
      );
    }

    // Get all members of the organization
    const members = await prisma.organizationMember.findMany({
      where: { organizationId: currentUser.organizationId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Get pending invitations (if any tracking needed)
    const invitations = await prisma.invitation.findMany({
      where: {
        organizationId: currentUser.organizationId,
        status: "PENDING",
      },
      orderBy: { createdAt: "desc" },
    });

    // Check if current user is admin
    const currentMembership = members.find(m => m.userId === currentUser.id);
    const isAdmin = currentMembership?.role === "ADMIN";

    return NextResponse.json({
      organization: {
        id: currentUser.organization.id,
        name: currentUser.organization.name,
      },
      members: members.map(m => ({
        id: m.id,
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image,
        role: m.role,
        joinedAt: m.createdAt,
      })),
      pendingInvitations: invitations,
      isAdmin,
    });
  } catch (error) {
    console.error("GET /invitations error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
};
