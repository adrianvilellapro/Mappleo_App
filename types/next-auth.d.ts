import type { DefaultSession } from "next-auth";
declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      sessionVersion: number;
      sessionId: string;
      verifiedAt: number;
    };
  }
  interface User {
    sessionVersion?: number;
    sessionId?: string;
  }
}
