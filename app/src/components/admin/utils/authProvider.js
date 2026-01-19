import { getSession, signOut } from "next-auth/react";

const authProvider = {
  logout: async () => {
    try {
      await signOut({ callbackUrl: "/admin" });
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  },
  checkAuth: async () => {
    const session = await getSession();
    if (session && session.user) {
      return Promise.resolve();
    }
    return Promise.reject();
  },
  checkError: (error) => Promise.resolve(),
  getIdentity: async () => {
    const session = await getSession();
    if (session && session.user) {
      return Promise.resolve({
        id: session.user.id,
        fullName: session.user.name,
        avatar: session.user.image,
      });
    }
    return Promise.reject();
  },
  getPermissions: async () => {
    const session = await getSession();
    if (session && session.user && session.user.role?.name === "admin") {
      return Promise.resolve();
    }
    return Promise.reject();
  },
};

export default authProvider;
