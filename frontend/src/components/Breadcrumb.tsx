"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ChevronRight } from "lucide-react";

const titles: Record<string, string> = {
  "/": "Dashboard",
  "/contracts": "Scaffolding Contracts",
  "/materials": "Our Materials",
  "/customers": "Our Customers",
  "/drivers": "Our Drivers",
  "/staff": "Our Staff",
  "/fleet": "Our Fleet",
  "/tyre-demo": "Tyre Layout Demo",
};

/** Title for a route that has no entry above: its last segment, e.g. "/some-page" -> "Some page" */
function fallbackTitle(pathname: string) {
  const last = pathname.split("/").filter(Boolean).pop() ?? "";
  const text = last.replace(/-/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function Breadcrumb() {
  const pathname = usePathname();
  const title = titles[pathname] ?? fallbackTitle(pathname);

  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <Link href="/" className="breadcrumb-home" aria-label="Home">
        <Home size={16} strokeWidth={1.75} />
      </Link>
      <ChevronRight size={14} strokeWidth={1.75} className="breadcrumb-sep" />
      <span className="breadcrumb-current" aria-current="page">{title}</span>
    </nav>
  );
}
