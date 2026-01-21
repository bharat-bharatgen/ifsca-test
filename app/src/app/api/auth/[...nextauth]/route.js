import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { compare, hash } from "bcryptjs";
import crypto from "crypto";
import { sendOTPVerificationMail } from "@/lib/otpVerificationMailer";
import { generateOTP } from "@/lib/tokenGenerator";

// Helper function to create organization for new users
const createOrganizationForUser = async (user, orgName) => {
  const organization = await prisma.organization.create({
    data: {
      name: orgName || `${user.name || user.email.split("@")[0]}'s Organization`,
      users: {
        connect: { id: user.id },
      },
      members: {
        create: {
          userId: user.id,
          role: "ADMIN",
        },
      },
    },
  });

  // Update user with organizationId
  await prisma.user.update({
    where: { id: user.id },
    data: { organizationId: organization.id },
  });

  return organization;
};

const handler = NextAuth({
  session: { strategy: "jwt" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          prompt: "select_account"
        }
      }
    }),
    CredentialsProvider({
      name: "Register",
      id: "register",
      credentials: {
        name: { label: "Name", type: "text" },
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const { name, email, password } = credentials || {};
        if (!email || !password) return null;
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
          // If user is verified, they already exist
          if (existing.emailVerified) {
            throw new Error("User already exists");
          }
          // If user exists but not verified, allow re-registration (update password and send new OTP)
        }
        // Ensure default role exists
        let role = await prisma.role.findUnique({ where: { id: 1 } });
        if (!role) {
          const existingByName = await prisma.role.findFirst({ where: { name: "user" } });
          role = existingByName || (await prisma.role.create({ data: { id: 1, name: "user" } }));
        }

        // Create or update user (emailVerified will be set by seed file for usage account)
        const hashed = await hash(password, 10);
        let user;
        if (existing) {
          user = await prisma.user.update({
            where: { email },
            data: { name, password: hashed, emailVerified: null },
          });
        } else {
          user = await prisma.user.create({
            data: { name, email, password: hashed, emailVerified: null, roleId: role.id },
          });

          // Create organization for new user and make them admin
          try {
            await createOrganizationForUser(user, name ? `${name}'s Organization` : undefined);
          } catch (orgError) {
            console.error("[register] Failed to create organization:", orgError);
            // Don't fail registration if org creation fails
          }
        }

        // Generate and send OTP for verification
        const otpCode = generateOTP();
        const expires = new Date(Date.now() + 10 * 60 * 1000);
        // Delete existing OTPs for this user and create new one
        await prisma.otp.deleteMany({ where: { userId: user.id } });
        await prisma.otp.create({ data: { userId: user.id, otpCode, expires } });
        try {
          await sendOTPVerificationMail({ email, otp: otpCode });
        } catch (error) {
          console.error("[otp] Failed to send email:", error);
        }

        return { id: user.id, email, name, emailVerified: user.emailVerified };
      },
    }),
    CredentialsProvider({
      name: "Login",
      id: "login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const { email, password } = credentials || {};
        if (!email || !password) return null;
        // Debug logging to help diagnose 401 issues during login
        try {
          console.log(`[nextauth][login] attempt for email=${email}`);
          const user = await prisma.user.findUnique({ where: { email } });
          if (!user) {
            console.log(`[nextauth][login] no user found for email=${email}`);
            return null;
          }
          if (!user.password) {
            console.log(`[nextauth][login] user has no password set (email=${email})`);
            return null;
          }
          const valid = await compare(password, user.password);
          console.log(`[nextauth][login] password comparison for email=${email} -> ${valid}`);
          if (!valid) return null;

          return { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified };
        } catch (err) {
          console.error('[nextauth][login] error during authorize', err);
          return null;
        }
      },
    }),
    // Resend OTP using same NextAuth endpoint (no new route)
    CredentialsProvider({
      name: "Resend OTP",
      id: "resend-otp",
      credentials: {
        email: { label: "Email", type: "email" },
      },
      authorize: async (credentials) => {
        const { email } = credentials || {};
        if (!email) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (user) {
          const otpCode = generateOTP();
          const expires = new Date(Date.now() + 10 * 60 * 1000);
          // Delete existing OTPs for this user to prevent multiple OTP records
          await prisma.otp.deleteMany({ where: { userId: user.id } });
          await prisma.otp.create({ data: { userId: user.id, otpCode, expires } });
          try { await sendOTPVerificationMail({ email, otp: otpCode }); } catch (error) {
            console.error("[resend-otp] email send failed:", error);
          }
          return { id: user.id, email: user.email, name: user.name };
        }
        // Do not leak existence; return null keeps flow silent
        return null;
      },
    }),
  ],
  callbacks: {
    async redirect({ url, baseUrl }) {

      if (typeof url === "string" && url.startsWith(baseUrl)) {
        return url;
      }
      return `${baseUrl}/global-chat`;
    },
    async jwt({ token, user, account, profile }) {
      // Handle Google Sign In
      if (account?.provider === "google") {
        const randomPassword = await hash(crypto.randomBytes(32).toString('hex'), 10);

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
          where: { email: profile.email },
          include: { organization: true },
        });

        const googleUser = await prisma.user.upsert({
          where: { email: profile.email },
          update: {
            name: profile.name,
            emailVerified: new Date(),
            image: profile.picture
          },
          create: {
            email: profile.email,
            name: profile.name,
            emailVerified: new Date(),
            image: profile.picture,
            password: randomPassword
          }
        });

        // Create organization for new Google users
        if (!existingUser) {
          try {
            await createOrganizationForUser(googleUser, profile.name ? `${profile.name}'s Organization` : undefined);
          } catch (orgError) {
            console.error("[google-auth] Failed to create organization:", orgError);
          }
        }

        token.id = googleUser.id;
        token.email = googleUser.email;
        token.name = googleUser.name;
        token.emailVerified = true;
        token.google = true;
        return token;
      }

      // Handle regular sign in
      if (user) {
        token.id = user.id;
        token.email = user.email || token.email;
        token.emailVerified = user.emailVerified || null;
        // Mark pending if user is not verified
        token.pendingRegistration = !user.emailVerified;
        return token;
      }

      try {
        let dbUser = null;
        if (token?.id && typeof token.id === "string") {
          dbUser = await prisma.user.findUnique({
            where: { id: token.id },
            include: {
              organizationMembers: {
                select: { role: true, organizationId: true }
              }
            }
          });
        }
        if (!dbUser && token?.email) {
          dbUser = await prisma.user.findUnique({
            where: { email: token.email },
            include: {
              organizationMembers: {
                select: { role: true, organizationId: true }
              }
            }
          });
          if (dbUser) token.id = dbUser.id;
        }
        token.emailVerified = dbUser?.emailVerified || null;
        token.organizationId = dbUser?.organizationId || null;
        // Get user's role in their organization
        const orgMembership = dbUser?.organizationMembers?.find(m => m.organizationId === dbUser?.organizationId);
        token.organizationRole = orgMembership?.role || null;
        // Mark pending if user is not verified
        token.pendingRegistration = dbUser ? !dbUser.emailVerified : false;
      } catch (e) {
        // leave token as-is on failure
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id;
        session.user.emailVerified = token.emailVerified || null;
        session.user.image = token.picture || null;
        session.user.organizationId = token.organizationId || null;
        session.user.organizationRole = token.organizationRole || null;
        session.google = token.google || false;
      }
      return session;
    },
  },
  pages: { signIn: "/login", error: "/login" },
});

export { handler as GET, handler as POST };
