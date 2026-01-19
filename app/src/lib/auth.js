import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions = {
  providers: [
    // Example: Email/password login
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // Replace this with your own DB lookup
        if (
          credentials.email === "admin@example.com" &&
          credentials.password === "password"
        ) {
          return { id: "1", name: "Admin", email: "admin@example.com" };
        }
        return null;
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
};
