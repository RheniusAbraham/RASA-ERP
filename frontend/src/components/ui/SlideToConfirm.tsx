"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { ChevronsRight, Loader2 } from "lucide-react";

const THUMB = 46;
const PAD = 6;

type Props = {
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  /** Reject (throw) to snap the handle back */
  onConfirm: () => Promise<void> | void;
  /** "success" is a green track, for the step that finishes something (concluding a contract) */
  tone?: "primary" | "success" | "dark";
  /** Slide the handle back after confirming (for when confirming only opens a next step) */
  resetAfter?: boolean;
  /** Greyed out and unable to be slid; `label` then says what must happen first */
  locked?: boolean;
};

/** A track with a handle that has to be dragged all the way across to confirm. Arrow Right / Enter also work. */
export default function SlideToConfirm({ label, hint, icon, onConfirm, resetAfter, locked, tone = "primary" }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [busy, setBusy] = useState(false);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const max = () => Math.max(width - THUMB - PAD * 2, 0);

  const fillWidth = useTransform(x, (v) => v + THUMB + PAD * 2);
  const progress = useTransform(x, (v) => (max() ? Math.min(v / max(), 1) : 0));
  // the handle spins, grows and turns green as it nears the end, with a glow that builds up
  const scale = useTransform(progress, [0, 0.5, 1], [1, 1.12, 1.2]);
  const success = tone === "success";
  const dark = tone === "dark";
  const thumbColor = useTransform(
    progress,
    [0, 0.7, 1],
    dark ? ["#3a3a52", "#2a2a3d", "#1e1e2d"] : success ? ["#2fb87a", "#27a36c", "#1f8a5b"] : ["#9b72f1", "#7f8fe8", "#2fb87a"],
  );
  const glow = useTransform(progress, (p) =>
    dark
      ? `0 ${6 + p * 6}px ${14 + p * 22}px rgba(30, 30, 45, ${0.3 + p * 0.2})`
      : success
        ? `0 ${6 + p * 6}px ${14 + p * 22}px rgba(47, 184, 122, ${0.4 + p * 0.2})`
        : `0 ${6 + p * 6}px ${14 + p * 22}px rgba(${Math.round(155 - p * 108)}, ${Math.round(114 + p * 70)}, ${Math.round(241 - p * 119)}, ${0.4 + p * 0.2})`,
  );
  const iconRotate = useTransform(progress, [0, 1], [0, 360]);
  const textOpacity = useTransform(x, (v) => Math.max(0, 1 - v / (max() * 0.6 || 1)));

  const confirm = async () => {
    if (locked) return;
    setBusy(true);
    await animate(x, max(), { type: "spring", stiffness: 400, damping: 34 });
    try {
      await onConfirm();
      if (resetAfter) {
        setBusy(false);
        animate(x, 0, { type: "spring", stiffness: 300, damping: 28 });
      }
    } catch {
      setBusy(false);
      animate(x, 0, { type: "spring", stiffness: 300, damping: 28 });
    }
  };
  const snapBack = () => animate(x, 0, { type: "spring", stiffness: 300, damping: 28 });

  return (
    <div className="slide-track" ref={track} data-busy={busy} data-tone={tone} data-locked={locked || undefined}>
      <motion.div className="slide-fill" style={{ width: fillWidth }} />
      <motion.div className="slide-label" style={{ opacity: textOpacity }}>
        <strong>{busy ? "Marking…" : label}</strong>
        {hint && !busy && <small>{hint}</small>}
      </motion.div>
      <motion.button
        type="button"
        className="slide-thumb"
        style={{ x, scale, backgroundColor: thumbColor, boxShadow: glow }}
        drag={busy || locked ? false : "x"}
        dragConstraints={{ left: 0, right: max() }}
        dragElastic={0}
        dragMomentum={false}
        onDragEnd={() => (x.get() >= max() * 0.85 ? confirm() : snapBack())}
        onKeyDown={(e) => {
          if (busy || locked) return;
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
            e.preventDefault();
            confirm();
          }
        }}
                aria-disabled={locked}
        aria-label={`${label}. Slide to the right, or press Enter, to confirm.`}
      >
        {busy ? (
          <Loader2 size={18} className="slide-spin" />
        ) : (
          <motion.span className="slide-icon" style={{ rotate: iconRotate }}>
            {icon ?? <ChevronsRight size={20} strokeWidth={2} />}
          </motion.span>
        )}
      </motion.button>
    </div>
  );
}
