import "server-only";
import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { hash, compare } from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { db, assertRuntimePrivileges } from "@/lib/db";
import { emailSchema } from "./validation";
import { consumeAttempt, attemptBlocked, clearAttempts } from "./throttle";
import { verifyPassword, hashPassword } from "./password";
import { trustedRequestSource } from "@/lib/security/request";
import { recordSecurityEvent, withAuthCapacity } from "@/lib/security/controls";
let dummyHash: Promise<string> | undefined;
const getDummyHash = () =>
  (dummyHash ??= hashPassword(randomBytes(24).toString("hex")));
if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 64)
  throw new Error(
    "Run npm run setup to create a strong AUTH_SECRET (at least 64 characters).",
  );
let dummyLegacyHash: Promise<string> | undefined;
const getDummyLegacyHash = () =>
  (dummyLegacyHash ??= hash(randomBytes(24).toString("hex"), 12));
const credentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 365 * 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    Credentials({
      name: "Email y contraseña",
      credentials: { email: { type: "email" }, password: { type: "password" } },
      async authorize(input, request) {
        await assertRuntimePrivileges();
        const parsed = credentialsSchema.safeParse(input);
        if (!parsed.success) return null;
        const source = trustedRequestSource(request.headers ?? {});
        const pair = source + "\0" + parsed.data.email;
        if (
          !(await consumeAttempt("login-source", source, 100, 60000)) ||
          (await attemptBlocked("login-failed-pair", pair, 5, 900000))
        )
          throw new Error("TooManyAttempts");
        return withAuthCapacity(async () => {
          // Uniform first-login initialization, independent of email existence.
          // Normal page reads perform no password hashing.
          await Promise.all([getDummyHash(), getDummyLegacyHash()]);
          const user = await db.user.findUnique({
            where: { email: parsed.data.email },
          });
          const valid = await verifyPassword(
            parsed.data.password,
            user?.passwordHash ?? (await getDummyHash()),
          );
          // Both hash families incur work even for unknown emails during the legacy transition.
          if (user?.passwordHash && !user.passwordHash.startsWith("$argon2id$"))
            await verifyPassword(
              randomBytes(24).toString("hex"),
              await getDummyHash(),
            );
          else
            await compare(
              randomBytes(24).toString("hex"),
              await getDummyLegacyHash(),
            );
          if (!user?.passwordHash || !valid) {
            await recordSecurityEvent("login_failed", user?.id);
            if (!(await consumeAttempt("login-failed-pair", pair, 4, 900000)))
              throw new Error("TooManyAttempts");
            return null;
          }
          const sessionId = randomBytes(32).toString("hex");
          const sessionKey = createHash("sha256")
            .update(sessionId)
            .digest("hex");
          const replacement = user.passwordHash.startsWith("$argon2id$")
            ? undefined
            : await hashPassword(parsed.data.password);
          // Conditional write prevents a login using an old password racing with a password change.
          const created = await db.$transaction(async (tx) => {
            const current = await tx.user.updateMany({
              where: {
                id: user.id,
                sessionVersion: user.sessionVersion,
                passwordHash: user.passwordHash,
              },
              data: {
                failedAttempts: 0,
                lockedUntil: null,
                ...(replacement ? { passwordHash: replacement } : {}),
              },
            });
            if (!current.count) return false;
            await tx.authSession.deleteMany({
              where: { userId: user.id, expiresAt: { lte: new Date() } },
            });
            const previous = await tx.authSession.findMany({
              where: { userId: user.id },
              orderBy: { createdAt: "desc" },
              skip: 19,
              select: { id: true },
            });
            if (previous.length)
              await tx.authSession.deleteMany({
                where: {
                  userId: user.id,
                  id: { in: previous.map((s) => s.id) },
                },
              });
            await tx.authSession.create({
              data: {
                id: sessionKey,
                userId: user.id,
                sessionVersion: user.sessionVersion,
                expiresAt: new Date(Date.now() + 365 * 86400000),
              },
            });
            await tx.securityEvent.create({
              data: { type: "login_success", userId: user.id },
            });
            return true;
          });
          if (!created) return null;
          await clearAttempts("login-failed-pair", pair, 900000);
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            sessionVersion: user.sessionVersion,
            sessionId,
          };
        });
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      await assertRuntimePrivileges();
      if (user) {
        token.sub = user.id;
        token.sessionVersion = user.sessionVersion;
        token.sessionId = user.sessionId;
      }
      const key =
        typeof token.sessionId === "string"
          ? createHash("sha256").update(token.sessionId).digest("hex")
          : "";
      const stored = key
        ? await db.authSession.findUnique({
            where: { id: key },
            include: {
              user: {
                select: { sessionVersion: true, name: true, email: true },
              },
            },
          })
        : null;
      if (
        !stored ||
        stored.userId !== token.sub ||
        stored.expiresAt <= new Date() ||
        stored.sessionVersion !== token.sessionVersion ||
        stored.user.sessionVersion !== token.sessionVersion
      ) {
        // A revoked token must not disclose even its old profile through /api/auth/session.
        return {};
      } else {
        token.name = stored.user.name;
        token.email = stored.user.email;
        token.verifiedAt = stored.verifiedAt.getTime();
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // NextAuth initially builds the profile from the decoded cookie, not the revalidated token.
        session.user.name = typeof token.name === "string" ? token.name : null;
        session.user.email =
          typeof token.email === "string" ? token.email : null;
        session.user.image =
          typeof token.picture === "string" ? token.picture : null;
        session.user.id = token.sub ?? "";
        session.user.sessionVersion =
          typeof token.sessionVersion === "number" ? token.sessionVersion : -1;
        session.user.sessionId =
          typeof token.sessionId === "string" ? token.sessionId : "";
        session.user.verifiedAt =
          typeof token.verifiedAt === "number" ? token.verifiedAt : 0;
      }
      return session;
    },
  },
  events: {
    async signOut({ token }) {
      if (typeof token?.sessionId !== "string") return;
      const id = createHash("sha256").update(token.sessionId).digest("hex");
      await db.$transaction(async (tx) => {
        await tx.authSession.deleteMany({ where: { id, userId: token.sub } });
        await tx.securityEvent.create({
          data: { type: "logout", userId: token.sub },
        });
      });
    },
  },
};
