import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../config";
import type { DishDetails } from "../types/dish";
import "./HomnayangiPage.css";

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

type DishItemCardProps = {
  dish: DishDetails;
  armedDishId: number | null;
  isChoosingEnabled: boolean;
  isSubmittingChoice: boolean;
  onChooseClick: (dishId: number) => void;
  setRowRef: (el: HTMLDivElement | null) => void;
}

function DishItemCard({
  dish,
  armedDishId,
  isChoosingEnabled,
  isSubmittingChoice,
  onChooseClick,
  setRowRef
}: DishItemCardProps) {
  const isConfirming = armedDishId === dish.id;

  return (
    <div className="dish-item-card" ref={setRowRef}>
      <div className="dish-item-image-wrap">
        <img className="dish-item-image" src={dish.imageUrl} alt={dish.name} />

        {isChoosingEnabled && (
          <button
            type="button"
            className={`choose-btn choose-btn--overlay ${isConfirming ? "choose-btn--confirm" : ""}`}
            onClick={() => onChooseClick(dish.id)}
            disabled={isSubmittingChoice}>
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
  )
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

function toDishRow(dishes: DishDetails[]): Array<[DishDetails, DishDetails | null]> {
  const rows: Array<[DishDetails, DishDetails | null]> = [];

  for (let i = 0; i < dishes.length; i += 2) {
    rows.push([dishes[i], dishes[i + 1] ?? null]);
  }

  return rows;
}

export default function HomnayangiPage({ onNotify }: HomnayangiPageProps) {
  const [dishes, setDishes] = useState<DishDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [armedDishId, setArmedDishId] = useState<number | null>(null);
  const [isChoosingEnabled, setIsChoosingEnabled] = useState(true);
  const [isSubmittingChoice, setIsSubmittingChoice] = useState(false);

  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const dishRows = toDishRow(dishes);

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
      setDishes(normalizeDishResponse(payload));
    } catch {
      setError("Cannot load dishes right now.");
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
  }

  useEffect(() => {
    if (armedDishId === null) return;

    const onPointerDown = (event: PointerEvent) => {
      const container = rowRefs.current[armedDishId];
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

  return (
    <section style={{ padding: 16 }}>
      <h2>Homnayangi</h2>
      {!isChoosingEnabled && (
        <button
          type="button"
          onClick={() => {
            setIsChoosingEnabled(true);
            setArmedDishId(null);
            setError(null);
          }}>
          Choose again
        </button>
      )}
      <button type="button" onClick={handleGetAll} disabled={loading}>
        {loading ? "Loading..." : "Get all"}
      </button>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <table
        style={{
          marginTop: 12,
          width: "100%",
          borderCollapse: "collapse",
        }}
      >
        <tbody>
          {dishes.length === 0 && !loading ? (
            <tr>
              <td
                colSpan={2}
                className="dish-grid-empty"
              >
                No dishes loaded.
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
                    setRowRef={(el) => { rowRefs.current[leftDish.id] = el }}
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
                      setRowRef={(el) => { rowRefs.current[leftDish.id] = el }}
                    />
                  ) : (
                    <div className="dish-item-card dish-item-card-placeholder" aria-hidden />
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
