# Homnayangi Double-Tap Confirm Plan

This plan implements the exact behavior you requested for choosing a cuisine dish from `HomnayangiPage`.

## 1. Behavior Mapping (Instruction -> Implementation)

1. Under each `dish.name`, show a `Choose` button.
- Render button in each name cell.

2. First click changes button style to confirm state.
- Track `armedDishId`.
- If clicked dish is not armed, set it as armed.
- Confirm state style: light green bg + dark green text + check icon + `Confirm?`.

3. A dialogue rises from the button.
- Render a small absolute-positioned popover only when `armedDishId === dish.id`.
- Animate with `opacity + translateY`.

4. Second click confirms and submits.
- If clicked dish is already armed, call `POST /dishchoice/choice` with `{ dishId }`.
- On success, collapse popover, show success notification, disable choose mode.

5. Clicking elsewhere cancels confirm state.
- Use `document.pointerdown` + refs.
- If click is outside active row container, call `setArmedDishId(null)`.

6. After successful API call:
- Show generic notification `Dish chosen!`.
- Hide all `Choose` buttons (`isChoosingEnabled = false`).
- Show top button `Choose again` to re-enable choosing.

## 2. Fix Existing Notification Modal Bug (Required)

`frontend/src/components/NotificationModal.tsx` currently uses `open` in dependency array. It should be `isOpen`.

```tsx
useEffect(() => {
  if (!isOpen) return;

  setClosing(false);

  const closeTimer = setTimeout(() => setClosing(true), durationMs);
  const unmountTimer = setTimeout(() => onClose(), durationMs + 220);

  return () => {
    clearTimeout(closeTimer);
    clearTimeout(unmountTimer);
  };
}, [isOpen, durationMs, onClose, message]);
```

## 3. Parent Notification Hook-Up (LandingPage -> HomnayangiPage)

Pass a notify callback from `LandingPage` so Homnayangi page can reuse your existing generic notification modal.

### 3.1 Update page usage in `frontend/src/pages/LandingPage.tsx`

```tsx
{activePage === "homnayangi" && (
  <HomnayangiPage
    onNotify={(message) => setNotification({ isOpen: true, message })}
  />
)}
```

### 3.2 Update `HomnayangiPage` props

```tsx
type HomnayangiPageProps = {
  onNotify: (message: string) => void;
};

export default function HomnayangiPage({ onNotify }: HomnayangiPageProps) {
  // ...
}
```

## 4. Homnayangi State Model

Use a tiny state machine in `frontend/src/pages/HomnayangiPage.tsx`:

```tsx
const [dishes, setDishes] = useState<DishDetails[]>([]);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

const [armedDishId, setArmedDishId] = useState<number | null>(null);
const [isChoosingEnabled, setIsChoosingEnabled] = useState(true);
const [isSubmittingChoice, setIsSubmittingChoice] = useState(false);
```

### Ref map for outside click cancellation

```tsx
const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});
```

## 5. API Helper for Choice Submit

```tsx
async function submitChoice(dishId: number): Promise<void> {
  const accessToken = localStorage.getItem("token");

  if (!accessToken) {
    throw new Error("Please login first.");
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
```

## 6. Double-Tap Handler Logic

```tsx
const handleChooseClick = async (dishId: number) => {
  if (!isChoosingEnabled || isSubmittingChoice) return;

  if (armedDishId !== dishId) {
    // First tap: arm confirmation state
    setArmedDishId(dishId);
    return;
  }

  // Second tap: submit
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
```

## 7. Outside Click Cancel Logic

```tsx
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
```

This exactly gives: “click somewhere else -> return to current page state and button resets to Choose.”

## 8. Choose-Again Toggle

At the top of the page body:

```tsx
{!isChoosingEnabled && (
  <button
    type="button"
    onClick={() => {
      setIsChoosingEnabled(true);
      setArmedDishId(null);
      setError(null);
    }}
  >
    Choose again
  </button>
)}
```

## 9. Row Rendering (Name + Button + Rising Dialog)

Inside each row, in the `name` cell:

```tsx
<td style={{ border: "1px solid #e5e5e5", padding: 8 }}>
  <div
    className="dish-name-cell"
    ref={(el) => {
      rowRefs.current[dish.id] = el;
    }}
  >
    <div className="dish-name-text">{dish.name}</div>

    {isChoosingEnabled && (
      <button
        type="button"
        className={`choose-btn ${armedDishId === dish.id ? "choose-btn--confirm" : ""}`}
        onClick={() => handleChooseClick(dish.id)}
        disabled={isSubmittingChoice}
      >
        {armedDishId === dish.id ? (
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

    <div
      className={`choose-popover ${armedDishId === dish.id ? "choose-popover--open" : ""}`}
      role="dialog"
      aria-hidden={armedDishId !== dish.id}
    >
      By choosing this dish the system will record it and use it for recommendations.
    </div>
  </div>
</td>
```

## 10. Styling for Confirm Button + Rising Dialog

Create `frontend/src/pages/HomnayangiPage.css` and import it from page:

```tsx
import "./HomnayangiPage.css";
```

CSS:

```css
.dish-name-cell {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  gap: 8px;
}

.dish-name-text {
  font-weight: 600;
}

.choose-btn {
  border: 1px solid #cfd8dc;
  background: #fff;
  color: #2b2b2b;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.choose-btn:hover {
  background: #f7f7f7;
}

.choose-btn--confirm {
  background: #e8f5e9;
  border-color: #9ccc9c;
  color: #1b5e20;
}

.choose-btn__icon {
  font-weight: 700;
}

.choose-popover {
  position: absolute;
  left: 0;
  top: calc(100% + 6px);
  width: 280px;
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

## 11. Optional Backend Proxy for `POST /dishchoice/choice`

If your Nest server does not yet expose this endpoint, add it.

### 11.1 Controller (`server/src/controller/dishchoice.controller.ts`)

```ts
import { Body, Controller, Get, Headers, Post, UnauthorizedException } from "@nestjs/common";
import { DishChoiceService } from "src/service/dishchoice.service";

@Controller("dishchoice")
export class DishChoiceController {
  constructor(private readonly dishChoiceService: DishChoiceService) {}

  @Get("dishes")
  async getAllDishes(@Headers("authorization") authorization?: string) {
    if (!authorization || !authorization.toLowerCase().startsWith("bearer ")) {
      throw new UnauthorizedException("Missing or invalid bearer token");
    }

    const accessToken = authorization.slice(7).trim();
    return this.dishChoiceService.getAllDishes(accessToken);
  }

  @Post("choice")
  async chooseDish(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: { dishId: number },
  ) {
    if (!authorization || !authorization.toLowerCase().startsWith("bearer ")) {
      throw new UnauthorizedException("Missing or invalid bearer token");
    }

    const accessToken = authorization.slice(7).trim();
    return this.dishChoiceService.chooseDish(accessToken, body.dishId);
  }
}
```

### 11.2 Service (`server/src/service/dishchoice.service.ts`)

```ts
async chooseDish(accessToken: string, dishId: number): Promise<unknown> {
  const url = `${this.backendUrl}/api/cuisine/choice`;

  const response = await firstValueFrom(
    this.http.post(
      url,
      { dishId },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    ),
  );

  return response.data;
}
```

Adjust upstream path if your Java backend uses a different endpoint.

## 12. Final Integration Checklist

1. `Get all` still works.
2. First tap on `Choose` switches to confirm style and shows popover.
3. Click outside closes confirm state.
4. Second tap submits `POST /dishchoice/choice` with `{ dishId }`.
5. Success shows `Dish chosen!` notification and hides all choose buttons.
6. `Choose again` restores choosing state.
7. No duplicate submits while request is in-flight.
