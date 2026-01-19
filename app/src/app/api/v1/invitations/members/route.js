import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

/**
 * PATCH /api/v1/invitations/members
 * Update a member's role in the organization
 */
export const PATCH = async (req) => {
  try {
    const session = await getServerSession({ req });
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        organizationMembers: {
          where: { organizationId: session.user.organizationId || undefined },
        },
      },
    });

    if (!currentUser || !currentUser.organizationId) {
      return NextResponse.json(
        { error: "You must belong to an organization" },
        { status: 403 }
      );
    }

    // Check if user is admin
    const membership = currentUser.organizationMembers[0];
    if (!membership || membership.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only organization admins can update member roles" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { memberId, role } = body;

    if (!memberId || !role) {
      return NextResponse.json(
        { error: "Member ID and role are required" },
        { status: 400 }
      );
    }

    if (!["ADMIN", "MEMBER"].includes(role)) {
      return NextResponse.json(
        { error: "Invalid role. Must be ADMIN or MEMBER" },
        { status: 400 }
      );
    }

    // Find the member
    const targetMember = await prisma.organizationMember.findFirst({
      where: {
        id: memberId,
        organizationId: currentUser.organizationId,
      },
    });

    if (!targetMember) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      );
    }

    // Prevent changing own role (to prevent lockout)
    if (targetMember.userId === currentUser.id) {
      return NextResponse.json(
        { error: "You cannot change your own role" },
        { status: 400 }
      );
    }

    // Update the member's role
    const updatedMember = await prisma.organizationMember.update({
      where: { id: memberId },
      data: { role },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({
      message: "Member role updated successfully",
      member: {
        id: updatedMember.id,
        userId: updatedMember.user.id,
        name: updatedMember.user.name,
        email: updatedMember.user.email,
        role: updatedMember.role,
      },
    });
  } catch (error) {
    console.error("PATCH /invitations/members error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
};

/**
 * DELETE /api/v1/invitations/members
 * Remove a member from the organization
 */
export const DELETE = async (req) => {
  try {
    const session = await getServerSession({ req });
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        organizationMembers: {
          where: { organizationId: session.user.organizationId || undefined },
        },
      },
    });

    if (!currentUser || !currentUser.organizationId) {
      return NextResponse.json(
        { error: "You must belong to an organization" },
        { status: 403 }
      );
    }

    // Check if user is admin
    const membership = currentUser.organizationMembers[0];
    if (!membership || membership.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only organization admins can remove members" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get("memberId");

    if (!memberId) {
      return NextResponse.json(
        { error: "Member ID is required" },
        { status: 400 }
      );
    }

    // Find the member
    const targetMember = await prisma.organizationMember.findFirst({
      where: {
        id: memberId,
        organizationId: currentUser.organizationId,
      },
      include: {
        user: true,
      },
    });

    if (!targetMember) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      );
    }

    // Prevent removing yourself
    if (targetMember.userId === currentUser.id) {
      return NextResponse.json(
        { error: "You cannot remove yourself from the organization" },
        { status: 400 }
      );
    }

    // Remove membership and update user's organizationId
    await prisma.$transaction([
      prisma.organizationMember.delete({
        where: { id: memberId },
      }),
      prisma.user.update({
        where: { id: targetMember.userId },
        data: { organizationId: null },
      }),
    ]);

    return NextResponse.json({
      message: "Member removed from organization successfully",
    });
  } catch (error) {
    console.error("DELETE /invitations/members error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
};
