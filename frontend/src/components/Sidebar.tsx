"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  IdCard,
  UserCog,
  FilePlus,
  Archive,
  Boxes,
  Truck,
  Sun,
  Moon,
  ChevronsRight,
  ChevronsLeft,
} from "lucide-react";

const sections = [
  {
    heading: "Dashboard",
    links: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    heading: "Our Contracts",
    links: [
      { href: "/manage-contracts", label: "Manage Contracts", icon: FilePlus },
      { href: "/closed-contracts", label: "Closed Contracts", icon: Archive },
    ],
  },
  {
    heading: "Resources",
    links: [
      { href: "/materials", label: "Our Materials", icon: Boxes },
      { href: "/customers", label: "Our Customers", icon: Users },
      { href: "/drivers", label: "Our Drivers", icon: IdCard },
      { href: "/staff", label: "Our Staff", icon: UserCog },
      { href: "/fleet", label: "Our Fleet", icon: Truck },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);

  return (
    <aside className="sidebar" data-expanded={expanded}>
      <nav className="sidebar-top">
        <div className="sidebar-toggle-row">
          <span className="sidebar-menu-label" aria-hidden />
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
            aria-expanded={expanded}
            title={expanded ? "Collapse sidebar" : "Expand sidebar"}
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? <ChevronsLeft size={16} strokeWidth={1.75} /> : <ChevronsRight size={16} strokeWidth={1.75} />}
          </button>
        </div>

        {sections.map((section) => (
          <div key={section.heading} className="nav-section">
            <span className="nav-heading">{section.heading}</span>
            <div className="nav-links">
              {section.links.map(({ href, label, icon: Icon }) => {
                const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`nav-item${active ? " active" : ""}`}
                    aria-label={label}
                    aria-current={active ? "page" : undefined}
                    title={expanded ? undefined : label}
                  >
                    <Icon size={18} strokeWidth={1.75} className="nav-icon" />
                    <span className="nav-label">{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="theme-toggle">
        <button className="theme-btn active" aria-label="Light mode" title="Light mode"><Sun size={14} strokeWidth={1.75} /></button>
        <button className="theme-btn" aria-label="Dark mode" title="Dark mode"><Moon size={14} strokeWidth={1.75} /></button>
      </div>
    </aside>
  );
}
