# Homnayangi Recommendations Sliders + Discovery Table Plan

This plan adds 3 sections to `frontend/src/pages/HomnayangiPage.tsx`:

1. Top slider: `userFavorites` (most chosen dishes).
2. Middle table: `userDiscovery` (reuse current "Get all" table/choose flow).
3. Bottom slider: `userLeastOftenInTop`.

It also includes responsive slider behavior:

- Mobile: show 1 full card + about 25% of next card; snap back to the dominant card when swipe stops.
- Wide screen: show 2 cards as the current window and 4 nav buttons (`Next 1`, `Last`, `Back 1`, `First`).

## 1. API Contract Mapping

Based on `resources/references/api_cuisine_rotation_recommendations_example.json`, use:

- `userFavorites: RecommendationItem[]`
- `userDiscovery: RecommendationItem[]`
- `userLeastOftenInTop: RecommendationItem[]`

Each item is:

```ts
type RecommendationItem = {
  dish: DishDetails;
  timesChosen: number;
  lastChosenTime: string | null;
};
```

Payload shape:

```ts
type RotationRecommendationsResponse = {
  userFavorites: RecommendationItem[];
  userDiscovery: RecommendationItem[];
  userLeastOftenInTop: RecommendationItem[];
};
```

## 2. Backend Proxy (Nest) - Add Recommendations Endpoint

Your backend currently proxies:

- `GET /dishchoice/dishes`
- `POST /dishchoice/choice`

Add a new proxy endpoint:

- `GET /dishchoice/recommendations`

### 2.1 `server/src/service/dishchoice.service.ts`

```ts
type RecommendationItem = {
  dish: DishDetails;
  timesChosen: number;
  lastChosenTime: string | null;
};

type RotationRecommendationsResponse = {
  userFavorites: RecommendationItem[];
  userDiscovery: RecommendationItem[];
  userLeastOftenInTop: RecommendationItem[];
};

async getRotationRecommendations(accessToken: string): Promise<RotationRecommendationsResponse> {
  const url = `${this.backendUrl}/api/cuisine/rotation/recommendations`;

  const response = await firstValueFrom(
    this.http.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }),
  );

  const payload = response.data ?? {};

  return {
    userFavorites: Array.isArray(payload.userFavorites) ? payload.userFavorites : [],
    userDiscovery: Array.isArray(payload.userDiscovery) ? payload.userDiscovery : [],
    userLeastOftenInTop: Array.isArray(payload.userLeastOftenInTop)
      ? payload.userLeastOftenInTop
      : [],
  };
}
```

### 2.2 `server/src/controller/dishchoice.controller.ts`

```ts
@Get("recommendations")
async getRotationRecommendations(@Headers("authorization") authorization?: string) {
  if (!authorization || !authorization.toLowerCase().startsWith("bearer ")) {
    throw new UnauthorizedException("Missing or invalid bearer token");
  }

  const accessToken = authorization.slice(7).trim();

  if (!accessToken) {
    throw new UnauthorizedException("Missing access token");
  }

  return this.dishChoiceService.getRotationRecommendations(accessToken);
}
```

## 3. Frontend Types

Create `frontend/src/types/recommendation.ts`:

```ts
import type { DishDetails } from "./dish";

export type RecommendationItem = {
  dish: DishDetails;
  timesChosen: number;
  lastChosenTime: string | null;
};

export type RotationRecommendationsResponse = {
  userFavorites: RecommendationItem[];
  userDiscovery: RecommendationItem[];
  userLeastOftenInTop: RecommendationItem[];
};
```

## 4. Frontend Fetch + State in `HomnayangiPage.tsx`

Replace "Get all only" state with recommendation sections while keeping choose flow for discovery.

```tsx
import type {
  RecommendationItem,
  RotationRecommendationsResponse,
} from "../types/recommendation";
import useIsMobile from "../hooks/useIsMobile";

function normalizeRecommendations(payload: unknown): RotationRecommendationsResponse {
  if (!payload || typeof payload !== "object") {
    return { userFavorites: [], userDiscovery: [], userLeastOftenInTop: [] };
  }

  const data = payload as Partial<RotationRecommendationsResponse>;

  return {
    userFavorites: Array.isArray(data.userFavorites) ? data.userFavorites : [],
    userDiscovery: Array.isArray(data.userDiscovery) ? data.userDiscovery : [],
    userLeastOftenInTop: Array.isArray(data.userLeastOftenInTop)
      ? data.userLeastOftenInTop
      : [],
  };
}
```

```tsx
const [favorites, setFavorites] = useState<RecommendationItem[]>([]);
const [discovery, setDiscovery] = useState<RecommendationItem[]>([]);
const [leastOften, setLeastOften] = useState<RecommendationItem[]>([]);
const isMobile = useIsMobile();
```

```tsx
const handleGetRecommendations = async () => {
  const accessToken = localStorage.getItem("token");

  if (!accessToken) {
    setError("Please login first.");
    return;
  }

  setLoading(true);
  setError(null);

  try {
    const response = await fetch(`${API_BASE_URL}/dishchoice/recommendations`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get recommendations: ${response.status}`);
    }

    const payload = await response.json();
    const normalized = normalizeRecommendations(payload);

    setFavorites(normalized.userFavorites);
    setDiscovery(normalized.userDiscovery);
    setLeastOften(normalized.userLeastOftenInTop);
  } catch (e) {
    setError(e instanceof Error ? e.message : "Cannot load recommendations right now.");
  } finally {
    setLoading(false);
  }
};
```

For discovery table reuse:

```tsx
const discoveryDishes = discovery.map((item) => item.dish);
const dishRows = toDishRow(discoveryDishes);
```

## 5. Add Reusable Carousel Hook (Snap + Controls)

Create `frontend/src/hooks/useDishCarousel.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

  const scrollToIndex = useCallback((index: number, behavior: ScrollBehavior = "smooth") => {
    const container = containerRef.current;
    if (!container) return;

    const clamped = Math.max(0, Math.min(index, maxStartIndex));
    const firstItem = container.querySelector<HTMLElement>("[data-carousel-item='true']");
    if (!firstItem) return;

    const step = firstItem.offsetWidth + 12;
    container.scrollTo({ left: clamped * step, behavior });
    setStartIndex(clamped);
  }, [maxStartIndex]);

  const goFirst = useCallback(() => scrollToIndex(0), [scrollToIndex]);
  const goBackOne = useCallback(() => scrollToIndex(startIndex - 1), [scrollToIndex, startIndex]);
  const goNextOne = useCallback(() => scrollToIndex(startIndex + 1), [scrollToIndex, startIndex]);
  const goLast = useCallback(() => scrollToIndex(maxStartIndex), [scrollToIndex, maxStartIndex]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let snapTimer: number | null = null;

    const onScroll = () => {
      if (snapTimer) window.clearTimeout(snapTimer);

      snapTimer = window.setTimeout(() => {
        const firstItem = container.querySelector<HTMLElement>("[data-carousel-item='true']");
        if (!firstItem) return;

        const step = firstItem.offsetWidth + 12;
        const center = container.scrollLeft + container.clientWidth / 2;

        // Dominant-card rule: whichever card center is nearest viewport center becomes current.
        const rawIndex = Math.round((center - firstItem.offsetWidth / 2) / step);
        const clamped = Math.max(0, Math.min(rawIndex, maxStartIndex));
        scrollToIndex(clamped);
      }, 120);
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      if (snapTimer) window.clearTimeout(snapTimer);
    };
  }, [maxStartIndex, scrollToIndex]);

  return {
    containerRef,
    startIndex,
    maxStartIndex,
    goFirst,
    goBackOne,
    goNextOne,
    goLast,
    scrollToIndex,
  };
}
```

## 6. Reusable Slider Section Component

Create `frontend/src/components/RecommendationCarousel.tsx`:

```tsx
import useDishCarousel from "../hooks/useDishCarousel";
import type { RecommendationItem } from "../types/recommendation";

type RecommendationCarouselProps = {
  title: string;
  items: RecommendationItem[];
  isMobile: boolean;
};

export default function RecommendationCarousel({
  title,
  items,
  isMobile,
}: RecommendationCarouselProps) {
  const itemsPerView: 1 | 2 = isMobile ? 1 : 2;
  const {
    containerRef,
    goFirst,
    goBackOne,
    goNextOne,
    goLast,
    startIndex,
    maxStartIndex,
  } = useDishCarousel({
    itemCount: items.length,
    itemsPerView,
  });

  return (
    <section className="recommendation-section">
      <div className="recommendation-section__header">
        <h3>{title}</h3>

        {!isMobile && items.length > 2 && (
          <div className="recommendation-nav">
            <button type="button" onClick={goNextOne}>Next 1</button>
            <button type="button" onClick={goLast}>Last</button>
            <button type="button" onClick={goBackOne}>Back 1</button>
            <button type="button" onClick={goFirst}>First</button>
          </div>
        )}
      </div>

      <div className="recommendation-track" ref={containerRef}>
        {items.map((item) => (
          <article
            key={item.dish.id}
            className="recommendation-card"
            data-carousel-item="true"
          >
            <img src={item.dish.imageUrl} alt={item.dish.name} />
            <div className="recommendation-card__body">
              <div className="recommendation-card__name">{item.dish.name}</div>
              <div className="recommendation-card__meta">
                Chosen: {item.timesChosen}
              </div>
              <div className="recommendation-card__meta">
                Last: {item.lastChosenTime ? new Date(item.lastChosenTime).toLocaleString() : "Never"}
              </div>
            </div>
          </article>
        ))}
      </div>

      {!isMobile && items.length > 0 && (
        <p className="recommendation-page-info">
          Showing {startIndex + 1}-{Math.min(startIndex + itemsPerView, items.length)} of {items.length}
          {maxStartIndex === 0 ? "" : ""}
        </p>
      )}
    </section>
  );
}
```

## 7. Compose Page Layout (Top Slider -> Discovery Table -> Bottom Slider)

In `HomnayangiPage.tsx` render sections in this order:

```tsx
<button type="button" onClick={handleGetRecommendations} disabled={loading}>
  {loading ? "Loading..." : "Get recommendations"}
</button>

<RecommendationCarousel
  title="Most Chosen Dishes"
  items={favorites}
  isMobile={isMobile}
/>

<section>
  <h3>Discovery For You</h3>
  {/* Reuse existing table + choose/confirm flow; source dishes from discoveryDishes */}
  <table>...</table>
</section>

<RecommendationCarousel
  title="Least Often In Top"
  items={leastOften}
  isMobile={isMobile}
/>
```

## 8. Slider CSS (Mobile Overflow + Desktop 2-Card Window)

Add into `frontend/src/pages/HomnayangiPage.css`:

```css
.recommendation-section {
  margin-top: 16px;
}

.recommendation-section__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.recommendation-track {
  margin-top: 10px;
  display: flex;
  gap: 12px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  padding-bottom: 6px;
}

.recommendation-card {
  flex: 0 0 75%;
  scroll-snap-align: start;
  border: 1px solid #e5e5e5;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}

.recommendation-card img {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  display: block;
}

.recommendation-card__body {
  padding: 10px;
}

.recommendation-card__name {
  font-weight: 600;
}

.recommendation-card__meta {
  margin-top: 4px;
  font-size: 12px;
  color: #4b4b4b;
}

.recommendation-nav {
  display: inline-flex;
  gap: 8px;
}

.recommendation-page-info {
  margin: 8px 0 0;
  font-size: 12px;
  color: #4b4b4b;
}

@media (min-width: 500px) {
  .recommendation-card {
    flex: 0 0 calc((100% - 12px) / 2);
  }
}
```

Why this satisfies mobile:

- `flex-basis: 75%` gives 1 full card + ~25% of next card visible.
- `scroll-snap-type: x mandatory` + JS nearest-index snap enforces "stop midway -> return to dominant current card".

Why this satisfies desktop:

- Each card becomes 50% minus gap, so 2 cards are current.
- Navigation buttons move by 1 item and can jump to first/last window.

## 9. Discovery Table Reuse Rules

Keep your current discovery table logic/components:

- Keep `DishItemCard`.
- Keep `handleChooseClick` + `submitChoice`.
- Keep outside-click cancel behavior.

Only change the table input source from `dishes` to `discoveryDishes`.

Also fix this existing mapping bug while touching table code:

```tsx
// current bug
setRowRef={(el) => { rowRefs.current[leftDish.id] = el }}

// correct
setRowRef={(el) => { rowRefs.current[rightDish.id] = el }}
```

## 10. Empty States + Safety

Add fallback blocks:

```tsx
{favorites.length === 0 && <p>No favorites yet.</p>}
{discovery.length === 0 && <p>No discovery dishes right now.</p>}
{leastOften.length === 0 && <p>No least-often dishes yet.</p>}
```

Guard bad images:

```tsx
<img
  src={item.dish.imageUrl}
  alt={item.dish.name}
  onError={(e) => {
    (e.currentTarget as HTMLImageElement).src = "/fallback-dish.png";
  }}
/>
```

## 11. Acceptance Checklist

1. Mobile (`<500px`):
- Top slider shows 1 full card and part of next.
- Swiping halfway and releasing snaps to current dominant card.
- Middle discovery table still supports choose -> confirm -> submit.
- Bottom slider behaves same as top slider.

2. Desktop (`>=500px`):
- Sliders show 2 cards in viewport.
- `Next 1`, `Last`, `Back 1`, `First` buttons work for both sliders.
- Window shifts by exactly 1 card for next/back.

3. Data mapping:
- Top uses `userFavorites`.
- Middle uses `userDiscovery`.
- Bottom uses `userLeastOftenInTop`.

## 12. Recommended Implementation Order

1. Add backend `GET /dishchoice/recommendations` proxy.
2. Add frontend recommendation types.
3. Add `handleGetRecommendations` and new states in `HomnayangiPage.tsx`.
4. Extract/reuse discovery table with `discoveryDishes`.
5. Add `useDishCarousel` hook.
6. Add reusable `RecommendationCarousel` component.
7. Add CSS for responsive slider behavior.
8. Validate mobile + desktop acceptance checklist.

## 13. Follow-Up Update (Approved)

After initial implementation, these behavior changes were approved and are now required:

1. Section order:
- `Most Chosen Dishes` (top slider)
- `Least Often In Top` (second slider)
- `Discovery For You` (table)

2. Desktop slider nav visibility:
- Keep icon-only nav buttons.
- Show nav buttons on wide screens whenever slider has data (not only when length > 2).

3. Auto-load recommendations:
- Trigger `GET /dishchoice/recommendations` on page enter (`useEffect` on mount).

4. Mobile pull-to-refresh:
- At top of page, pull down shows refresh icon.
- If pull distance >= threshold then release -> re-fetch recommendations.
- If below threshold then release -> return scroll to top, no fetch.

5. Bottom actions:
- Keep `Get all` button at page bottom.
- On wide screen, also show `Refresh` button next to `Get all`.
- On mobile, refresh is done by pull-to-refresh; no extra refresh button needed.

### 13.1 Updated Render Order Example

```tsx
<RecommendationCarousel title="Most Chosen Dishes" ... />
<RecommendationCarousel title="Least Often In Top" ... />
<section>
  <h3>Discovery For You</h3>
  <table>...</table>
</section>
<div className="homnayangi-actions homnayangi-actions--bottom">
  <button>Get all</button>
  {!isMobile && <button>Refresh</button>}
</div>
```

### 13.2 Pull-To-Refresh Hook Logic Example

```tsx
useEffect(() => {
  if (!isMobile) return;

  const onTouchStart = (event: TouchEvent) => {
    if (window.scrollY > 0) return;
    // start pull tracking
  };

  const onTouchMove = (event: TouchEvent) => {
    // update pull distance + show icon
  };

  const onTouchEnd = () => {
    // threshold reached -> refresh recommendations
    // else -> scroll back to top only
  };

  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("touchend", onTouchEnd, { passive: true });

  return () => {
    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onTouchEnd);
  };
}, [isMobile]);
```

## 14. Follow-Up Update (Second Pass)

These refinements were added after validating UI behavior:

1. Slider title + nav placement:
- Move icon nav section inline and directly next to slider title.
- Apply to both `Most Chosen Dishes` and `Least Often In Top`.

2. Discovery heading alignment:
- Ensure `Discovery For You` uses the same left-aligned heading style as slider titles.

3. Pull-to-refresh tuning:
- Lower threshold to a lighter trigger (example: `72px`).
- Increase drag response factor (example: `0.75`) for better touch feel.
- Show text hint next to refresh icon:
  - `Pull to refresh`
  - `Release to refresh`
  - `Refreshing...`

4. Desktop layout fix for sidebar overlap:
- Main body width and left offset must use the live sidebar width (`collapsed` or `expanded`).
- Avoid `translateX` tricks that leave part of content under the fixed sidebar.
- Use:
  - `width: calc(100vw - sidebarWidth)`
  - `margin-left: sidebarWidth`

### 14.1 Desktop Layout Snippet

```tsx
const sidebarWidth = isSidebarCollapsed
  ? COLLAPSED_SIDEBAR_WIDTH
  : EXPANDED_SIDEBAR_WIDTH;

const desktopStyle = {
  marginTop: TOP_BAR_HEIGHT,
  width: `calc(100vw - ${sidebarWidth}px)`,
  marginLeft: sidebarWidth,
  transition: "margin-left 0.2s ease, width 0.2s ease",
};
```
