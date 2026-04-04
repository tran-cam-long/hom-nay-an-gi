# Phase 6 Baby Steps Code Plan (Dish Choice Integration for Multiplayer)

This guide is for implementing **Phase 6** yourself in very small steps, with checkpoints after each step.

Scope:
1. Sync dish choice readiness to the multiplayer room after a successful dish choice save.
2. Keep multiplayer privacy intact: other players only see `Ready` / `Choosing`.
3. Store the chosen dish privately on the server for future winner reveal.
4. Keep the existing dish selection UI working for both solo and multiplayer users.
5. Do not build game selection UI yet.
6. Do not build RPS gameplay UI yet.
7. Do not reveal dish names or IDs in room state.

---

## 0. Current Starting Point

You already have:
1. `HomnayangiPage` submitting dish choices through `POST /dishchoice/choice`.
2. `MultiplayerConnectionProvider` storing `activeRoom`, `notifications`, and socket connection state.
3. Shared room types on both frontend and backend already include `RoomMember.hasChosenDish`.
4. `RoomPanel` rendering member readiness using `member.hasChosenDish`.
5. Backend multiplayer gateway already handling:
   1. `invite.send`
   2. `invite.accept`
   3. `room.sync`
   4. disconnect -> `isConnected = false`
6. Frontend multiplayer provider already exposing:
   1. `sendInvite`
   2. `acceptInvite`
   3. `leaveRoom`
   4. `startGame`

Important current gaps:
1. There is still no `room.setDishChoice` event on either client or server.
2. `hasChosenDish` is initialized when the room is created, but never updated after a player actually chooses a dish.
3. Dish choice currently exists only in the HTTP flow, so room readiness never changes in realtime.
4. The backend store currently saves only public `RoomState`, which makes future dish privacy easy to break unless we add a private/internal room shape now.
5. `HomnayangiPage` currently duplicates dish choice success logic in two places:
   1. `handleChooseClick`
   2. `handleCarouselChooseClick`
6. Phase 5 is only partially wired in the current code:
   1. `RoomPanel` is rendered with `isStartDisabled={false}` and `startDisabledReason={null}` instead of the computed values already present in the file.
   2. `HomnayangiPage` calls `startGame("rps")`, but the hook destructure does not currently include `startGame`; a local fallback stub exists at the bottom of the file.
   3. Backend handlers for `room.leave` and `game.start` still do not exist.

Goal for Phase 6:
1. After a successful dish choice, all room members see that player become `Ready`.
2. No room event exposes which dish was chosen.
3. The server privately remembers dish IDs for future `game.finished` winner reveal.
4. Reconnects still show correct readiness.
5. Phase 7 can trust multiplayer readiness data instead of local-only UI state.

---

## 0.5 Recommended Small Decisions Locked In

Before writing the sync logic, lock these decisions in and follow them consistently through the whole phase.

### Decision 1: Source of truth for readiness

Use the **backend room state** as the source of truth for `hasChosenDish`.

Why:
1. Every player needs to see the same readiness state.
2. Phase 7 start validation must trust room state, not one tab's local flags.
3. Reconnect behavior becomes much simpler.

Checkpoint:
1. `hasChosenDish` is updated by the backend and then broadcast back to clients.

### Decision 2: When to emit `room.setDishChoice`

Emit `room.setDishChoice` **only after** the existing HTTP dish choice request succeeds.

Why:
1. The upstream dish choice API is still the real persistence path.
2. We do not want optimistic room readiness if the HTTP request failed.
3. This keeps multiplayer state aligned with the actual saved choice.

Checkpoint:
1. Failed HTTP dish choice does not mark the player ready in the room.

### Decision 3: How to support "Choose again"

If a player chooses again later, keep them as `Ready` and simply replace the server's private stored dish ID.

Why:
1. The room only needs readiness, not a visible history of changes.
2. This preserves privacy.
3. It avoids unnecessary `Ready -> Choosing -> Ready` flicker for other players.

Checkpoint:
1. Re-choosing a dish updates private backend data without revealing anything new to peers.

---

## 1. Address the Blocking Gaps First

Before adding any new Phase 6 behavior, clean up the small gaps that would make readiness testing misleading or brittle.

Files:
1. `frontend/src/pages/HomnayangiPage.tsx`
2. `frontend/src/multiplayer/MultiplayerConnectionProvider.tsx`

### 1.1 Stop hard-coding the room panel start props

Right now the JSX still passes:

```tsx
isStartDisabled={false}
startDisabledReason={null}
```

Replace those with the already computed values:

```tsx
isStartDisabled={isStartDisabled}
startDisabledReason={startDisabledReason}
```

Why this comes first:
1. Phase 6 is about readiness.
2. If the room panel ignores the real readiness calculation, manual verification becomes confusing immediately.

Checkpoint:
1. `RoomPanel` now reflects the real room readiness calculation already present in the page.

### 1.2 Clean up the `startGame` hook mismatch

Follow the recommended path here:
1. destructure `startGame` from `useMultiplayer()`
2. remove the local `function startGame(_game: string)` stub at the bottom of the file

Do not keep both.

Why this comes first:
1. The local stub hides the real provider contract.
2. It makes the file harder to reason about while you are adding more multiplayer logic.

Checkpoint:
1. `HomnayangiPage` uses the real multiplayer action and no longer contains the misleading local fallback stub.

### 1.3 Keep the remaining missing handlers visible, but do not expand Phase 6 scope yet

These gaps are still real:
1. backend `room.leave`
2. backend `game.start`

For this Phase 6 plan, treat them as known follow-up work unless they block your local testing setup.

Why:
1. They are adjacent multiplayer gaps.
2. They are not the core dish-choice sync path.
3. Pulling them fully into Phase 6 would blur the scope.

Checkpoint:
1. The plan addresses the misleading UI gaps first without turning Phase 6 into a Phase 5/7 rewrite.

---

## 2. Add a Private Room Shape on the Backend First

Do not build `room.setDishChoice` on top of the current public-only room type.
Phase 6 is the right time to separate:
1. public room data that can be broadcast
2. private dish data that must stay server-only

Files:
1. `server/src/multiplayer/types/multiplayer.types.ts`
2. `server/src/multiplayer/services/multiplayer.store.ts`
3. `server/src/multiplayer/multiplayer.gateway.ts`

### 2.1 Introduce `RoomStateInternal`

Keep the existing public `RoomState`, then add a private room type.

Example:

```ts
export type RoomStateInternal = RoomState & {
  dishChoicesByUsername: Record<string, number>;
};
```

You can also name this `StoredRoomState` if you prefer, but keep the intent obvious.

Checkpoint:
1. Public room data is still represented by `RoomState`.
2. Private per-user dish IDs now have a dedicated server-only home.

### 2.2 Update the multiplayer store to use the internal type

In `MultiplayerStore`, change:

```ts
readonly rooms = new Map<string, RoomState>();
```

to:

```ts
readonly rooms = new Map<string, RoomStateInternal>();
```

Checkpoint:
1. The server store can now hold private dish data without leaking it into shared types.

### 2.3 Add a helper to convert internal room state to public room state

Create a tiny helper either:
1. in `multiplayer.types.ts`, or
2. as a private helper inside `MultiplayerGateway`

Example:

```ts
function toPublicRoomState(room: RoomStateInternal): RoomState {
  return {
    roomId: room.roomId,
    members: room.members,
    status: room.status,
    selectedGame: room.selectedGame,
    hostUsername: room.hostUsername,
  };
}
```

Checkpoint:
1. There is now exactly one explicit place where private room state is stripped before emit.

---

## 3. Add the New Event Contract

Add the new event payload before wiring behavior.

Files:
1. `server/src/multiplayer/dto/multiplayer.events.ts`
2. `frontend/src/multiplayer/MultiplayerContext.ts`
3. `frontend/src/multiplayer/MultiplayerConnectionProvider.tsx`

### 3.1 Add the backend DTO

In `server/src/multiplayer/dto/multiplayer.events.ts`, add:

```ts
export type RoomSetDishChoicePayload = {
  roomId: string;
  dishId: number;
};
```

Checkpoint:
1. The backend event shape is defined in one place.

### 3.2 Add a client action to the multiplayer context

In `MultiplayerContext.ts`, add:

```ts
setRoomDishChoice: (dishId: number) => boolean;
```

Return `boolean` instead of `void`.

Why:
1. `HomnayangiPage` can keep the HTTP success flow.
2. If local socket validation fails, the page can still tell the user that dish save succeeded but room sync did not.

Checkpoint:
1. The provider API can report whether the emit path actually ran.

---

## 4. Implement the Backend `room.setDishChoice` Handler

Now add the actual realtime readiness update.

File:
1. `server/src/multiplayer/multiplayer.gateway.ts`

### 4.1 Register a new socket handler

Add:

```ts
@SubscribeMessage("room.setDishChoice")
handleRoomSetDishChoice(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: RoomSetDishChoicePayload,
) {
  // validation + update
}
```

Checkpoint:
1. The event name now exists in the gateway.

### 4.2 Validate the payload carefully

Validate:
1. socket user exists
2. `roomId` is present
3. `dishId` is a valid number
4. user belongs to that room
5. room exists
6. room is still in `lobby`

Suggested guard shape:

```ts
if (!username) {
  client.emit("error", { code: "UNAUTHENTICATED", message: "Socket is not registered." });
  return;
}
```

Then add similar guards for `ROOM_NOT_FOUND`, `FORBIDDEN`, `INVALID_INPUT`, and `ROOM_NOT_JOINABLE` or similar.

Checkpoint:
1. Invalid or stale clients cannot mutate room readiness.

### 4.3 Save the dish privately and mark the member ready

Once validated:
1. write `dishChoicesByUsername[username] = dishId`
2. set that member's `hasChosenDish = true`
3. save the internal room back into the store
4. broadcast sanitized `room.updated`

Example core update:

```ts
room.dishChoicesByUsername[username] = payload.dishId;

const member = room.members.find((item) => item.username === username);
if (!member) {
  client.emit("error", { code: "MEMBER_NOT_FOUND", message: "User is not in this room." });
  return;
}

member.hasChosenDish = true;
this.store.rooms.set(room.roomId, room);
this.emitRoomUpdated(room);
```

Checkpoint:
1. Everyone in the room sees the player switch to `Ready`.
2. Nobody receives the actual `dishId`.

### 4.4 Add a small log line

Add one backend log line for visibility while debugging:

```ts
this.logger.log(`${username} marked ready in room ${room.roomId}`);
```

Checkpoint:
1. Manual testing is easier because readiness updates are visible in server logs.

---

## 5. Make Every Room Emit Use Public State Only

Once private dish storage exists, audit all room emits immediately.

File:
1. `server/src/multiplayer/multiplayer.gateway.ts`

### 5.1 Update room creation

In `createLobbyRoom`, return the internal room shape:

```ts
return {
  roomId,
  status: "lobby",
  selectedGame: "rps",
  hostUsername: inviter,
  members: [...],
  dishChoicesByUsername: {},
};
```

Checkpoint:
1. New rooms begin with no stored private dish choices.

### 5.2 Update `room.sync`

Anywhere `client.emit("room.updated", { roomState: room })` is used, replace it with:

```ts
client.emit("room.updated", { roomState: toPublicRoomState(room) });
```

Checkpoint:
1. Reconnect flow still works.
2. Private room data is not sent during sync.

### 5.3 Update `emitRoomToUsers` and `emitRoomUpdated`

Both helpers should emit only public state:

```ts
const publicRoomState = toPublicRoomState(room);
```

Then emit `publicRoomState`, not `room`.

Checkpoint:
1. No socket room event leaks `dishChoicesByUsername`.

### 5.4 Do a quick privacy grep after this step

Search for:
1. `dishChoicesByUsername`
2. `roomState: room`
3. `emit("room.updated"`

Checkpoint:
1. You can point to a small set of safe emit sites.

---

## 6. Add the Client Emit Helper

Now wire the frontend provider action that the page will call.

File:
1. `frontend/src/multiplayer/MultiplayerConnectionProvider.tsx`

### 6.1 Add `setRoomDishChoice`

Follow the same pattern as `acceptInvite`.

Example:

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
        "You are not connected to multiplayer.",
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
};
```

Checkpoint:
1. The provider has a safe, reusable entry point for room readiness sync.

### 6.2 Expose it through context

Add `setRoomDishChoice` to the provider value.

Checkpoint:
1. `useMultiplayer()` consumers can now trigger the new room event.

---

## 7. Refactor `HomnayangiPage` So Both Choice Flows Share One Multiplayer Sync Path

Right now the page has two separate success paths.
Phase 6 is a good moment to unify them so the multiplayer emit cannot drift.

File:
1. `frontend/src/pages/HomnayangiPage.tsx`

### 7.1 Pull `setRoomDishChoice` from the hook

Update the hook usage to include the new action:

```tsx
const {
  activeRoom,
  sendInvite,
  username: currentUsername = null,
  leaveRoom,
  setRoomDishChoice,
} = useMultiplayer();
```

Checkpoint:
1. The page can now sync a successful choice into the room.

### 7.2 Extract a shared success helper

Create a helper that runs after the HTTP choice succeeds.

Example shape:

```tsx
const handleDishChoiceSuccess = (dishId: number) => {
  if (activeRoom) {
    const didSync = setRoomDishChoice(dishId);
    if (!didSync) {
      onNotify("Dish saved, but room sync failed. Please refresh the room.");
    }
  }

  setArmedDishId(null);
  setIsChoosingEnabled(false);
  onNotify("Dish chosen!");
};
```

Checkpoint:
1. Multiplayer sync logic now lives in one place instead of two.

### 7.3 Update the grid card flow

Inside `handleChooseClick`, after `await submitChoice(dishId);`, call the shared helper.

Checkpoint:
1. Grid-based dish choosing now updates room readiness.

### 7.4 Update the carousel flow

Inside `handleCarouselChooseClick`, keep the existing recommendation display updates, then call the same shared helper.

Checkpoint:
1. Carousel-based dish choosing updates room readiness in exactly the same way.

### 7.5 Keep solo users working exactly the same

The helper should only emit `room.setDishChoice` when `activeRoom` exists.

Checkpoint:
1. Users outside a room still choose dishes without any multiplayer dependency.

---

## 8. Sanity Check Privacy Rules Before Moving On

Phase 6 is successful only if readiness works **without exposing dish details**.

Review:
1. `frontend/src/types/multiplayer.ts`
2. `server/src/multiplayer/types/multiplayer.types.ts`
3. `RoomPanel.tsx`
4. room socket emits in `MultiplayerGateway`

Confirm:
1. `RoomMember` still exposes only:
   1. `username`
   2. `isHost`
   3. `hasChosenDish`
   4. `isConnected`
   5. `isEliminated`
2. `RoomPanel` still renders only `Ready` / `Choosing`
3. No `dishId`, `dishName`, or chosen dish preview is added to public room state
4. Notifications do not mention chosen dishes

Checkpoint:
1. Multiplayer privacy rules are still intact after the Phase 6 changes.

---

## 9. Manual Test Plan

Use two users: User A and User B.

### 9.1 Basic readiness sync

1. User A invites User B.
2. User B joins.
3. Both users see room panel with both players as `Choosing`.
4. User A chooses a dish successfully.
5. Both users should now see:
   1. User A = `Ready`
   2. User B = `Choosing`

Checkpoint:
1. Readiness updates for both users in realtime.

### 9.2 Privacy check

While User A is `Ready`, verify User B cannot see:
1. chosen dish name
2. chosen dish ID
3. image hint
4. recommendation hint tied to that room member

Checkpoint:
1. Peer visibility remains boolean-only.

### 9.3 Re-choose behavior

1. User A clicks `Choose again`.
2. User A chooses a different dish.
3. Both users should still see User A as `Ready`.
4. No extra dish details should appear anywhere.

Checkpoint:
1. Re-choose updates private data without public readiness flicker.

### 9.4 Reconnect behavior

1. User A chooses a dish and becomes `Ready`.
2. User A refreshes or reconnects their tab.
3. `room.sync` should restore the room with User A still marked `Ready`.

Checkpoint:
1. Readiness survives reconnect because it is stored in backend room state.

### 9.5 Host readiness gate

After both users choose a dish:
1. both players show `Ready`
2. host Start button becomes enabled because the blocking room panel gap was fixed in Step 1

Checkpoint:
1. Phase 6 data is now strong enough for Phase 7 start flow.

---

## 10. Edge Cases and Cleanup

Handle or at least sanity-check:
1. Player chooses a dish when not in a room:
   1. HTTP succeeds
   2. no socket emit needed
2. Player is in a room but socket is disconnected:
   1. HTTP may succeed
   2. UI should surface that room sync did not happen
3. Invalid `dishId` payload from client:
   1. backend rejects it
   2. room state stays unchanged
4. Player tries to emit `room.setDishChoice` for another room ID:
   1. backend rejects it
5. Room status is no longer `lobby`:
   1. backend rejects late readiness updates

Checkpoint:
1. Failure cases are explicit instead of silently corrupting room state.

---

## 11. Definition of Done for Phase 6

Phase 6 is done when all of the following are true:
1. Successful dish choice emits `room.setDishChoice` only after the HTTP request succeeds.
2. Backend stores the chosen dish privately and marks the member `hasChosenDish = true`.
3. `room.updated` broadcasts the readiness change to all room members.
4. Public room state still does not expose dish IDs or names.
5. Reconnects keep correct readiness.
6. Solo dish choice flow still works.
7. The host Start button now reflects real readiness because the existing JSX wiring gap was corrected first.
