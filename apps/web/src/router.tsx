// Tiny pathname router: no dependency, just pushState + a change event.
import { useEffect, useState } from "react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

const NAV_EVENT = "opg:navigate";

export function usePathname(): string {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onChange = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onChange);
    window.addEventListener(NAV_EVENT, onChange);
    return () => {
      window.removeEventListener("popstate", onChange);
      window.removeEventListener(NAV_EVENT, onChange);
    };
  }, []);
  return path;
}

export function navigate(to: string): void {
  if (to === window.location.pathname + window.location.search) return;
  window.history.pushState(null, "", to);
  window.dispatchEvent(new Event(NAV_EVENT));
}

export interface LinkProps {
  to: string;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}

export function Link({ to, children, style, className }: LinkProps) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} className={className} style={style} onClick={onClick}>
      {children}
    </a>
  );
}
