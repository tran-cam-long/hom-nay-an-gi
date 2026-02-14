import { useState } from "react";
import { API_BASE_URL } from "../config";
import type { DishDetails } from "../types/dish";

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

export default function HomnayangiPage() {
  const [dishes, setDishes] = useState<DishDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <section style={{ padding: 16 }}>
      <h2>Homnayangi</h2>
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
            <th style={{ border: "1px solid #e5e5e5", padding: 8 }}>Type</th>
            <th style={{ border: "1px solid #e5e5e5", padding: 8 }}>Culture</th>
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
                    style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6 }}
                  />
                </td>
                <td style={{ border: "1px solid #e5e5e5", padding: 8 }}>{dish.name}</td>
                <td style={{ border: "1px solid #e5e5e5", padding: 8 }}>{dish.type}</td>
                <td style={{ border: "1px solid #e5e5e5", padding: 8 }}>{dish.culture}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
