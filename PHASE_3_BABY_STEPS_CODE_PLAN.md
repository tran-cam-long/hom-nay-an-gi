# Phase 3 Baby Steps Code Plan (TopBar Notification UX)

This guide is for implementing **Phase 3** yourself in very small steps, with checkpoints after each step.

Scope:
1. Top bar notification UX only.
2. Add a bell button, unread badge, dropdown list, and `Join` action.
3. Navigate to `Homnayangi` from the `Join` button flow you selected.
4. Keep notifications in memory only.
5. No invite modal yet.
6. No room panel yet.
7. No game UI yet.

---

## 0. Current Starting Point

You already have:
1. `LandingPage` restores session state from `localStorage` plus `GET /auth/me`.
2. `LandingPage` mounts `MultiplayerConnectionProvider`.
3. `MultiplayerConnectionProvider` already stores:
   1. `connectionStatus`
   2. `notifications`
   3. `activeRoom`
   4. `lastError`
4. The provider already listens for:
   1. `notification.new`
   2. `invite.expired`
   3. `room.joined`
   4. `room.updated`
   5. `error`
5. `TopBar` already reads `useMultiplayer()` and shows:
   1. connection status
   2. unread count
6. Backend already supports:
   1. `invite.accept`
   2. `room.sync`
   3. `room.joined`
   4. `room.updated`

Important current gaps:
1. `acceptInvite()` in `MultiplayerConnectionProvider` is still a stub.
2. `connect_error` is currently handled like a notification instead of a connection error.
3. `TopBar` has no bell, no dropdown, no `Join` button, and no expired-state UI.
4. `LandingPage` owns `activePage`, but `TopBar` currently has no prop to switch pages.
5. The original draft assumed state-driven navigation, but you chose button-driven navigation for this phase.

Goal for Phase 3:
1. Bell is visible whenever a user is logged in.
2. Incoming invite adds a red unread indicator immediately.
3. Bell click opens a dropdown with invite notifications.
4. Opening the dropdown marks notifications as read.
5. Clicking `Join` emits `invite.accept`.
6. Clicking `Join` also switches the app to `Homnayangi` when local validation passes.
7. Expired invites stay visible but cannot be joined.

---

## 0.5 Decisions Locked In For This Phase

You already chose these answers:
1. `A1`: button-driven navigation
2. `B1`: mark all notifications read when the dropdown opens
3. `C2`: keep expired invites visible with disabled `Join`

### A. Button-driven navigation

Chosen flow:
1. User clicks `Join`.
2. `TopBar` calls `acceptInvite(inviteId)`.
3. If local validation passes, `TopBar` immediately switches page to `"homnayangi"`.

Important tradeoff:
1. This is more optimistic than waiting for `room.joined`.
2. If the server later rejects the invite, the user may already be on `Homnayangi`.
3. That is acceptable for this MVP as long as we only navigate after the local emit path succeeds.

Checkpoint:
1. Navigation comes from the button flow you chose.
2. We do not navigate if local validation already failed.

### B. Mark all read on dropdown open

Chosen flow:
1. Bell opens.
2. Client marks all current notifications read.
3. Red badge clears immediately.

Why this is fine:
1. It matches the original foundation plan.
2. It uses the `markAllNotificationsRead()` helper you already have.
3. It keeps the provider API small.

Checkpoint:
1. Opening the dropdown clears unread state.

### C. Keep expired invites visible with disabled `Join`

Chosen flow:
1. Expired invite stays in the list.
2. Row shows an `Expired` label.
3. `Join` stays disabled.

Why this is fine:
1. It is clearer than silently removing the row.
2. It avoids pointless socket traffic for obviously dead invites.

Checkpoint:
1. Expired invites remain visible but obviously inactive.

---

## 1. Read This Before You Start Coding

Mental model for this phase:
1. `MultiplayerConnectionProvider.tsx` remains the single source of multiplayer state.
2. `TopBar.tsx` is a UI consumer that reads notifications and calls action methods.
3. `LandingPage.tsx` still owns app navigation.
4. For this chosen version, the `Join` button owns page switching after local validation passes.

Rule for this whole phase:
1. Finish one numbered step at a time.
2. Save after each step and check TypeScript errors.
3. Do not start the dropdown UI until `acceptInvite()` really emits.

Important review note about the current implementation:
1. Phase 2 is close, but not fully complete in code.
2. Phase 3 should begin by closing the remaining provider gaps rather than building UI on top of a stub.

---

## 2. Finish the Remaining Provider Gaps First

Goal:
1. Make the provider reliable enough for real notification UX.
2. Make `acceptInvite()` return enough information for button-driven navigation.

Files:
1. `frontend/src/multiplayer/MultiplayerContext.ts`
2. `frontend/src/multiplayer/MultiplayerConnectionProvider.tsx`

### 2.1 Update the context contract for `acceptInvite`

In `MultiplayerContext.ts`, change:

```ts
acceptInvite: (inviteId: string) => void;
```

to:

```ts
acceptInvite: (inviteId: string) => boolean;
```

Why:
1. `TopBar` needs to know whether local validation passed.
2. With your chosen `A1`, the UI should only navigate when the emit path was actually allowed to run.

Checkpoint:
1. The multiplayer API now supports button-driven navigation cleanly.

### 2.2 Replace the stubbed `acceptInvite`

Right now it only writes a `NOT_IMPLEMENTED` error.

Replace it with:

```tsx
const acceptInvite = (inviteId: string) => {
  const socket = socketRef.current;
  const trimmedInviteId = inviteId.trim();

  if (!trimmedInviteId) {
    setLastError(createLocalError("INVALID_INPUT", "Invite ID is required."));
    return false;
  }

  if (!isSocketReady(socket)) {
    setLastError(
      createLocalError(
        "SOCKET_NOT_READY",
        "You are not connected to multiplayer.",
      ),
    );
    return false;
  }

  setLastError(null);
  socket.emit("invite.accept", { inviteId: trimmedInviteId });
  return true;
};
```

Checkpoint:
1. Clicking a future `Join` button will emit a real socket event.
2. The function also reports whether local validation passed.

### 2.3 Fix `connect_error` handling

Right now `handleConnectionError` creates a fake notification.
That is the wrong state bucket.

Replace it with:

```tsx
const handleConnectError = (payload: unknown) => {
  setConnectionStatus("disconnected");
  setLastError(normalizeSocketError(payload));
};
```

Then wire:

```tsx
socket.on("connect_error", handleConnectError);
```

and cleanup:

```tsx
socket.off("connect_error", handleConnectError);
```

Checkpoint:
1. Failed socket connections update `lastError`.
2. They do not pollute the notification list.

### 2.4 Remove the duplicate cleanup line

In the cleanup block, you currently have:

```tsx
socket.off("connect", handleConnect);
socket.off("connect", handleConnect);
```

Change that to one `connect` cleanup only.

Checkpoint:
1. Listener cleanup is correct and not confusing during future refactors.

---

## 3. Add the Navigation Callback in `LandingPage`

Goal:
1. Let `TopBar` switch the app to `Homnayangi` without moving page state out of `LandingPage`.

Files:
1. `frontend/src/pages/LandingPage.tsx`
2. `frontend/src/components/TopBar.tsx`

### 3.1 Extend `TopBar` props

In `TopBar.tsx`, add:

```ts
onOpenHomnayangi: () => void;
```

Checkpoint:
1. `TopBar` can receive a navigation callback from its parent.

### 3.2 Pass the callback from `LandingPage`

In `LandingPage.tsx`, update the `TopBar` usage:

```tsx
<TopBar
  username={loginRes?.username}
  onLoginClick={() => setIsLoginOpen(true)}
  onLogoutClick={handleLogout}
  onOpenHomnayangi={() => setActivePage("homnayangi")}
/>
```

Why this is the minimal version:
1. `activePage` already lives in `LandingPage`.
2. No new context or wrapper component is needed.
3. It matches your chosen button-driven flow directly.

Checkpoint:
1. `LandingPage` still builds.
2. `TopBar` now has the smallest possible navigation API.

### 3.3 Keep the rest of `LandingPage` unchanged

Do not add the previous `activeRoom`-driven page-sync effect in this version.
That was for `A2`, not `A1`.

What stays the same:
1. Session bootstrap logic
2. Sidebar logic
3. Notification modal logic
4. Page rendering logic

Checkpoint:
1. The only page-change addition is the explicit callback passed into `TopBar`.

---

## 4. Upgrade `TopBar` in Small Passes

Goal:
1. Turn the tiny debug display into a usable notification UI.

File:
1. `frontend/src/components/TopBar.tsx`

### 4.1 Add the new imports

You already import `LuLogOut`.
Add:

```tsx
import { useEffect, useRef, useState } from "react";
import { LuBell, LuLogOut } from "react-icons/lu";
```

Checkpoint:
1. `TopBar.tsx` compiles with the bell icon import.

### 4.2 Add local UI state near the top of the component

Inside `TopBar(...)`, keep the existing multiplayer hook call and add:

```tsx
const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
const [pendingInviteId, setPendingInviteId] = useState<string | null>(null);
const [nowMs, setNowMs] = useState(() => Date.now());
const dropdownRef = useRef<HTMLDivElement | null>(null);
```

Also update props usage so the component receives:

```tsx
onOpenHomnayangi
```

Checkpoint:
1. The component still renders before adding the dropdown.

### 4.3 Add tiny helper functions above the component

Add two helpers above `export default function TopBar(...)`.

```tsx
function getInviteTimeLeftLabel(expiresAt: string, nowMs: number): string {
  const remainingMs = new Date(expiresAt).getTime() - nowMs;

  if (remainingMs <= 0) {
    return "Expired";
  }

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  return `${remainingSeconds}s left`;
}

function isJoinDisabled(
  isExpired: boolean,
  inviteId: string,
  pendingInviteId: string | null,
): boolean {
  return isExpired || pendingInviteId === inviteId;
}
```

Why keep helpers tiny:
1. `TopBar` JSX gets crowded fast.
2. These two rules are reused by every invite row.

Checkpoint:
1. Countdown and disabled-state rules now live outside JSX.

### 4.4 Start a 1-second timer only while the dropdown is open

Inside `TopBar(...)`, add:

```tsx
useEffect(() => {
  if (!isNotificationsOpen) {
    return;
  }

  setNowMs(Date.now());

  const intervalId = window.setInterval(() => {
    setNowMs(Date.now());
  }, 1000);

  return () => {
    window.clearInterval(intervalId);
  };
}, [isNotificationsOpen]);
```

Why:
1. Countdown text only matters when the list is visible.
2. This avoids an always-running timer in the top bar.

Checkpoint:
1. Opening the dropdown updates countdown labels every second.

### 4.5 Mark notifications read when the dropdown opens

Add this effect:

```tsx
useEffect(() => {
  if (!isNotificationsOpen) {
    return;
  }

  markAllNotificationsRead();
}, [isNotificationsOpen, markAllNotificationsRead]);
```

Read these values from `useMultiplayer()`:

```tsx
const {
  connectionStatus,
  notifications,
  activeRoom,
  acceptInvite,
  markAllNotificationsRead,
} = useMultiplayer();
```

Checkpoint:
1. The red unread indicator disappears when the user opens the dropdown.

### 4.6 Add a click-outside close effect

Add:

```tsx
useEffect(() => {
  if (!isNotificationsOpen) {
    return;
  }

  const handlePointerDown = (event: MouseEvent) => {
    if (!dropdownRef.current?.contains(event.target as Node)) {
      setIsNotificationsOpen(false);
    }
  };

  window.addEventListener("mousedown", handlePointerDown);

  return () => {
    window.removeEventListener("mousedown", handlePointerDown);
  };
}, [isNotificationsOpen]);
```

Checkpoint:
1. Clicking outside the dropdown closes it.

### 4.7 Clear local pending join state when room state appears

Add:

```tsx
useEffect(() => {
  if (activeRoom && pendingInviteId) {
    setPendingInviteId(null);
  }
}, [activeRoom, pendingInviteId]);
```

Why:
1. It gives you a simple “joining...” state without needing socket acknowledgement callbacks.
2. Even though navigation is button-driven, room state is still useful for cleaning up local button state.

Checkpoint:
1. A successful room join resets the local joining state.

### 4.8 Build the bell button shell first

Inside the logged-in branch, replace the plain unread text with a bell wrapper while keeping:
1. avatar
2. username
3. connection status
4. logout button

Suggested bell shell:

```tsx
<div
  ref={dropdownRef}
  style={{ position: "relative", display: "flex", alignItems: "center" }}
>
  <button
    type="button"
    onClick={() => setIsNotificationsOpen((prev) => !prev)}
    aria-label="Notifications"
    aria-expanded={isNotificationsOpen}
    style={{
      position: "relative",
      border: 0,
      background: "transparent",
      padding: 6,
      cursor: "pointer",
      lineHeight: 1,
      fontSize: 18,
    }}
  >
    <LuBell />
    {unreadCount > 0 && (
      <span
        style={{
          position: "absolute",
          top: 2,
          right: 2,
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#d92d20",
        }}
      />
    )}
  </button>
</div>
```

Checkpoint:
1. Logged-in users see a bell.
2. Unread notifications show a red dot.

### 4.9 Add the dropdown panel markup

Still inside that same wrapper, render the panel conditionally:

```tsx
{isNotificationsOpen && (
  <div
    style={{
      position: "absolute",
      top: "calc(100% + 8px)",
      right: 0,
      width: 320,
      maxWidth: "min(320px, calc(100vw - 24px))",
      background: "#fff",
      border: "1px solid #ddd",
      borderRadius: 12,
      boxShadow: "0 12px 28px rgba(0, 0, 0, 0.12)",
      padding: 12,
      zIndex: 1100,
    }}
  >
    {/* content goes here */}
  </div>
)}
```

Checkpoint:
1. Bell click opens a positioned dropdown panel.

### 4.10 Render the empty state first

Inside the dropdown, start with:

```tsx
{notifications.length === 0 ? (
  <div style={{ fontSize: 14, color: "#666" }}>
    No notifications yet.
  </div>
) : (
  // list comes next
)}
```

Checkpoint:
1. The dropdown is still useful even before invite rows are added.

### 4.11 Render notification rows

Inside the non-empty branch, map through `notifications`.
For each row:
1. show the message
2. show countdown or `Expired`
3. show `Join` only when `item.invite` exists

Suggested row logic:

```tsx
{notifications.map((item) => {
  const inviteId = item.invite?.inviteId ?? "";
  const inviteExpiresAt = item.invite?.expiresAt ?? "";
  const joinDisabled =
    !item.invite ||
    isJoinDisabled(item.isExpired, inviteId, pendingInviteId);

  return (
    <div
      key={item.id}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "10px 0",
        borderTop: "1px solid #f0f0f0",
      }}
    >
      <div style={{ fontSize: 14, lineHeight: 1.4 }}>{item.message}</div>

      {item.invite && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 12, color: "#666" }}>
            {item.isExpired
              ? "Expired"
              : getInviteTimeLeftLabel(inviteExpiresAt, nowMs)}
          </span>

          <button
            type="button"
            disabled={joinDisabled}
            onClick={() => {
              if (!inviteId) {
                return;
              }

              const didEmit = acceptInvite(inviteId);
              if (!didEmit) {
                return;
              }

              setPendingInviteId(inviteId);
              setIsNotificationsOpen(false);
              onOpenHomnayangi();
            }}
          >
            {pendingInviteId === inviteId ? "Joining..." : "Join"}
          </button>
        </div>
      )}
    </div>
  );
})}
```

Important guard:
1. Only call `acceptInvite` when `inviteId` is non-empty.
2. Only navigate after `acceptInvite(...)` returns `true`.

Checkpoint:
1. Invite notifications render usable rows.
2. Expired invites cannot be joined.
3. Clicking `Join` updates the button to `Joining...`.
4. Clicking `Join` also switches the page to `Homnayangi` for the chosen `A1` flow.

### 4.12 Keep the current debug connection text for now

Do not remove:

```tsx
<span style={{ fontSize: 12, opacity: 0.7 }}>{connectionStatus}</span>
```

Reason:
1. It is still useful while testing the websocket UX.
2. You can remove or restyle it in a later polish pass.

Checkpoint:
1. You keep a quick realtime health signal while building the dropdown.

---

## 5. Optional Nice-to-Have After the Core Works

These are optional for the first pass of Phase 3.

### 5.1 Show only invite notifications in the dropdown

If you want the list tighter, derive:

```tsx
const inviteNotifications = notifications.filter((item) => item.invite);
```

Then render that list instead of the full array.

### 5.2 Reset pending join state on relevant error

If the server rejects `invite.accept`, you can add:

```tsx
const { lastError } = useMultiplayer();

useEffect(() => {
  if (lastError && pendingInviteId) {
    setPendingInviteId(null);
  }
}, [lastError, pendingInviteId]);
```

This is a little blunt because not every error belongs to the current invite join.
It is still reasonable for an MVP.

### 5.3 Close the dropdown when room state appears

If you want the UI a bit tidier, you can change the `activeRoom` effect to:

```tsx
useEffect(() => {
  if (activeRoom && pendingInviteId) {
    setPendingInviteId(null);
    setIsNotificationsOpen(false);
  }
}, [activeRoom, pendingInviteId]);
```

---

## 6. Suggested Test Flow for This Phase

Do this manually in order.

### 6.1 Verify provider prerequisites

1. Log in.
2. Confirm the top bar still shows `connected`.
3. Trigger a bad socket connection scenario if possible.
4. Confirm `connect_error` does not create a fake notification row.

If this fails:
1. Re-check Step `2.3`.

### 6.2 Verify unread badge behavior

1. Log in as user B.
2. Send an invite from user A.
3. Confirm the bell shows a red dot immediately.
4. Open the dropdown.
5. Confirm the red dot disappears because notifications were marked read.

If this fails:
1. Re-check Step `4.5`.

### 6.3 Verify invite list rendering

1. Send a fresh invite.
2. Confirm the dropdown shows:
   1. invite message
   2. countdown text
   3. `Join` button

If this fails:
1. Re-check Step `4.11`.
2. Confirm the provider really stores `invite` data inside each notification.

### 6.4 Verify expired state

1. Send an invite.
2. Wait 60 seconds.
3. Confirm the matching row changes to `Expired`.
4. Confirm `Join` is disabled.

If this fails:
1. Re-check the `invite.expired` listener in the provider.
2. Re-check `isJoinDisabled(...)`.

### 6.5 Verify join flow and navigation

1. Send an invite from user A to user B.
2. On user B, click `Join`.
3. Confirm the button changes to `Joining...`.
4. Confirm the app immediately switches to `homnayangi`.
5. Confirm a room event arrives afterward.
6. Confirm `activeRoom` becomes non-null.

If this fails:
1. Re-check Step `2.2`.
2. Re-check Step `3.2`.
3. Re-check backend `invite.accept` handling.

### 6.6 Verify reconnect-in-room behavior

1. Join a room.
2. Refresh the page.
3. Confirm the socket reconnects.
4. Confirm `room.sync` restores room state.
5. Do not expect automatic page switching on refresh in this chosen `A1` version.

If this fails:
1. Re-check `room.sync` behavior from Phase 2.

---

## 7. Stop Point Before Phase 4

At the end of this phase, you should have:
1. A working bell button in `TopBar`.
2. A red unread indicator.
3. A dropdown list of notifications.
4. `Join` buttons for invite notifications.
5. Expired invite rows with disabled actions.
6. Button-driven navigation to `Homnayangi` after local `acceptInvite()` validation passes.

You should still not build:
1. The invite entry modal from `HomnayangiPage`.
2. The room member panel.
3. Host controls.
4. Dish readiness sync UI.
5. Game selection or RPS UI.

---

## Definition of Done for Phase 3

Phase 3 is done when:
1. Logged-in users always see a notification bell.
2. New invite notifications immediately show a red unread indicator.
3. Clicking the bell opens a dropdown list.
4. Opening the dropdown marks notifications as read.
5. Clicking `Join` emits a real `invite.accept`.
6. Clicking `Join` switches the app to `Homnayangi` when local validation passes.
7. Expired invites remain visible and cannot be joined.
8. The provider no longer treats `connect_error` as a notification.

---

## Recommended File List

Frontend:
1. `frontend/src/components/TopBar.tsx`
2. `frontend/src/pages/LandingPage.tsx`
3. `frontend/src/multiplayer/MultiplayerConnectionProvider.tsx`
4. `frontend/src/multiplayer/MultiplayerContext.ts`
5. `frontend/src/multiplayer/useMultiplayer.ts`

Backend:
1. No backend changes required for the intended MVP Phase 3 flow.
2. Only revisit backend if you later want explicit socket acknowledgements for `invite.accept`.

---

## Suggested Commit Boundary

If you want reviewable commits, split them like this:
1. Commit 1:
   1. `frontend/src/multiplayer/MultiplayerContext.ts`
   2. `frontend/src/multiplayer/MultiplayerConnectionProvider.tsx`
   3. provider fixes for `acceptInvite` and `connect_error`
2. Commit 2:
   1. `frontend/src/pages/LandingPage.tsx`
   2. `frontend/src/components/TopBar.tsx`
   3. button-driven navigation callback
3. Commit 3:
   1. `frontend/src/components/TopBar.tsx`
   2. bell, badge, dropdown, and expired-invite UX
