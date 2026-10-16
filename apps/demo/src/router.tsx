import { useSyncExternalStore, type AnchorHTMLAttributes } from "react";
import { demoRuntime } from "./runtime";

export function useDemoState() {
  const runtime = demoRuntime();
  return useSyncExternalStore(
    runtime.subscribe,
    runtime.snapshot,
    runtime.snapshot,
  );
}
export function usePathname() {
  return useDemoState().href.split("?")[0];
}
export function useSearchParams() {
  return new URLSearchParams(useDemoState().href.split("?")[1]);
}
const router = {
  push: (href: string, options?: { scroll?: boolean }) =>
    demoRuntime().navigate(href, options),
  replace: (href: string, options?: { scroll?: boolean }) =>
    demoRuntime().navigate(href, options, true),
  refresh: () => demoRuntime().refresh(),
  back: () => window.history.back(),
  prefetch: () => {},
};
export function useRouter() {
  return router;
}

export default function Link({
  href,
  prefetch,
  replace,
  scroll,
  onClick,
  children,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
}) {
  void prefetch;
  return (
    <a
      {...props}
      href={href.startsWith("/") ? "#" + href : href}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.altKey ||
          props.target === "_blank"
        )
          return;
        if (href.startsWith("/")) {
          event.preventDefault();
          demoRuntime().navigate(href, { scroll }, replace);
        }
      }}
    >
      {children}
    </a>
  );
}
