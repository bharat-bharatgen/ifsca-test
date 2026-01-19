const { PrismaClient } = require("@prisma/client");
const { hash } = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seeding...");

  try {
    // Check if default role exists, create if not
    let userRole = await prisma.role.findFirst({
      where: { name: "user" }
    });

    if (!userRole) {
      console.log("📝 Creating default 'user' role...");
      userRole = await prisma.role.create({
        data: { name: "user" }
      });
      console.log("✅ Created 'user' role with ID:", userRole.id);
    } else {
      console.log("✅ 'user' role already exists with ID:", userRole.id);
    }

    // Create usage@example.com user if it doesn't exist
    const existingUsageUser = await prisma.user.findFirst({
      where: {
        email: "usage@example.com",
      },
    });

    if (!existingUsageUser) {
      console.log("📊 Creating usage@example.com user...");
      const usagePassword = await hash("ssingularity123", 10);

      const usageUser = await prisma.user.create({
        data: {
          email: "usage@example.com",
          name: "Usage Monitor",
          password: usagePassword,
          roleId: userRole.id,
          emailVerified: new Date(), // Auto-verified, no OTP needed
        },
      });
      console.log("✅ Usage user created successfully:", usageUser.email);
      console.log("   - Email: usage@example.com");
      console.log("   - Status: Verified (no OTP required)");
    } else {
      console.log("✅ Usage user already exists");
      
      // Update existing user to ensure it's verified (only update if not verified)
      if (!existingUsageUser.emailVerified) {
        await prisma.user.update({
          where: { id: existingUsageUser.id },
          data: {
            emailVerified: new Date(), // Ensure it's verified
          },
        });
        console.log("✅ Updated existing usage user (verified)");
      } else {
        console.log("✅ Usage user is already verified");
      }
    }

    // Check if admin role exists, create if not
    let adminRole = await prisma.role.findFirst({
      where: { name: "admin" }
    });

    if (!adminRole) {
      console.log("📝 Creating default 'admin' role...");
      adminRole = await prisma.role.create({
        data: { name: "admin" }
      });
      console.log("✅ Created 'admin' role with ID:", adminRole.id);
    } else {
      console.log("✅ 'admin' role already exists with ID:", adminRole.id);
    }

    // Verify all roles exist
    const allRoles = await prisma.role.findMany({ orderBy: { id: 'asc' } });
    console.log("📋 All roles after creation:", allRoles.map(r => `${r.id}: ${r.name}`));

    // Create admin user if doesn't exist
    const existingAdmin = await prisma.user.findFirst({
      where: {
        email: "admin@example.com",
      },
    });

    if (!existingAdmin) {
      console.log("👤 Creating admin user...");
      const adminpassword = await hash("password", 10);

      const admin = await prisma.user.create({
        data: {
          email: "admin@example.com",
          name: "Admin",
          password: adminpassword,
          roleId: adminRole.id,
          emailVerified: new Date(),
        },
      });
      console.log("✅ Admin user created successfully");
    } else {
      console.log("✅ Admin user already exists");
    }

    console.log("🎉 Database seeding completed successfully!");

  } catch (error) {
    console.error("❌ Error during seeding:", error);
    throw error;
  }
}

main()
  .then(async () => {
    console.log("🔌 Disconnecting from database...");
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("💥 Seeding failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });

