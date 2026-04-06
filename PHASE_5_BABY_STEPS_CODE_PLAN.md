# Phase 5 Baby Steps Code Plan (Room UI and Host Controls)

This guide is for implementing **Phase 5** yourself in very small steps, with checkpoints after each step.

Scope:
1. Room panel UI above all content.
2. Display room ID (subtle), member list, host badge, ready status.
3. Start button visible only for host.
4. Guard rules for Start button enabled state.
5. Leave button for players to exit room.
6. Host transfer logic with toast notification.
7. No game selection or game UI yet.

---

## 0. Current Starting Point

You already have:
1. `HomnayangiPage` with invite button and invite modal (Phase 4).
2. Backend room state with members, status, host info.
3. `MultiplayerConnectionProvider` with `activeRoom` state and React context.
4. Socket events: `room.joined`, `room.updated`.
5. Notification system for success/error feedback.
6. TopBar with notification bell and join functionality.

Important current gaps:
1. No `RoomPanel` component exists.
2. `activeRoom` is stored in context but not displayed.
3. No Start button or Leave button.
4. No host transfer UI feedback.
5. No tooltip mechanism for disabled states.

Goal for Phase 5:
1. Display room panel above page title showing member list and host info.
2. Start button visible and enabled only when host + all members ready.
3. Leave button allows players to exit room (sends `room.leave` event).
4. Host transfers automatically if host disconnects.
5. Toast notification shows when host transfers.
6. Tooltip explains why Start is disabled.

---

## 1. Create RoomPanel Component

Create `frontend/src/components/RoomPanel.tsx` with the room display structure.

```tsx
import { useState } from "react";
import type { RoomState } from "../types/multiplayer";
import "./RoomPanel.css";

interface RoomPanelProps {
  room: RoomState;
  currentUsername: string | null;
  isHost: boolean;
  isStartDisabled: boolean;
  startDisabledReason: string | null;
  onStart: () => void;
  onLeave: () => void;
}

export default function RoomPanel({
  room,
  currentUsername,
  isHost,
  isStartDisabled,
  startDisabledReason,
  onStart,
  onLeave,
}: RoomPanelProps) {
  const [showStartTooltip, setShowStartTooltip] = useState(false);

  return (
    <div className="room-panel">
      <div className="room-panel-header">
        <div className="room-info">
          <h3>Room</h3>
          <p className="room-id">ID: {room.roomId}</p>
        </div>
        <button
          type="button"
          className="leave-btn"
          onClick={onLeave}
        >
          Leave
        </button>
      </div>

      <div className="members-section">
        <h4>Players ({room.members.length})</h4>
        <ul className="members-list">
          {room.members.map((member) => (
            <li key={member.username} className="member-item">
              <span className="member-name">
                {member.username}
                {member.isHost && <span className="host-badge">Host</span>}
                {member.username === currentUsername && <span className="you-badge">You</span>}
              </span>
              <span className={`ready-status ${member.hasChosenDish ? "ready" : "not-ready"}`}>
                {member.hasChosenDish ? "Ready" : "Choosing..."}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {isHost && (
        <div className="host-actions">
          <div
            className="start-button-wrapper"
            onMouseEnter={() => setShowStartTooltip(true)}
            onMouseLeave={() => setShowStartTooltip(false)}
          >
            <button
              type="button"
              className="start-btn"
              onClick={onStart}
              disabled={isStartDisabled}
              title={startDisabledReason || "Start the game"}
            >
              Start Game
            </button>
            {showStartTooltip && isStartDisabled && startDisabledReason && (
              <div className="start-tooltip">{startDisabledReason}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

Checkpoint:
1. Component created with proper props.
2. Member list displays correctly.
3. Start button visible only for host.
4. Tooltip mechanism in place for disabled state.

---

## 2. Create RoomPanel Styles

Create `frontend/src/components/RoomPanel.css` with styling for the room panel.

```css
.room-panel {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 16px;
  margin-bottom: 24px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.room-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  padding-bottom: 12px;
}

.room-info h3 {
  margin: 0 0 4px 0;
  font-size: 18px;
}

.room-id {
  margin: 0;
  font-size: 12px;
  opacity: 0.8;
}

.leave-btn {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s ease;
}

.leave-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.leave-btn:active {
  background: rgba(255, 255, 255, 0.4);
}

.members-section {
  margin-bottom: 16px;
}

.members-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  opacity: 0.9;
}

.members-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.member-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.member-item:last-child {
  border-bottom: none;
}

.member-name {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 14px;
}

.host-badge {
  background: rgba(255, 193, 7, 0.8);
  color: #333;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: bold;
}

.you-badge {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
}

.ready-status {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.2);
}

.ready-status.ready {
  background: rgba(76, 175, 80, 0.5);
  color: #c8e6c9;
}

.ready-status.not-ready {
  background: rgba(255, 152, 0, 0.5);
  color: #ffe0b2;
}

.host-actions {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}

.start-button-wrapper {
  position: relative;
  flex: 1;
}

.start-btn {
  width: 100%;
  background: rgba(76, 175, 80, 0.9);
  color: white;
  border: none;
  padding: 10px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 15px;
  font-weight: bold;
  transition: background 0.2s ease;
}

.start-btn:hover:not(:disabled) {
  background: rgba(76, 175, 80, 1);
}

.start-btn:active:not(:disabled) {
  background: rgba(56, 142, 60, 1);
}

.start-btn:disabled {
  background: rgba(200, 200, 200, 0.6);
  cursor: not-allowed;
  opacity: 0.6;
}

.start-tooltip {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: #333;
  color: white;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  margin-bottom: 8px;
  z-index: 10;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.start-tooltip::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 4px solid transparent;
  border-top-color: #333;
}

@media (max-width: 640px) {
  .room-panel {
    padding: 12px;
    margin-bottom: 16px;
  }

  .room-panel-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .leave-btn {
    align-self: flex-end;
  }

  .start-tooltip {
    white-space: normal;
    width: 90vw;
    left: 50%;
    transform: translateX(-50%);
  }
}
```

Checkpoint:
1. Room panel is styled with gradient background.
2. Member list is visually clear with badges.
3. Start button styling reflects disabled state.
4. Tooltip appears above button.
5. Mobile responsive.

---

## 3. Add RoomPanel to HomnayangiPage

Import and add RoomPanel above the page title.

```tsx
import RoomPanel from "../components/RoomPanel";
import { useMultiplayer } from "../multiplayer/useMultiplayer";

export default function HomnayangiPage({ onNotify }: HomnayangiPageProps) {
  const { activeRoom, username: currentUsername } = useMultiplayer();
  
  // ... existing state and handlers

  const isInRoom = activeRoom !== null;
  const isHost = isInRoom && activeRoom.hostUsername === currentUsername;

  return (
    <section className="homnayangi-page">
      {/* Room panel above all content */}
      {isInRoom && activeRoom && (
        <div className="room-panel-wrapper">
          <RoomPanel
            room={activeRoom}
            currentUsername={currentUsername}
            isHost={isHost}
            isStartDisabled={false} // TODO: Calculate from readiness
            startDisabledReason={null} // TODO: Generate reason
            onStart={() => {}} // TODO: Implement start
            onLeave={() => {}} // TODO: Implement leave
          />
        </div>
      )}

      {/* Pull-to-refresh space */}
      {isMobile && (
        <div
          ref={pullSpaceRef}
          className={`pull-refresh-space ${showPullRefreshIndicator ? "pull-refresh-space--visible" : ""}`}
          aria-hidden={!showPullRefreshIndicator}
        >
```

Add to `frontend/src/pages/HomnayangiPage.css`:

```css
.room-panel-wrapper {
  margin-bottom: 16px;
}
```

Checkpoint:
1. RoomPanel displays when user is in a room.
2. No errors or prop issues.
3. Member list visible with correct styling.

---

## 4. Implement Start Button Logic

Calculate if Start should be disabled and generate reason.

```tsx
  const getStartDisabledReason = (): string | null => {
    if (!isInRoom || !activeRoom) return "Not in a room";

    // Need at least 2 players
    if (activeRoom.members.length < 2) {
      return `Need at least 2 players (${activeRoom.members.length}/2)`;
    }

    // All must have chosen dish
    const notReady = activeRoom.members.filter((m) => !m.hasChosenDish);
    if (notReady.length > 0) {
      return `Waiting for ${notReady.map((m) => m.username).join(", ")} to choose`;
    }

    return null;
  };

  const startDisabledReason = getStartDisabledReason();
  const isStartDisabled = startDisabledReason !== null;

  const handleStartGame = () => {
    if (isStartDisabled || !isHost || !activeRoom) return;
    // TODO: Emit game.start event
    onNotify("Starting game...");
  };

  const handleLeaveRoom = () => {
    // TODO: Emit room.leave event
    onNotify("Left the room");
  };
```

Update RoomPanel call:

```tsx
          <RoomPanel
            room={activeRoom}
            currentUsername={currentUsername}
            isHost={isHost}
            isStartDisabled={isStartDisabled}
            startDisabledReason={startDisabledReason}
            onStart={handleStartGame}
            onLeave={handleLeaveRoom}
          />
```

Checkpoint:
1. Start button correctly disabled based on readiness.
2. Tooltip shows appropriate reason for disabled state.
3. Host-only restriction works.

---

## 5. Implement Leave Room Handler

This phase needs both sides:
1. frontend emits `room.leave`
2. backend actually removes the member, reassigns host if needed, and clears the leaving client out of room state

Do not stop after adding the frontend emit. The gateway work is the important part here.

Files:
1. `frontend/src/multiplayer/MultiplayerContext.ts`
2. `frontend/src/multiplayer/MultiplayerConnectionProvider.tsx`
3. `frontend/src/pages/HomnayangiPage.tsx`
4. `server/src/multiplayer/dto/multiplayer.events.ts`
5. `server/src/multiplayer/multiplayer.gateway.ts`

### 5.1 Add the shared payload type first

In `server/src/multiplayer/dto/multiplayer.events.ts`, add:

```ts
export type RoomLeavePayload = {
  roomId: string;
};
```

Checkpoint:
1. The gateway handler has a typed payload instead of ad-hoc `unknown` parsing.

### 5.2 Keep the frontend emit simple

In `MultiplayerConnectionProvider.tsx`, keep `leaveRoom` as a thin emitter:

```tsx
const leaveRoom = useCallback(() => {
  const socket = socketRef.current;

  if (!socket || !activeRoom) return;

  socket.emit("room.leave", { roomId: activeRoom.roomId });
}, [activeRoom]);
```

Expose it through context:

```tsx
export type MultiplayerContextValue = {
  // ... existing
  leaveRoom: () => void;
}
```

and:

```tsx
<MultiplayerContext.Provider
  value={{
    // ... existing
    leaveRoom,
  }}
>
```

Checkpoint:
1. The Leave button now sends a real `room.leave` event.

### 5.3 Add the gateway handler skeleton

In `server/src/multiplayer/multiplayer.gateway.ts`, add:

```ts
@SubscribeMessage("room.leave")
handleRoomLeave(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: RoomLeavePayload,
) {
  // validate -> remove member -> transfer host if needed -> emit updates
}
```

Import the DTO at the top of the file.

Checkpoint:
1. `room.leave` now exists as a real backend event instead of a frontend-only assumption.

### 5.4 Validate the leave request carefully

Inside `handleRoomLeave`, validate in this order:
1. socket user exists
2. payload has a `roomId`
3. `userToRoom` contains a room for this user
4. the user's current room matches `payload.roomId`
5. the room exists in `store.rooms`
6. the user is actually a member of that room

Recommended shape:

```ts
const username = this.store.socketUser.get(client.id);
if (!username) {
  client.emit("error", { code: "UNAUTHENTICATED", message: "Socket is not registered." });
  return;
}

const roomId = payload?.roomId?.trim();
if (!roomId) {
  client.emit("error", { code: "INVALID_INPUT", message: "Room ID is required." });
  return;
}

const currentRoomId = this.store.userToRoom.get(username);
if (!currentRoomId || currentRoomId !== roomId) {
  client.emit("error", { code: "FORBIDDEN", message: "You are not in this room." });
  return;
}
```

Checkpoint:
1. A stale client cannot remove itself from the wrong room.

### 5.5 Remove the leaving member from the room store

Once validated:
1. find the room
2. remove the leaving member from `room.members`
3. delete their private dish choice if Phase 6 data exists
4. delete `userToRoom` for that username

Example core update:

```ts
const room = this.store.rooms.get(roomId);
if (!room) {
  client.emit("error", { code: "ROOM_NOT_FOUND", message: "Room does not exist." });
  return;
}

room.members = room.members.filter((member) => member.username !== username);
delete room.dishChoicesByUsername[username];
this.store.userToRoom.delete(username);
```

Checkpoint:
1. The store no longer thinks the user is still in the room.

### 5.6 Decide how the leaving client clears `activeRoom`

Recommended decision:
1. add a dedicated `room.left` server -> client event for the leaving user
2. keep `room.updated` for remaining members only

Why this is the recommended path:
1. The leaving user is no longer a member, so they should not rely on a room snapshot they no longer belong to.
2. It avoids awkward client-side guessing about whether the leave succeeded.
3. It keeps `activeRoom = null` driven by server confirmation instead of optimistic local state.

Add this behavior:

```ts
for (const socketId of this.store.userSockets.get(username) ?? []) {
  this.server.to(socketId).emit("room.left", { roomId });
}
```

Then in `MultiplayerConnectionProvider.tsx`, add a listener:

```tsx
const handleRoomLeft = () => {
  setActiveRoom(null);
};

socket.on("room.left", handleRoomLeft);
// cleanup with socket.off("room.left", handleRoomLeft)
```

Checkpoint:
1. The leaving user reliably exits the room in client state.

### 5.7 Transfer host if the leaver was host

If the removed member was host:
1. pick the next host deterministically
2. update `room.hostUsername`
3. update each remaining member's `isHost`

Recommended rule:
1. choose the first remaining connected member
2. if no connected members remain, choose the first remaining member

Example helper logic:

```ts
private assignNextHost(room: RoomStateInternal): void {
  const nextHost =
    room.members.find((member) => member.isConnected) ?? room.members[0] ?? null;

  room.hostUsername = nextHost ? nextHost.username : "";
  room.members = room.members.map((member) => ({
    ...member,
    isHost: nextHost ? member.username === nextHost.username : false,
  }));
}
```

Call it only if:
1. the leaving user was host
2. `room.members.length > 0`

Checkpoint:
1. Host transfer is deterministic and visible to everyone still in the room.

### 5.8 Remove the room entirely if it becomes empty

After removing the member:
1. if `room.members.length === 0`
2. delete the room from `store.rooms`
3. return early after emitting `room.left` to the leaver

Example:

```ts
if (room.members.length === 0) {
  this.store.rooms.delete(roomId);
  return;
}
```

Checkpoint:
1. Empty rooms do not linger in memory.

### 5.9 Broadcast the updated room to the remaining members

If the room still has members:
1. save the updated room back to `store.rooms`
2. emit sanitized `room.updated` to remaining members only

Use your existing helper:

```ts
this.store.rooms.set(roomId, room);
this.emitRoomUpdated(room);
```

Checkpoint:
1. Remaining users immediately see the smaller member list.
2. If host changed, they also see the new host label.

### 5.10 Hook the page up to the finished flow

In `HomnayangiPage.tsx`, keep the page handler simple:

```tsx
const { activeRoom, username: currentUsername, leaveRoom } = useMultiplayer();

const handleLeaveRoom = () => {
  leaveRoom();
  onNotify("Leaving room...");
};
```

Once `room.left` is implemented in the provider, the page should no longer need to manually force `activeRoom` to `null`.

Checkpoint:
1. Leave button feels immediate.
2. Final room removal still depends on server confirmation.

### 5.11 Manual test this backend flow directly

Test these exact cases:
1. Non-host leaves a 2-person room:
   1. leaver gets `room.left`
   2. remaining user sees room with 1 member
   3. remaining user becomes host if needed
2. Host leaves a 3-person room:
   1. next host is assigned deterministically
   2. remaining users get `room.updated`
3. Last member leaves:
   1. `userToRoom` entry is removed
   2. room is deleted from `store.rooms`
4. Client sends wrong `roomId`:
   1. backend rejects with `FORBIDDEN`

Checkpoint:
1. `room.leave` works as a real backend state transition, not just a UI action.

---

## 6. Handle Host Transfer Events

Update `MultiplayerConnectionProvider` to listen for host transfer and show notification.

```tsx
  useEffect(() => {
    if (!socket) return;

    const handleRoomUpdated = (payload: RoomState) => {
      const wasHost = activeRoom?.hostUsername === username;
      const isNowHost = payload.hostUsername === username;

      if (!wasHost && isNowHost) {
        // We just became host
        console.log("You are now the host");
        // Could show toast here through a callback
      }

      setActiveRoom(payload);
    };

    socket.on("room.updated", handleRoomUpdated);

    return () => {
      socket.off("room.updated", handleRoomUpdated);
    };
  }, [socket, activeRoom, username]);
```

Add to context for triggering notifications:

```tsx
  const [hostTransferMessage, setHostTransferMessage] = useState<string | null>(null);

  useEffect(() => {
    if (hostTransferMessage) {
      const timer = setTimeout(() => setHostTransferMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [hostTransferMessage]);
```

In HomnayangiPage, add effect to listen for host transfer:

```tsx
  useEffect(() => {
    const prevHostUsername = useRef<string | null>(null);

    if (activeRoom && activeRoom.hostUsername !== prevHostUsername.current) {
      if (prevHostUsername.current !== null) {
        // Host changed
        onNotify(`${activeRoom.hostUsername} is now the host`);
      }
      prevHostUsername.current = activeRoom.hostUsername;
    }
  }, [activeRoom?.hostUsername, onNotify]);
```

Checkpoint:
1. Host transfer shows as notification/toast.
2. UI updates to reflect new host.
3. Start button available to new host if ready.

---

## 7. Implement Start Game Handler

Add socket emit for game start (backend handler needed).

In `MultiplayerConnectionProvider`, add:

```tsx
  const startGame = useCallback((game: string) => {
    if (!socket || !activeRoom) return;
    socket.emit("game.start", { roomId: activeRoom.roomId, game });
  }, [socket, activeRoom]);
```

Add to context value and types.

Update HomnayangiPage handler:

```tsx
  const { startGame } = useMultiplayer();

  const handleStartGame = () => {
    if (isStartDisabled || !isHost || !activeRoom) return;
    startGame("rps"); // Phase 7 will add game selection modal
    onNotify("Starting Rock Paper Scissors...");
  };
```

Checkpoint:
1. Start button emits `game.start` event.
2. Backend receives game start request.
3. Backend validates conditions.

---

## 8. Test Room Panel Display

Manual test:
1. User A invites User B to Homnayangi.
2. User B joins via notification.
3. Both see room panel above title with:
   - Room ID (subtle)
   - Player list with "Ready" status
   - Host badge on User A
   - "You" badge on current user
4. User A sees Start button (disabled until both have chosen dish).
5. User B sees Leave button but no Start button.
6. Both choose dish -> Start button enables.
7. User A clicks Start -> event fires (game logic in Phase 7).
8. If User A leaves while host -> User B becomes host with notification.

Checkpoint:
1. Room panel displays correctly for both users.
2. All buttons appear/disappear as expected.
3. Host transfer works seamlessly.
4. Readiness calculations correct.

---

## 9. Edge Cases and Error Handling

Handle:
- User disconnects while in room (backend removes them, others see update).
- Last player leaves room (room destroyed or becomes empty).
- Start attempted with incomplete data (disabled button prevents but add guard).
- Multiple rapid host transfers (use ref to prevent duplicate notifications).

Checkpoint:
1. All error states handled gracefully.
2. No console errors.
3. UI stays in sync with backend state.

---

## 10. Final Polish

- Verify responsive design on mobile.
- Tooltip positioning doesn't overflow on small screens.
- Animations/transitions feel smooth.
- Accessibility: labels, ARIA attributes where needed.
- Test with slow network (see loading states, delayed updates).

Checkpoint:
1. Room panel works on mobile and desktop.
2. All interactions feel responsive.
3. UX is polished and professional.
