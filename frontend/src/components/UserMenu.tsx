"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, User, LogOut } from "lucide-react";

export default function UserMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className="user-profile"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="https://i.pravatar.cc/100?img=11" alt="" className="user-avatar" />
        <span className="user-info">
          <span className="user-name">Ethan Carter</span>
          <span className="user-role">Owner</span>
        </span>
        <ChevronDown size={16} strokeWidth={1.75} className="user-chevron" />
      </button>

      <div className="user-dropdown" data-open={open} role="menu" aria-hidden={!open}>
        <button type="button" role="menuitem" className="user-dropdown-item" tabIndex={open ? 0 : -1}>
          <User size={16} strokeWidth={1.75} /> View Profile
        </button>
        <button type="button" role="menuitem" className="user-dropdown-item danger" tabIndex={open ? 0 : -1}>
          <LogOut size={16} strokeWidth={1.75} /> Log Out
        </button>
      </div>
    </div>
  );
}
