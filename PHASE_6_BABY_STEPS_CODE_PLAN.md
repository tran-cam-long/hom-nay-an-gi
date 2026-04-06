# Phase 6 Baby Steps Code Plan (Dish Choice Integration for Multiplayer)

This guide is for implementing **Phase 6** in very tiny steps.
Every step below includes:
1. exactly which file to touch
2. what code to add or replace
3. what should be true before moving on

Scope:
1. After a successful dish choice save, sync readiness into the multiplayer room.
2. Keep dish privacy intact.
3. Store chosen dish IDs only on the server.
4. Make room readiness survive reconnect.
5. Do not build Phase 7 game selection UI yet.
6. Do not build RPS gameplay yet.

---

## 0. Current State You Already Have

The codebase is already partway through Phase 6.

Already present right now:
1. Backend DTO `RoomSetDishChoicePayload` exists in `server/src/multiplayer/dto/multiplayer.events.ts`.
2. Backend `room.setDishChoice` handler exists in `server/src/multiplayer/multiplayer.gateway.ts`.
3. Backend internal room shape already has `dishChoicesByUsername`.
4. Frontend provider already exposes `setRoomDishChoice`.
5. `HomnayangiPage` already calls `setRoomDishChoice(dishId)` after HTTP dish save succeeds.
6. `RoomPanel` already renders readiness using `member.hasChosenDish`.

Real goal of this updated plan:
1. make the flow cleaner
2. make the current implementation easier to verify
3. close the small correctness gaps
4. leave Phase 7 with a solid base

---

## 1. Lock the Phase 6 Rules First

Before changing code, keep these rules fixed:

1. `POST /dishchoice/choice` stays the primary save path.
2. `room.setDishChoice` fires only after the HTTP save succeeds.
3. Public room state must never include `dishId` or dish name.
4. Only `hasChosenDish` should be visible to other players.
5. Re-choosing a dish should keep the player as `Ready`.

Checkpoint:
1. You know exactly what this phase is allowed to expose and what must stay private.

---

## 2. Confirm the Backend Event Contract

File:
1. `server/src/multiplayer/dto/multiplayer.events.ts`

This file should contain:

```ts
export type RoomSetDishChoicePayload = {
  roomId: string,
  dishId: number;
}
```

If it does not match, make it match exactly.

Why this baby step matters:
1. The rest of the phase depends on one stable payload shape.

Checkpoint:
1. There is one typed backend payload for `room.setDishChoice`.

---

## 3. Confirm the Server-Only Room Shape

File:
1. `server/src/multiplayer/types/multiplayer.types.ts`

Keep the public type separate from the stored type:

```ts
export type RoomState = {
  roomId: string,
  members: RoomMember[];
  status: "lobby" | "in_game" | "finished";
  selectedGame: "rps" | null;
  hostUsername: string;
}

export type RoomStateInternal = RoomState & {
  dishChoicesByUsername: Record<string, number>;
}
```

Checkpoint:
1. Dish choices live only in `RoomStateInternal`.
2. Public `RoomState` stays safe to send to the client.

---

## 4. Make the Privacy Filter Explicit

File:
1. `server/src/multiplayer/types/multiplayer.types.ts`

Keep or add this helper:

```ts
export function toPublicRoomState(room: RoomStateInternal): RoomState {
  return {
    roomId: room.roomId,
    members: room.members,
    status: room.status,
    selectedGame: room.selectedGame,
    hostUsername: room.hostUsername,
  }
}
```

Why this deserves its own step:
1. This is the main privacy wall for Phase 6.

Checkpoint:
1. There is one obvious place that strips private room data before emit.

---

## 5. Confirm New Rooms Start With Private Dish Storage

File:
1. `server/src/multiplayer/multiplayer.gateway.ts`

In `createLobbyRoom`, make sure the returned object includes:

```ts
dishChoicesByUsername: {},
```

Full shape should look like:

```ts
private createLobbyRoom(roomId: string, inviter: string, invitee: string): RoomStateInternal {
  return {
    roomId,
    status: "lobby" as const,
    selectedGame: "rps" as const,
    hostUsername: inviter,
    members: [
      {
        username: inviter,
        isHost: true,
        hasChosenDish: false,
        isConnected: true,
        isEliminated: false,
      },
      {
        username: invitee,
        isHost: false,
        hasChosenDish: false,
        isConnected: true,
        isEliminated: false,
      },
    ],
    dishChoicesByUsername: {},
  };
}
```

Checkpoint:
1. Every new room starts with empty private dish storage.

---

## 6. Make Sure Every Room Emit Uses Public State

File:
1. `server/src/multiplayer/multiplayer.gateway.ts`

There are three places to check.

### 6.1 `room.sync`

This should emit:

```ts
client.emit("room.updated", { roomState: toPublicRoomState(room) });
```

### 6.2 `emitRoomToUsers`

This helper should build public state first:

```ts
const publicRoomState = toPublicRoomState(room);
```

And then emit `publicRoomState`, not `room`.

### 6.3 `emitRoomUpdated`

This helper should also do:

```ts
const publicRoomState = toPublicRoomState(room);
```

Checkpoint:
1. No room event leaks `dishChoicesByUsername`.

---

## 7. Tighten the `room.setDishChoice` Backend Handler

File:
1. `server/src/multiplayer/multiplayer.gateway.ts`

You already have the handler. Now make it easier to trust by checking each guard one by one.

Target shape:

```ts
@SubscribeMessage("room.setDishChoice")
handleRoomSetDishChoice(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: RoomSetDishChoicePayload
) {
  const username = this.store.socketUser.get(client.id);
  if (!username) {
    client.emit("error", { code: "UNAUTHENTICATED", message: "Socket is not registered." });
    return;
  }

  if (!payload || !payload.roomId || !payload.dishId) {
    client.emit("error", {
      code: "INVALID_INPUT",
      message: "Room set dish choice payload must be present with roomId and dishId."
    });
    return;
  }

  const payloadRoomId = payload.roomId;
  const room = this.store.rooms.get(payloadRoomId);
  if (!room) {
    client.emit("error", {
      code: "ROOM_NOT_FOUND",
      message: `This roomId ${payloadRoomId} is not existing!`
    });
    return;
  }

  if (room.status !== "lobby") {
    client.emit("error", {
      code: "ROOM_NOT_JOINABLE",
      message: `This roomId ${payloadRoomId}'s status is not lobby!`
    });
    return;
  }

  const member = room.members.find((item) => item.username === username);
  if (!member) {
    client.emit("error", {
      code: "FORBIDDEN",
      message: `This username ${username} does not belong to the room!`
    });
    return;
  }

  const payloadDishId = payload.dishId;
  room.dishChoicesByUsername[username] = payloadDishId;
  member.hasChosenDish = true;
  this.store.rooms.set(room.roomId, room);
  this.emitRoomUpdated(room);
}
```

Small improvement to make here:
1. change the `payload.dishId` guard from truthy/falsy to a numeric validation

Use:

```ts
if (!payload || !payload.roomId || !Number.isFinite(payload.dishId)) {
  client.emit("error", {
    code: "INVALID_INPUT",
    message: "Room set dish choice payload must be present with roomId and numeric dishId."
  });
  return;
}
```

Why this matters:
1. `0` would fail a truthy check even if you ever use it later.
2. Numeric validation is clearer.

Checkpoint:
1. Invalid payloads fail safely.
2. Valid payloads only update readiness in `lobby`.

---

## 8. Add a Debug Log Right After Readiness Update

File:
1. `server/src/multiplayer/multiplayer.gateway.ts`

Right after:

```ts
member.hasChosenDish = true;
```

add:

```ts
this.logger.log(`${username} marked ready in room ${room.roomId}`);
```

Then keep:

```ts
this.store.rooms.set(room.roomId, room);
this.emitRoomUpdated(room);
```

Checkpoint:
1. Manual testing is easier because the server logs readiness transitions.

---

## 9. Keep the Frontend Provider Contract Small and Safe

File:
1. `frontend/src/multiplayer/MultiplayerContext.ts`

Make sure the context type includes:

```ts
setRoomDishChoice: (dishId: number) => boolean;
```

Checkpoint:
1. Page components can ask the provider to sync readiness.
2. The provider can report whether it emitted or not.

---

## 10. Tighten the Frontend Provider Emit Helper

File:
1. `frontend/src/multiplayer/MultiplayerConnectionProvider.tsx`

The function should look like this:

```tsx
const setRoomDishChoice = (dishId: number) => {
  const socket = socketRef.current;

  if (!activeRoom) {
    setLastError(createLocalError("ROOM_NOT_FOUND", "You are not currently in a room."));
    return false;
  }

  if (!Number.isFinite(dishId)) {
    setLastError(createLocalError("INVALID_INPUT", "Dish ID is invalid."));
    return false;
  }

  if (!isSocketReady(socket)) {
    setLastError(
      createLocalError(
        "SOCKET_NOT_READY",
        "You are not connected to multiplayer."
      ),
    );
    return false;
  }

  setLastError(null);
  socket.emit("room.setDishChoice", {
    roomId: activeRoom.roomId,
    dishId,
  });
  return true;
}
```

Two tiny cleanups to make here if needed:
1. fix the typo `"Your are not connected to multiplayer."` to `"You are not connected to multiplayer."`
2. keep the function return type behavior consistent with `acceptInvite`

Checkpoint:
1. The provider emits only when room state and socket state are both valid.

---

## 11. Expose the Provider Action Through Context Value

File:
1. `frontend/src/multiplayer/MultiplayerConnectionProvider.tsx`

Inside the provider `value`, include:

```tsx
setRoomDishChoice
```

Checkpoint:
1. `useMultiplayer()` consumers can actually call the new action.

---

## 12. Keep `HomnayangiPage` Hook Destructure Honest

File:
1. `frontend/src/pages/HomnayangiPage.tsx`

Make sure the multiplayer hook destructure includes:

```tsx
const {
  activeRoom,
  sendInvite,
  username: currentUsername = null,
  leaveRoom,
  startGame,
  setRoomDishChoice,
} = useMultiplayer();
```

Why this is its own step:
1. It keeps all multiplayer actions visible in one place.
2. It avoids hidden local stubs or disconnected logic later.

Checkpoint:
1. The page explicitly depends on the real provider action.

---

## 13. Extract One Shared Success Helper for Dish Choice

File:
1. `frontend/src/pages/HomnayangiPage.tsx`

Keep one shared helper:

```tsx
const handleSetDishChoiceSuccess = (dishId: number) => {
  if (activeRoom) {
    const didSync = setRoomDishChoice(dishId);
    if (!didSync) {
      onNotify("Dish saved, but room sync failed. Please refresh the room.");
    }
  }

  setArmedDishId(null);
  setIsChoosingEnabled(false);
  onNotify("Dish chosen!");
}
```

Why this step matters:
1. Both choice flows should behave the same in multiplayer.
2. All socket-sync error handling stays in one place.

Checkpoint:
1. There is only one post-success multiplayer sync path.

---

## 14. Wire the Grid Dish Flow Into That Helper

File:
1. `frontend/src/pages/HomnayangiPage.tsx`

Inside `handleChooseClick`, keep:

```tsx
try {
  await submitChoice(dishId);
  handleSetDishChoiceSuccess(dishId);
} catch (e) {
  setError(e instanceof Error ? e.message : "Cannot submit choice right now.");
} finally {
  setIsSubmittingChoice(false);
}
```

Checkpoint:
1. Choosing from the grid updates room readiness after HTTP success.

---

## 15. Wire the Carousel Dish Flow Into The Same Helper

File:
1. `frontend/src/pages/HomnayangiPage.tsx`

Inside `handleCarouselChooseClick`, keep the recommendation updates first:

```tsx
const chosenAt = new Date().toISOString();

setFavorites((prev) => incrementChosenDisplay(prev, dishId, chosenAt));
setLeastOftenInTop((prev) => incrementChosenDisplay(prev, dishId, chosenAt));
setDiscovery((prev) => incrementChosenDisplay(prev, dishId, chosenAt));
```

Then call:

```tsx
handleSetDishChoiceSuccess(dishId);
```

Checkpoint:
1. Grid and carousel now share identical multiplayer sync behavior.

---

## 16. Keep Solo Users Completely Unblocked

File:
1. `frontend/src/pages/HomnayangiPage.tsx`

The helper must keep this condition:

```tsx
if (activeRoom) {
  const didSync = setRoomDishChoice(dishId);
  if (!didSync) {
    onNotify("Dish saved, but room sync failed. Please refresh the room.");
  }
}
```

Do not emit when there is no room.

Checkpoint:
1. Solo dish choosing still works with no multiplayer dependency.

---

## 17. Make the Room Readiness UI Reflect Reality

File:
1. `frontend/src/pages/HomnayangiPage.tsx`

Keep these readiness guards tied to `activeRoom.members`:

```tsx
const getStartDisabledReason = (): string | null => {
  if (!isInRoom || !activeRoom) return "Not in a room";

  if (activeRoom.members.length < 2) {
    return `Need at least 2 players (${activeRoom.members.length}/2)`;
  }

  const notReady = activeRoom.members.filter((member) => !member.hasChosenDish);
  if (notReady.length > 0) {
    return `Waiting for ${notReady.map((member) => member.username).join(", ")} to choose.`;
  }

  return null;
}
```

And keep the `RoomPanel` props wired to those computed values:

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

Why this belongs in Phase 6:
1. It is the visible proof that readiness sync is working.

Checkpoint:
1. Start button readiness reflects realtime room updates.

---

## 18. Verify the Frontend Public Types Stay Privacy-Safe

File:
1. `frontend/src/types/multiplayer.ts`

Keep `RoomMember` and `RoomState` limited to public fields:

```ts
export type RoomMember = {
  username: string;
  isHost: boolean;
  hasChosenDish: boolean;
  isConnected: boolean;
  isEliminated: boolean;
};

export type RoomState = {
  roomId: string;
  members: RoomMember[];
  status: "lobby" | "in_game" | "finished";
  selectedGame: "rps" | null;
  hostUsername: string;
};
```

Do not add:
1. `dishId`
2. `dishName`
3. `dishImage`
4. `dishChoicesByUsername`

Checkpoint:
1. The client type system itself helps prevent privacy leaks.

---

## 19. Manual Test 1: One Player Becomes Ready

Test steps:
1. Log in as User A and User B.
2. User A invites User B.
3. User B joins.
4. Both users confirm both room members show `Choosing...`.
5. User A chooses a dish.

Expected result:
1. User A still gets the normal dish success behavior.
2. Both users see User A become `Ready`.
3. User B does not see the chosen dish.

Checkpoint:
1. Realtime readiness works for a basic case.

---

## 20. Manual Test 2: Both Players Ready Enables Start

Test steps:
1. Continue from the previous room.
2. User B chooses a dish.

Expected result:
1. Both players show `Ready`.
2. Host sees Start enabled.
3. Non-host still cannot start the game.

Checkpoint:
1. Phase 6 data is now enough for Phase 7 start validation.

---

## 21. Manual Test 3: Re-Choose Stays Private

Test steps:
1. Have User A choose a dish.
2. If your UI allows choosing again later, choose a different dish.

Expected result:
1. User A stays `Ready`.
2. No one sees which dish changed.
3. Backend private map updates to the latest `dishId`.

Checkpoint:
1. Privacy still holds when choices change.

---

## 22. Manual Test 4: Reconnect Restores Readiness

Test steps:
1. Get User A into `Ready` state.
2. Refresh User A's tab.
3. Let the socket reconnect and run `room.sync`.

Expected result:
1. User A re-enters the room.
2. `hasChosenDish` is still `true`.
3. Other players still see User A as `Ready`.

Checkpoint:
1. Readiness survives reconnect because the backend is the source of truth.

---

## 23. Done Criteria For Phase 6

You are done when all of these are true:

1. Dish choice still saves through HTTP successfully.
2. Successful dish choice triggers `room.setDishChoice`.
3. The server stores dish IDs privately in `dishChoicesByUsername`.
4. The server emits only public room state.
5. Other players only see `Ready` or `Choosing...`.
6. Reconnect restores readiness state correctly.
7. Host Start button reflects room readiness correctly.

---

## 24. Nice Tiny Cleanup List

These are optional small cleanups that still fit this phase well:

1. In `server/src/multiplayer/multiplayer.gateway.ts`, fix typos like `"Socker is not registered."` to `"Socket is not registered."`
2. In `frontend/src/multiplayer/MultiplayerConnectionProvider.tsx`, fix `"Your are not connected"` to `"You are not connected"`
3. In `server/src/multiplayer/types/multiplayer.types.ts`, remove the unused `RouterModule` import

These are not the core feature, but they make the phase cleaner.
