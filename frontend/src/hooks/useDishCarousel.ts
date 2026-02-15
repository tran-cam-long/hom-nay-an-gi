import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CAROUSEL_GAP_PX = 12;

type UseDishCarouselOptions = {
  itemCount: number;
  itemsPerView: 1 | 2;
};

export default function useDishCarousel({ itemCount, itemsPerView }: UseDishCarouselOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [startIndex, setStartIndex] = useState(0);

  const maxStartIndex = useMemo(
    () => Math.max(0, itemCount - itemsPerView),
    [itemCount, itemsPerView],
  );

  const getItemStep = useCallback((container: HTMLDivElement): number => {
    const firstItem = container.querySelector<HTMLElement>("[data-carousel-item='true']");

    if (!firstItem) return 0;

    return firstItem.offsetWidth + CAROUSEL_GAP_PX;
  }, []);

  const clampIndex = useCallback(
    (index: number) => Math.max(0, Math.min(index, maxStartIndex)),
    [maxStartIndex],
  );

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      const container = containerRef.current;
      if (!container) return;

      const step = getItemStep(container);
      if (step <= 0) return;

      const clamped = clampIndex(index);
      container.scrollTo({ left: clamped * step, behavior });
      setStartIndex(clamped);
    },
    [clampIndex, getItemStep],
  );

  const goFirst = useCallback(() => scrollToIndex(0), [scrollToIndex]);
  const goBackOne = useCallback(() => scrollToIndex(startIndex - 1), [scrollToIndex, startIndex]);
  const goNextOne = useCallback(() => scrollToIndex(startIndex + 1), [scrollToIndex, startIndex]);
  const goLast = useCallback(() => scrollToIndex(maxStartIndex), [scrollToIndex, maxStartIndex]);

  useEffect(() => {
    setStartIndex((prev) => clampIndex(prev));
  }, [clampIndex, itemCount]);

  useEffect(() => {
    scrollToIndex(startIndex, "auto");
  }, [itemsPerView, itemCount, scrollToIndex, startIndex]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let snapTimer: number | null = null;

    const onScroll = () => {
      if (snapTimer !== null) window.clearTimeout(snapTimer);

      snapTimer = window.setTimeout(() => {
        const step = getItemStep(container);
        if (step <= 0) return;

        // Nearest start index is treated as current, then we snap back to it.
        const nearestIndex = clampIndex(Math.round(container.scrollLeft / step));
        setStartIndex(nearestIndex);

        const expectedLeft = nearestIndex * step;
        if (Math.abs(container.scrollLeft - expectedLeft) > 1) {
          container.scrollTo({ left: expectedLeft, behavior: "smooth" });
        }
      }, 120);
    };

    container.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", onScroll);
      if (snapTimer !== null) window.clearTimeout(snapTimer);
    };
  }, [clampIndex, getItemStep]);

  return {
    containerRef,
    startIndex,
    maxStartIndex,
    goFirst,
    goBackOne,
    goNextOne,
    goLast,
  };
}
