import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import LinkedIn from "next-auth/providers/linkedin";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    LinkedIn({
      clientId: process.env.LINKEDIN_CLIENT_ID!,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: "/login",
    signOut: "/signout",
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = request.nextUrl.pathname === "/login";
      const isOnOnboarding = request.nextUrl.pathname === "/onboarding";

      // Allow login page always
      if (isOnLogin) return true;

      // Protect all other routes
      if (!isLoggedIn) return false;

      return true;
    },
  },
});
