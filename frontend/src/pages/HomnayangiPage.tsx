import { useCallback, useEffect, useRef, useState } from "react";
import { MdRefresh } from "react-icons/md";
import RecommendationCarousel from "../components/RecommendationCarousel";
import { API_BASE_URL } from "../config";
import useIsMobile from "../hooks/useIsMobile";
import type { DishDetails } from "../types/dish";
import type {
  RecommendationItem,
  RotationRecommendationsResponse,
} from "../types/recommendation";
import "./HomnayangiPage.css";

type DishItemCardProps = {
  dish: DishDetails;
  armedDishId: number | null;
  isChoosingEnabled: boolean;
  isSubmittingChoice: boolean;
  onChooseClick: (dishId: number) => void;
  setItemRef: (el: HTMLDivElement | null) => void;
};

const PULL_REFRESH_THRESHOLD = 72;

function normalizeDishResponse(payload: unknown): DishDetails[] {
  if (Array.isArray(payload)) return payload as DishDetails[];

  if (
    payload &&
    typeof payload === "object" &&
    "dishes" in payload &&
    Array.isArray((payload as { dishes: unknown[] }).dishes)
  ) {
    return (payload as { dishes: DishDetails[] }).dishes;
  }

  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    Array.isArray((payload as { data: unknown[] }).data)
  ) {
    return (payload as { data: DishDetails[] }).data;
  }

  return [];
}

function normalizeRecommendations(payload: unknown): RotationRecommendationsResponse {
  if (!payload || typeof payload !== "object") {
    return {
      userFavorites: [],
      userDiscovery: [],
      userLeastOftenInTop: [],
    };
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

function DishItemCard({
  dish,
  armedDishId,
  isChoosingEnabled,
  isSubmittingChoice,
  onChooseClick,
  setItemRef,
}: DishItemCardProps) {
  const isConfirming = armedDishId === dish.id;

  return (
    <div className="dish-item-card" ref={setItemRef}>
      <div className="dish-item-image-wrap">
        <img className="dish-item-image" src={dish.imageUrl} alt={dish.name} />
        {isChoosingEnabled && (
          <button
            type="button"
            className={`choose-btn choose-btn--overlay ${isConfirming ? "choose-btn--confirm" : ""}`}
            onClick={() => onChooseClick(dish.id)}
            disabled={isSubmittingChoice}
          >
            {isConfirming ? (
              <>
                <span className="choose-btn__icon" aria-hidden>
                  ✓
                </span>
                Confirm?
              </>
            ) : (
              "Choose"
            )}
          </button>
        )}
      </div>
      <div className="dish-item-name">{dish.name}</div>

      <div
        className={`choose-popover ${isConfirming ? "choose-popover--open" : ""}`}
        role="dialog"
        aria-hidden={!isConfirming}
      >
        By choosing this dish the system will record it and use it for recommendations.
      </div>
    </div>
  );
}

type HomnayangiPageProps = {
  onNotify: (message: string) => void;
};

async function submitChoice(dishId: number): Promise<void> {
  const accessToken = localStorage.getItem("token");

  if (!accessToken) {
    throw new Error("Please login first");
  }

  const response = await fetch(`${API_BASE_URL}/dishchoice/choice`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ dishId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to choose dish: ${response.status}`);
  }
}

function toDishRows(dishes: DishDetails[]): Array<[DishDetails, DishDetails | null]> {
  const rows: Array<[DishDetails, DishDetails | null]> = [];

  for (let i = 0; i < dishes.length; i += 2) {
    rows.push([dishes[i], dishes[i + 1] ?? null]);
  }

  return rows;
}

function incrementChosenDisplay(items: RecommendationItem[], dishId: number, chosenAt: string) {
  return items.map((item) =>
    item.dish.id === dishId
      ? {
          ...item,
          timesChosen: item.timesChosen + 1,
          lastChosenTime: chosenAt,
        }
      : item,
  );
}

export default function HomnayangiPage({ onNotify }: HomnayangiPageProps) {
  const [favorites, setFavorites] = useState<RecommendationItem[]>([]);
  const [discovery, setDiscovery] = useState<RecommendationItem[]>([]);
  const [leastOftenInTop, setLeastOftenInTop] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [armedDishId, setArmedDishId] = useState<number | null>(null);
  const [isChoosingEnabled, setIsChoosingEnabled] = useState(true);
  const [isSubmittingChoice, setIsSubmittingChoice] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  const isMobile = useIsMobile();
  const itemRefs = useRef<Record<number, HTMLElement | null>>({});
  const pullStartYRef = useRef(0);
  const isTrackingPullRef = useRef(false);
  const pullDistanceRef = useRef(0);

  const discoveryDishes = discovery.map((item) => item.dish);
  const dishRows = toDishRows(discoveryDishes);

  const handleGetRecommendations = useCallback(async () => {
    const accessToken = localStorage.getItem("token");

    if (!accessToken) {
      setError("Please login first.");
      return;
    }

    setLoading(true);
    setIsRefreshing(true);
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
      setLeastOftenInTop(normalized.userLeastOftenInTop);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot load recommendations right now.");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
      setPullDistance(0);
      pullDistanceRef.current = 0;
    }
  }, []);

  const handleGetAll = async () => {
    const accessToken = localStorage.getItem("token");

    if (!accessToken) {
      setError("Please login first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/dishchoice/dishes`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get dishes: ${response.status}`);
      }

      const payload = await response.json();
      const allDishes = normalizeDishResponse(payload);

      setDiscovery(
        allDishes.map((dish) => ({
          dish,
          timesChosen: 0,
          lastChosenTime: null,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot load dishes right now.");
    } finally {
      setLoading(false);
    }
  };

  const handleChooseClick = async (dishId: number) => {
    if (!isChoosingEnabled || isSubmittingChoice) return;

    if (armedDishId !== dishId) {
      setArmedDishId(dishId);
      return;
    }

    setIsSubmittingChoice(true);
    setError(null);

    try {
      await submitChoice(dishId);
      setArmedDishId(null);
      setIsChoosingEnabled(false);
      onNotify("Dish chosen!");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot submit choice right now.");
    } finally {
      setIsSubmittingChoice(false);
    }
  };

  const handleCarouselChooseClick = async (dishId: number) => {
    if (!isChoosingEnabled || isSubmittingChoice) return;

    if (armedDishId !== dishId) {
      setArmedDishId(dishId);
      return;
    }

    setIsSubmittingChoice(true);
    setError(null);

    try {
      await submitChoice(dishId);
      const chosenAt = new Date().toISOString();

      setFavorites((prev) => incrementChosenDisplay(prev, dishId, chosenAt));
      setLeastOftenInTop((prev) => incrementChosenDisplay(prev, dishId, chosenAt));
      setDiscovery((prev) => incrementChosenDisplay(prev, dishId, chosenAt));

      setArmedDishId(null);
      setIsChoosingEnabled(false);
      onNotify("Dish chosen!");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot submit choice right now.");
    } finally {
      setIsSubmittingChoice(false);
    }
  };

  useEffect(() => {
    if (armedDishId === null) return;

    const onPointerDown = (event: PointerEvent) => {
      const container = itemRefs.current[armedDishId];
      if (!container) {
        setArmedDishId(null);
        return;
      }

      const target = event.target as Node;
      if (!container.contains(target)) {
        setArmedDishId(null);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [armedDishId]);

  useEffect(() => {
    void handleGetRecommendations();
  }, [handleGetRecommendations]);

  useEffect(() => {
    if (!isMobile) return;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      if (window.scrollY > 0) return;

      isTrackingPullRef.current = true;
      pullStartYRef.current = event.touches[0].clientY;
      pullDistanceRef.current = 0;
      setPullDistance(0);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!isTrackingPullRef.current) return;

      const deltaY = event.touches[0].clientY - pullStartYRef.current;
      if (deltaY <= 0) return;

      const nextDistance = Math.min(deltaY * 0.75, 140);
      pullDistanceRef.current = nextDistance;
      setPullDistance(nextDistance);

      // Prevent browser native bounce so indicator behavior stays predictable.
      event.preventDefault();
    };

    const onTouchEnd = () => {
      if (!isTrackingPullRef.current) return;

      isTrackingPullRef.current = false;

      if (pullDistanceRef.current >= PULL_REFRESH_THRESHOLD) {
        void handleGetRecommendations();
      } else {
        setPullDistance(0);
        pullDistanceRef.current = 0;
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [handleGetRecommendations, isMobile]);

  const showPullRefreshIndicator = isMobile && (pullDistance > 0 || isRefreshing);
  const isPullRefreshArmed = pullDistance >= PULL_REFRESH_THRESHOLD;

  return (
    <section className="homnayangi-page">
      <h2>Homnayangi</h2>

      {!isChoosingEnabled && (
        <div className="homnayangi-actions homnayangi-actions--top">
          <button
            type="button"
            className="choose-again-btn"
            onClick={() => {
              setIsChoosingEnabled(true);
              setArmedDishId(null);
              setError(null);
            }}
          >
            Choose again
          </button>
        </div>
      )}

      {showPullRefreshIndicator && (
        <div
          className={`pull-refresh-indicator ${isPullRefreshArmed ? "pull-refresh-indicator--armed" : ""} ${isRefreshing ? "pull-refresh-indicator--refreshing" : ""}`}
          style={{ height: `${Math.max(28, pullDistance)}px` }}
        >
          <MdRefresh aria-hidden />
          <span className="pull-refresh-indicator__label">
            {isRefreshing
              ? "Refreshing..."
              : isPullRefreshArmed
                ? "Release to refresh"
                : "Pull to refresh"}
          </span>
        </div>
      )}

      {error && <p className="homnayangi-error">{error}</p>}

      <RecommendationCarousel
        title="Most Chosen Dishes"
        emptyMessage="No favorites yet."
        items={favorites}
        isMobile={isMobile}
        armedDishId={armedDishId}
        isChoosingEnabled={isChoosingEnabled}
        isSubmittingChoice={isSubmittingChoice}
        onChooseClick={handleCarouselChooseClick}
        setItemRef={(dishId, element) => {
          itemRefs.current[dishId] = element;
        }}
      />

      <RecommendationCarousel
        title="Least Often In Top"
        emptyMessage="No least-often dishes yet."
        items={leastOftenInTop}
        isMobile={isMobile}
        armedDishId={armedDishId}
        isChoosingEnabled={isChoosingEnabled}
        isSubmittingChoice={isSubmittingChoice}
        onChooseClick={handleCarouselChooseClick}
        setItemRef={(dishId, element) => {
          itemRefs.current[dishId] = element;
        }}
      />

      <section className="discovery-section">
        <h3 className="section-title">Discovery For You</h3>

        <table className="dish-grid-table">
          <tbody>
            {dishRows.length === 0 && !loading ? (
              <tr>
                <td className="dish-grid-empty" colSpan={2}>
                  No discovery dishes right now.
                </td>
              </tr>
            ) : (
              dishRows.map(([leftDish, rightDish]) => (
                <tr key={leftDish.id}>
                  <td className="dish-grid-cell">
                    <DishItemCard
                      dish={leftDish}
                      armedDishId={armedDishId}
                      isChoosingEnabled={isChoosingEnabled}
                      isSubmittingChoice={isSubmittingChoice}
                      onChooseClick={handleChooseClick}
                      setItemRef={(el) => {
                        itemRefs.current[leftDish.id] = el;
                      }}
                    />
                  </td>
                  <td className="dish-grid-cell">
                    {rightDish ? (
                      <DishItemCard
                        dish={rightDish}
                        armedDishId={armedDishId}
                        isChoosingEnabled={isChoosingEnabled}
                        isSubmittingChoice={isSubmittingChoice}
                        onChooseClick={handleChooseClick}
                        setItemRef={(el) => {
                          itemRefs.current[rightDish.id] = el;
                        }}
                      />
                    ) : (
                      <div className="dish-item-card dish-item-card--placeholder" aria-hidden />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <div className="homnayangi-actions homnayangi-actions--bottom">
        <button type="button" onClick={handleGetAll} disabled={loading}>
          {loading ? "Loading..." : "Get all"}
        </button>
        {!isMobile && (
          <button type="button" onClick={handleGetRecommendations} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        )}
      </div>
    </section>
  );
}
