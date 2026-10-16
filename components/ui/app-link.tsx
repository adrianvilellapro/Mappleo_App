"use client";
import Link from "next/link";
import type { ComponentProps } from "react";
// Same Next.js navigation and DOM, without speculative private-page requests.
export default function AppLink(props: ComponentProps<typeof Link>) {
  return <Link prefetch={false} {...props} />;
}
