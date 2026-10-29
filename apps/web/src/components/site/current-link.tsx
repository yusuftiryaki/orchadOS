"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// A site header link that marks the page it leads to (aria-current), on the
// page itself and below it (/sss, /kvkk#…). The header is the same on every
// page, so the current page is read on the client.
export function CurrentLink({
  href,
  className,
  children,
  testId,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  testId?: string;
}) {
  const pathname = usePathname();
  const current = pathname != null && (pathname === href || pathname.startsWith(`${href}/`));
  return (
    <Link
      href={href}
      className={className}
      aria-current={current ? "page" : undefined}
      data-testid={testId}
    >
      {children}
    </Link>
  );
}
