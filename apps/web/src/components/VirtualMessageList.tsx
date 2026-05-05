"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";

// Lightweight, dependency-free virtualizer for variable-height items.
// Designed specifically for the chat message list, where:
//   • Items are appended at the bottom and the user typically wants to stay
//     pinned to the latest message.
//   • Items can change height after mount (image loaded, reactions added,
//     waveform decoded, etc.) — measured continuously via ResizeObserver.
//   • The list grows incrementally — if a message id was already measured we
//     keep its height through re-renders.
//
// We render a top spacer + the visible window + a bottom spacer. Heights are
// stored in a Map<key, number> with `estimateSize` as the fallback.

const SCROLL_BOTTOM_THRESHOLD = 64;

export interface VirtualListHandle {
  /** Scroll the inner container so the given key is visible. */
  scrollToKey: (key: string, opts?: { align?: "start" | "center" | "end"; behavior?: ScrollBehavior }) => void;
  /** Force scroll to bottom (instant). */
  scrollToBottom: (opts?: { behavior?: ScrollBehavior }) => void;
  /** Whether the user is currently pinned at the bottom (within threshold). */
  isAtBottom: () => boolean;
  /** Scroll the underlying container. Useful for snapshots. */
  getScrollEl: () => HTMLDivElement | null;
}

export interface VirtualMessageListProps<T> {
  items: T[];
  /** Stable unique key per item. */
  getKey: (item: T, index: number) => string;
  estimateSize: number;
  overscan?: number;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
  style?: CSSProperties;
  innerClassName?: string;
  /** Extra content rendered above all items (e.g. blur shield). */
  beforeChildren?: ReactNode;
  /** Auto-stick to bottom on item count change when user is already at bottom. */
  stickToBottom?: boolean;
}

interface VirtualMessageListGenericProps<T> extends VirtualMessageListProps<T> {
  __innerRef?: React.Ref<VirtualListHandle>;
}

function VirtualMessageListInner<T>({
  items,
  getKey,
  estimateSize,
  overscan = 6,
  renderItem,
  className,
  style,
  innerClassName,
  beforeChildren,
  stickToBottom = true,
  __innerRef
}: VirtualMessageListGenericProps<T>): JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const heightsRef = useRef<Map<string, number>>(new Map());
  const itemElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const wasAtBottomRef = useRef(true);
  const [, setTick] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const scheduleRecalc = useCallback(() => {
    setTick((n) => (n + 1) % 1_000_000);
  }, []);

  // Measure viewport height + reflect scroll changes.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportHeight(el.clientHeight);
    setScrollTop(el.scrollTop);

    const onScroll = (): void => {
      setScrollTop(el.scrollTop);
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      wasAtBottomRef.current = distanceFromBottom < SCROLL_BOTTOM_THRESHOLD;
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === el) {
          setViewportHeight(entry.contentRect.height);
        }
      }
    });
    ro.observe(el);

    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, []);

  // Compute cumulative offsets and which items are visible.
  const { offsets, totalHeight, startIndex, endIndex } = useMemo(() => {
    const heights = heightsRef.current;
    const off: number[] = new Array(items.length + 1);
    off[0] = 0;
    for (let i = 0; i < items.length; i++) {
      const key = getKey(items[i]!, i);
      const h = heights.get(key) ?? estimateSize;
      off[i + 1] = off[i]! + h;
    }
    const total = off[items.length] ?? 0;

    if (viewportHeight === 0 || items.length === 0) {
      return {
        offsets: off,
        totalHeight: total,
        startIndex: 0,
        endIndex: Math.min(items.length, 12)
      };
    }

    // Binary search for first visible.
    const top = scrollTop;
    const bottom = scrollTop + viewportHeight;
    let lo = 0;
    let hi = items.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((off[mid + 1] ?? 0) <= top) lo = mid + 1;
      else hi = mid;
    }
    const start = Math.max(0, lo - overscan);

    let endLo = start;
    let endHi = items.length;
    while (endLo < endHi) {
      const mid = (endLo + endHi) >> 1;
      if ((off[mid] ?? 0) < bottom) endLo = mid + 1;
      else endHi = mid;
    }
    const end = Math.min(items.length, endLo + overscan);

    return { offsets: off, totalHeight: total, startIndex: start, endIndex: end };
  }, [items, getKey, estimateSize, scrollTop, viewportHeight, overscan]);

  // Set up a measurement observer to keep heights up to date.
  const measure = useCallback(
    (key: string, el: HTMLDivElement | null) => {
      if (!el) {
        itemElsRef.current.delete(key);
        return;
      }
      itemElsRef.current.set(key, el);
      const prev = heightsRef.current.get(key);
      const next = el.getBoundingClientRect().height;
      if (next > 0 && Math.abs((prev ?? 0) - next) > 0.5) {
        heightsRef.current.set(key, next);
        scheduleRecalc();
      }
    },
    [scheduleRecalc]
  );

  // ResizeObserver for the rendered window — picks up height changes after
  // mount (e.g. image load, decoded waveform, added reactions).
  const observerRef = useRef<ResizeObserver | null>(null);
  useLayoutEffect(() => {
    const ro = new ResizeObserver((entries) => {
      let dirty = false;
      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        const key = target.dataset["virtualKey"];
        if (!key) continue;
        const next = entry.contentRect.height;
        const prev = heightsRef.current.get(key);
        if (next > 0 && Math.abs((prev ?? 0) - next) > 0.5) {
          heightsRef.current.set(key, next);
          dirty = true;
        }
      }
      if (dirty) scheduleRecalc();
    });
    observerRef.current = ro;
    return () => {
      ro.disconnect();
      observerRef.current = null;
    };
  }, [scheduleRecalc]);

  // Drop heights for items that are no longer in the list.
  useEffect(() => {
    const live = new Set<string>();
    for (let i = 0; i < items.length; i++) live.add(getKey(items[i]!, i));
    for (const k of Array.from(heightsRef.current.keys())) {
      if (!live.has(k)) heightsRef.current.delete(k);
    }
  }, [items, getKey]);

  // Stick to bottom on item additions and on layout-changing remeasurements
  // (e.g. images / waveforms loading) — but only while the user was already
  // pinned to the bottom.
  const lastCountRef = useRef(items.length);
  const lastTotalRef = useRef(totalHeight);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const grew = items.length > lastCountRef.current || totalHeight > lastTotalRef.current;
    if (grew && stickToBottom && wasAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    lastCountRef.current = items.length;
    lastTotalRef.current = totalHeight;
  }, [items.length, stickToBottom, totalHeight]);

  // Initial mount: jump to bottom (chat default). Use scrollHeight after
  // layout so the initial estimate is at least applied.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickToBottom) {
      el.scrollTop = el.scrollHeight;
      wasAtBottomRef.current = true;
    }
    // Run only once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollToKey = useCallback<VirtualListHandle["scrollToKey"]>((key, opts = {}) => {
    const align = opts.align ?? "center";
    const behavior = opts.behavior ?? "smooth";
    let idx = -1;
    for (let i = 0; i < items.length; i++) {
      if (getKey(items[i]!, i) === key) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return;
    const el = scrollRef.current;
    if (!el) return;

    const computeTarget = (): number => {
      // Recompute from current heights so we account for items that have been
      // measured since the last render.
      const heights = heightsRef.current;
      let top = 0;
      for (let i = 0; i < idx; i++) {
        const k = getKey(items[i]!, i);
        top += heights.get(k) ?? estimateSize;
      }
      const itemH = heights.get(getKey(items[idx]!, idx)) ?? estimateSize;
      const vp = el.clientHeight;
      let target = top;
      if (align === "center") target = top - (vp - itemH) / 2;
      else if (align === "end") target = top - vp + itemH;
      return Math.max(0, target);
    };

    el.scrollTo({ top: computeTarget(), behavior });
    // The target item likely had only an estimated height; once it's rendered
    // we may need to refine the scroll position. Run two refinement passes.
    let pass = 0;
    const refine = (): void => {
      if (pass++ >= 2) return;
      const next = computeTarget();
      if (Math.abs(next - el.scrollTop) > 4) {
        el.scrollTo({ top: next, behavior: "auto" });
      }
      requestAnimationFrame(refine);
    };
    requestAnimationFrame(refine);
  }, [items, getKey, estimateSize]);

  const scrollToBottom = useCallback<VirtualListHandle["scrollToBottom"]>((opts = {}) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: opts.behavior ?? "smooth" });
  }, []);

  useImperativeHandle(__innerRef ?? null, () => ({
    scrollToKey,
    scrollToBottom,
    isAtBottom: () => wasAtBottomRef.current,
    getScrollEl: () => scrollRef.current
  }), [scrollToKey, scrollToBottom]);

  const topPadding = offsets[startIndex] ?? 0;
  const bottomPadding = totalHeight - (offsets[endIndex] ?? totalHeight);

  const slice: { item: T; index: number; key: string }[] = [];
  for (let i = startIndex; i < endIndex; i++) {
    const item = items[i]!;
    slice.push({ item, index: i, key: getKey(item, i) });
  }

  return (
    <div ref={scrollRef} className={className} style={style}>
      {beforeChildren}
      <div
        ref={innerRef}
        className={innerClassName}
        style={{ minHeight: totalHeight, position: "relative" }}
      >
        <div style={{ height: topPadding }} aria-hidden />
        {slice.map(({ item, index, key }) => (
          <div
            key={key}
            data-virtual-key={key}
            ref={(el) => {
              if (el) {
                observerRef.current?.observe(el);
                measure(key, el);
              } else {
                const prev = itemElsRef.current.get(key);
                if (prev) observerRef.current?.unobserve(prev);
                itemElsRef.current.delete(key);
              }
            }}
          >
            {renderItem(item, index)}
          </div>
        ))}
        <div style={{ height: Math.max(0, bottomPadding) }} aria-hidden />
      </div>
    </div>
  );
}

export const VirtualMessageList = forwardRef(function VirtualMessageList<T>(
  props: VirtualMessageListProps<T>,
  ref: React.Ref<VirtualListHandle>
): JSX.Element {
  return <VirtualMessageListInner {...props} __innerRef={ref} />;
}) as <T>(p: VirtualMessageListProps<T> & { ref?: React.Ref<VirtualListHandle> }) => JSX.Element;
