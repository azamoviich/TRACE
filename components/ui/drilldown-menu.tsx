"use client";

import * as React from "react";
import {
  AnimatePresence,
  motion,
  usePresence,
  useReducedMotion,
} from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Drilldown Menu — a list that drills into itself.
 *
 * Clicking a row with children does not push a panel over the top. The row
 * stays exactly where it is, fades to grey, grows a return arrow in the gutter,
 * and its children arrive one indent step further right. Click the breadcrumb
 * to come back out.
 */

export interface DrilldownMenuItem {
  /** Stable identifier. Must be unique among its siblings. */
  id: string;
  /** Row text. Also the accessible name. */
  label: string;
  /** Children. A row with children drills in; one without is a leaf. */
  items?: DrilldownMenuItem[];
  /** Fires when a leaf row is chosen. */
  onSelect?: () => void;
}

interface DrilldownMenuProps {
  /** The tree. Content lives with the caller, never in here. */
  items: DrilldownMenuItem[];
  className?: string;
  /** Ids of the branches to open on mount, outermost first. */
  defaultPath?: string[];
  /** Fires when a leaf row is chosen, with the trail that led to it. */
  onSelect?: (item: DrilldownMenuItem, trail: DrilldownMenuItem[]) => void;
}

const SPRING = {
  type: "spring" as const,
  stiffness: 520,
  damping: 46,
  mass: 0.9,
};

const CHAR_SPRING = {
  type: "spring" as const,
  stiffness: 500,
  damping: 30,
  mass: 1,
};

const ROW_PITCH = 1.85;
const ROW_HEIGHT = 1.53;
const INDENT = 0.9;

const STAGGER_IN = 0.015;
const STAGGER_OUT = 0.008;

const CHAR_VARIANTS = {
  hidden: {
    opacity: 0,
    scale: 0,
    filter: "blur(4px)",
    transition: { duration: 0.12, ease: [0.4, 0, 1, 1] as const },
  },
  visible: {
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
    transition: CHAR_SPRING,
  },
};

function ReturnArrow() {
  return (
    <svg
      aria-hidden="true"
      className="h-[0.9em] w-[0.9em]"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path d="M9 5 4 10l5 5" />
      <path d="M4 10h9a6 6 0 0 1 6 6v2" />
    </svg>
  );
}

function resolvePath(
  items: DrilldownMenuItem[],
  ids: string[],
): DrilldownMenuItem[] {
  const trail: DrilldownMenuItem[] = [];
  let level = items;
  for (const id of ids) {
    const next = level.find((item) => item.id === id);
    if (!next?.items?.length) break;
    trail.push(next);
    level = next.items;
  }
  return trail;
}

export function DrilldownMenu({
  items,
  className,
  defaultPath,
  onSelect,
}: DrilldownMenuProps) {
  const [trail, setTrail] = React.useState<DrilldownMenuItem[]>(() =>
    defaultPath ? resolvePath(items, defaultPath) : [],
  );
  const reduceMotion = useReducedMotion();

  const level = trail.length ? (trail[trail.length - 1].items ?? []) : items;

  const rows = [
    ...trail.map((item, depth) => ({ item, depth, isTrail: true })),
    ...level.map((item) => ({ item, depth: trail.length, isTrail: false })),
  ];

  const handleItem = (item: DrilldownMenuItem) => {
    if (item.items?.length) {
      setTrail((current) => [...current, item]);
      return;
    }
    item.onSelect?.();
    onSelect?.(item, trail);
  };

  return (
    <div
      className={cn(
        "flex min-h-[16rem] flex-col justify-center text-2xl sm:min-h-[20rem] sm:text-3xl",
        className,
      )}
    >
      <div
        className={cn(
          "relative",
          !reduceMotion && "transition-[height] duration-300 ease-out",
        )}
        style={{
          height: `${(rows.length - 1) * ROW_PITCH + ROW_HEIGHT}em`,
        }}
      >
        <AnimatePresence initial={false}>
          {rows.map(({ item, depth, isTrail }, index) => (
            <Row
              depth={depth}
              index={index}
              isTrail={isTrail}
              item={item}
              key={item.id}
              onActivate={() =>
                isTrail
                  ? setTrail((current) => current.slice(0, depth))
                  : handleItem(item)
              }
              reduceMotion={!!reduceMotion}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface RowProps {
  item: DrilldownMenuItem;
  depth: number;
  index: number;
  isTrail: boolean;
  onActivate: () => void;
  reduceMotion: boolean;
}

function Row({
  item,
  depth,
  index,
  isTrail,
  onActivate,
  reduceMotion,
}: RowProps) {
  const [isPresent, safeToRemove] = usePresence();

  React.useEffect(() => {
    if (isPresent) return;
    const timer = window.setTimeout(() => safeToRemove?.(), 900);
    return () => window.clearTimeout(timer);
  }, [isPresent, safeToRemove]);

  return (
    <motion.div
      className={cn("absolute", !isPresent && "pointer-events-none")}
      layout={reduceMotion ? false : "position"}
      style={{
        left: `${depth * INDENT}em`,
        top: `${index * ROW_PITCH}em`,
      }}
      transition={reduceMotion ? { duration: 0 } : SPRING}
    >
      <motion.button
        animate={isPresent ? "visible" : "hidden"}
        aria-label={isTrail ? `Back to ${item.label}` : undefined}
        initial="hidden"
        onAnimationComplete={() => {
          if (!isPresent) safeToRemove?.();
        }}
        onClick={onActivate}
        transition={
          reduceMotion
            ? { duration: 0 }
            : {
                staggerChildren: isPresent ? STAGGER_IN : STAGGER_OUT,
                staggerDirection: isPresent ? 1 : -1,
              }
        }
        type="button"
        className={cn(
          "rounded-[0.25em] px-[0.22em] py-[0.14em] text-left font-medium leading-[1.25] outline-none transition-colors",
          "hover:bg-card-hover focus-visible:ring-2 focus-visible:ring-primary",
          isTrail ? "text-muted" : "text-text",
        )}
      >
        <span className="relative inline-block whitespace-pre">
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-y-0 right-full mr-[0.6em] flex items-center",
              !reduceMotion && "transition-all duration-200 ease-out",
              isTrail && isPresent
                ? "translate-x-0 opacity-100"
                : "-translate-x-1 opacity-0",
            )}
          >
            <ReturnArrow />
          </span>
          {item.label.split("").map((char, charIndex) => (
            <motion.span
              className="inline-block"
              key={charIndex}
              variants={CHAR_VARIANTS}
            >
              {char}
            </motion.span>
          ))}
        </span>
      </motion.button>
    </motion.div>
  );
}

export default DrilldownMenu;
