# Homnayangi 2-Items-Per-Row Layout Plan

This plan improves your current simple table layout while keeping your existing choose/confirm logic.

## 1. Behavior Mapping (Instruction -> Implementation)

1. Remove table headers `Image` and `Name`.
- Remove `<thead>` completely.
- Keep only `<tbody>` rows.

2. Each dish item includes:
- dish image,
- choose/confirm button overlaid at bottom of image,
- dish name below image.

3. Each row shows exactly 2 dish items.
- Convert `dishes` list into pairs.
- Render each pair as one `<tr>` with two `<td>` cells.

4. Support odd number of dishes.
- If last row has one dish, render a second empty cell to keep layout consistent.

## 2. Pairing Helper (2 Items Per Row)

Add this helper inside `frontend/src/pages/HomnayangiPage.tsx`:

```tsx
function toDishRows(dishes: DishDetails[]): Array<[DishDetails, DishDetails | null]> {
  const rows: Array<[DishDetails, DishDetails | null]> = [];

  for (let i = 0; i < dishes.length; i += 2) {
    rows.push([dishes[i], dishes[i + 1] ?? null]);
  }

  return rows;
}
```

Then in component:

```tsx
const dishRows = toDishRows(dishes);
```

## 3. Replace Table Markup (No Header, 2 Cells Per Row)

Replace current `<table>` block with:

```tsx
<table className="dish-grid-table">
  <tbody>
    {dishRows.length === 0 && !loading ? (
      <tr>
        <td className="dish-grid-empty" colSpan={2}>
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
              setRowRef={(el) => {
                rowRefs.current[leftDish.id] = el;
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
                setRowRef={(el) => {
                  rowRefs.current[rightDish.id] = el;
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
```

## 4. Extract One Reusable Dish Item Card

In the same file (`HomnayangiPage.tsx`), add a local component under your imports/types:

```tsx
type DishItemCardProps = {
  dish: DishDetails;
  armedDishId: number | null;
  isChoosingEnabled: boolean;
  isSubmittingChoice: boolean;
  onChooseClick: (dishId: number) => void;
  setRowRef: (el: HTMLDivElement | null) => void;
};

function DishItemCard({
  dish,
  armedDishId,
  isChoosingEnabled,
  isSubmittingChoice,
  onChooseClick,
  setRowRef,
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
```

This preserves your existing confirm flow and outside-click handling via `rowRefs`.

## 5. CSS for 2-Column Row + Overlay Button + Name Below Image

Update `frontend/src/pages/HomnayangiPage.css` with these layout classes:

```css
.dish-grid-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 12px 12px;
  margin-top: 12px;
}

.dish-grid-cell {
  width: 50%;
  vertical-align: top;
}

.dish-grid-empty {
  text-align: center;
  padding: 16px;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
}

.dish-item-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid #e5e5e5;
  border-radius: 10px;
  background: #fff;
}

.dish-item-card--placeholder {
  min-height: 240px;
  border: 1px dashed #e0e0e0;
  background: #fafafa;
}

.dish-item-image-wrap {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
}

.dish-item-image {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
}

.dish-item-name {
  font-weight: 600;
  line-height: 1.3;
}

.choose-btn--overlay {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 8px;
  justify-content: center;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(2px);
}

.choose-popover {
  position: absolute;
  left: 10px;
  right: 10px;
  top: calc(100% + 6px);
  z-index: 20;
  background: #fff;
  border: 1px solid #dfe7df;
  border-radius: 10px;
  padding: 10px;
  font-size: 12px;
  color: #2b2b2b;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
  opacity: 0;
  transform: translateY(8px);
  pointer-events: none;
  transition: opacity 160ms ease, transform 160ms ease;
}

.choose-popover--open {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
```

Keep your existing `.choose-btn`, `.choose-btn--confirm`, `.choose-btn__icon` styles; only add `choose-btn--overlay`.

## 6. Mobile Rule (Optional but Recommended)

If 2 columns feel cramped on very small screens, switch to one item per row:

```css
@media (max-width: 640px) {
  .dish-grid-table,
  .dish-grid-table tbody,
  .dish-grid-table tr,
  .dish-grid-cell {
    display: block;
    width: 100%;
  }

  .dish-grid-cell {
    margin-bottom: 12px;
  }
}
```

If you strictly require 2 items on every screen, skip this section.

## 7. Integration Checklist

1. No `Image` / `Name` table headers are rendered.
2. Each visual dish item has image + overlay button + name below.
3. Each desktop row contains 2 dish items.
4. Odd-number list keeps alignment with placeholder second cell.
5. Double-tap confirm behavior still works.
6. Outside-click cancel still works.
7. Success flow still hides choose buttons and shows `Choose again`.
