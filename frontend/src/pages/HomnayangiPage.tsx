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

export default function HomnayangiPage({ onNotify }: HomnayangiPageProps) {
  const [dishes, setDishes] = useState<DishDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [armedDishId, setArmedDishId] = useState<number | null>(null);
  const [isChoosingEnabled, setIsChoosingEnabled] = useState(true);
  const [isSubmittingChoice, setIsSubmittingChoice] = useState(false);

  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});

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
          border: "1px solid #e5e5e5",
        }}
      >
        <thead>
          <tr>
            <th style={{ border: "1px solid #e5e5e5", padding: 8 }}>Image</th>
            <th style={{ border: "1px solid #e5e5e5", padding: 8 }}>Name</th>
          </tr>
        </thead>
        <tbody>
          {dishes.length === 0 && !loading ? (
            <tr>
              <td
                colSpan={4}
                style={{ border: "1px solid #e5e5e5", padding: 8, textAlign: "center" }}
              >
                No dishes loaded.
              </td>
            </tr>
          ) : (
            dishes.map((dish) => (
              <tr key={dish.id}>
                <td style={{ border: "1px solid #e5e5e5", padding: 8 }}>
                  <img
                    src={dish.imageUrl}
                    alt={dish.name}
                    style={{ width: 250, height: "auto", objectFit: "cover", borderRadius: 6 }}
                  />
                </td>
                <td style={{ border: "1px solid #e5e5e5", padding: 8 }}>
                  <div className="dish-name-cell" ref={(el) => { rowRefs.current[dish.id] = el }}>
                    <div className="dish-name-text">{dish.name}<div />
                      {isChoosingEnabled && (
                        <button
                          type="button"
                          className={`choose-btn ${armedDishId === dish.id ? "choose-btn--confirm" : ""}`}
                          onClick={() => handleChooseClick(dish.id)}
                          disabled={isSubmittingChoice}>
                          {armedDishId === dish.id ? (
                            <>
                              <span className="choose-btn__icon" aria-hidden>✓</span>
                              Confirm?
                            </>
                          ) : ("Choose")}
                        </button>
                      )}

                      <div
                        className={`choose-popover ${armedDishId === dish.id ? "choose-popover--open" : ""}`}
                        role="dialog" aria-hidden={armedDishId !== dish.id}>
                        By choosing this dish the system will record your choice and use it for recommendations.
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
