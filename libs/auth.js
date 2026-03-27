import NextAuth from "next-auth"
import { MongoDBAdapter } from "@auth/mongodb-adapter"
import GoogleProvider from "next-auth/providers/google"
import EmailProvider from "next-auth/providers/email"
import config from "@/config"
import connectMongo from "./mongo"

export const { handlers, auth, signIn, signOut } = NextAuth({

  // Required for Vercel / reverse-proxy deployments (NextAuth v5)
  trustHost: true,

  // Set any random key in .env.local
  secret: process.env.AUTH_SECRET,

  // Add EmailProvider only for server-side usage (not edge-compatible)
  providers: [
    ...(connectMongo
      ? [
          EmailProvider({
            server: {
              host: "smtp.resend.com",
              port: 465,
              auth: {
                user: "resend",
                pass: process.env.RESEND_API_KEY,
              },
            },
            from: config.resend.fromNoReply,
          }),
          GoogleProvider({
            clientId: process.env.GOOGLE_ID,
            clientSecret: process.env.GOOGLE_SECRET,
            async profile(profile) {
              return {
                id: profile.sub,
                name: profile.given_name ? profile.given_name : profile.name,
                email: profile.email,
                image: profile.picture,
                createdAt: new Date(),
              };
            },
          }),
        ]
      : []),
  ],

  ...(connectMongo && { adapter: MongoDBAdapter(connectMongo) }),

  callbacks: {
    // Only expose user.id to the session — hasAccess and other DB fields are
    // always read directly from MongoDB server-side (DashboardLayout) to avoid
    // stale JWT data after Stripe webhook updates.
    session: async ({ session, token }) => {
      if (session?.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  theme: {
    brandColor: config.colors.main,
    logo: `https://${config.domainName}/logoAndName.png`,
  },
});
