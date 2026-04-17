# Phase 8 Baby Steps Code Plan (RPS Game Engine Implementation)

## Summary
Build Phase 8 as the first real round engine for the multiplayer foundation. After Phase 7 starts an `rps` game, the backend should now run deterministic elimination rounds: assign random initial moves, accept move updates until the deadline, resolve ties/eliminations, continue until one winner remains, emit the final winning dish, and reset the room back to lobby.

Important decisions already locked:
1. Keep the round engine server authoritative.
2. Hide all other players' current moves.
3. Emit only each player's own initial move.
4. Resolve ties deterministically by replaying the round.
5. Finish the game by returning the room to lobby so the next match can start in the same room.

## Implementation Changes

### 1. Extend shared multiplayer types for RPS rounds and results
Files:
`server/src/multiplayer/types/multiplayer.types.ts`
`frontend/src/types/multiplayer.ts`

Add the shared RPS types:

```ts
export type RpsMove = "rock" | "paper" | "scissors";

export type RpsRoundState = {
  roundNumber: number;
  activePlayers: string[];
  deadlineAt: string;
  submittedMoves: Record<string, RpsMove>;
};

export type RpsRoundStartedEvent = {
  roomId: string;
  roundNumber: number;
  activePlayers: string[];
  deadlineAt: string;
  yourInitialMove: RpsMove;
};

export type RpsRoundLockedEvent = {
  roomId: string;
  roundNumber: number;
};

export type RpsRoundResolvedEvent = {
  roomId: string;
  roundNumber: number;
  eliminatedUsernames: string[];
  survivors: string[];
  isTie: boolean;
};

export type GameFinishedEvent = {
  roomId: string;
  winnerUsername: string;
  winningDishId: number;
  winningDishName: string;
};
```

For the server internal room state, add fields to store the current round and chosen dish names:

```ts
export type RoomStateInternal = RoomState & {
  dishChoicesByUsername: Record<string, number>;
  dishChoiceNamesByUsername: Record<string, string>;
  currentRound: RpsRoundState | null;
};
```

Checkpoint:
1. The server can store active round state safely.
2. The frontend has typed payloads for all new Phase 8 events.

---

### 2. Add the new client event payload for move updates
File:
`server/src/multiplayer/dto/multiplayer.events.ts`

Add:

```ts
export type RpsMoveUpdatePayload = {
  roomId: string;
  move: "rock" | "paper" | "scissors";
};
```

Also extend the existing dish-choice payload to include the chosen dish name:

```ts
export type RoomSetDishChoicePayload = {
  roomId: string;
  dishId: number;
  dishName: string;
};
```

Checkpoint:
1. `rps.move.update` is typed.
2. The final winner payload can include the real dish name without a second backend lookup.

---

### 3. Extend the multiplayer store for room game timers
File:
`server/src/multiplayer/services/multiplayer.store.ts`

Add:

```ts
readonly roomGameTimers = new Map<string, NodeJS.Timeout>();
```

Checkpoint:
1. Each room can own exactly one active game timer at a time.

---

### 4. Store dish names when a room member becomes ready
File:
`server/src/multiplayer/multiplayer.gateway.ts`

Inside `handleRoomSetDishChoice`, validate `dishName`, then save both `dishId` and `dishName`:

```ts
if (!payload || !payload.roomId || !Number.isFinite(payload.dishId) || !payload.dishName?.trim()) {
  client.emit("error", {
    code: "INVALID_INPUT",
    message: "Room set dish choice payload must include roomId, numeric dishId, and dishName.",
  });
  return;
}

room.dishChoicesByUsername[username] = payload.dishId;
room.dishChoiceNamesByUsername[username] = payload.dishName.trim();
```

Initialize the new fields in `createLobbyRoom`:

```ts
dishChoicesByUsername: {},
dishChoiceNamesByUsername: {},
currentRound: null,
```

Checkpoint:
1. Winner resolution can return both the winning dish ID and name.

---

### 5. Add the backend `rps.move.update` handler
File:
`server/src/multiplayer/multiplayer.gateway.ts`

Add a new handler beside the other socket events:

```ts
@SubscribeMessage("rps.move.update")
handleRpsMoveUpdate(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: RpsMoveUpdatePayload,
) {
  // validate username, room membership, in_game state, selectedGame === "rps"
  // validate player is still active and round is not locked
  // overwrite only that player's latest move in room.currentRound.submittedMoves
}
```

Rules:
1. Ignore eliminated players.
2. Reject updates if the room is not in an active RPS round.
3. Keep only the latest move per player.

Checkpoint:
1. Active players can switch moves repeatedly until the deadline.

---

### 6. Start the first round when the host starts the game
File:
`server/src/multiplayer/multiplayer.gateway.ts`

At the end of `handleGameStart`:

1. Reset all members to `isEliminated = false`.
2. Clear any old round/timer state.
3. Emit `game.started`.
4. Call `startNextRpsRound(room)`.

Add helpers:

```ts
private startNextRpsRound(room: RoomStateInternal, roundNumber = 1): void
private emitRpsRoundStarted(room: RoomStateInternal): void
private scheduleRpsRoundResolution(roomId: string, roundNumber: number): void
private getRandomRpsMove(): RpsMove
```

Round-start behavior:
1. Active players are all non-eliminated members.
2. Create a 5-second deadline.
3. Assign each active player a random initial move.
4. Emit `rps.round.started` only to room members, with each socket receiving only its own `yourInitialMove`.

Checkpoint:
1. Starting an RPS game immediately produces a live round with a deadline.

---

### 7. Resolve the round deterministically at deadline
File:
`server/src/multiplayer/multiplayer.gateway.ts`

Add:

```ts
private lockAndResolveRpsRound(roomId: string, roundNumber: number): void
private emitRpsRoundLocked(room: RoomStateInternal, roundNumber: number): void
private emitRpsRoundResolved(
  room: RoomStateInternal,
  roundNumber: number,
  eliminatedUsernames: string[],
  survivors: string[],
  isTie: boolean,
): void
private resolveRpsOutcome(submittedMoves: Record<string, RpsMove>, activePlayers: string[]): {
  eliminatedUsernames: string[];
  survivors: string[];
  isTie: boolean;
}
```

Resolution rules:
1. One unique move => tie, no eliminations.
2. Three unique moves => tie, no eliminations.
3. Two unique moves => eliminate only the losing move.

After resolution:
1. Emit `rps.round.locked`.
2. Emit `rps.round.resolved`.
3. If one survivor remains, finalize the game.
4. Otherwise start the next round.

Checkpoint:
1. The elimination logic is deterministic and replay-safe.

---

### 8. Finalize the winner and reset the room
File:
`server/src/multiplayer/multiplayer.gateway.ts`

Add:

```ts
private finishRpsGame(room: RoomStateInternal, winnerUsername: string): void
private emitGameFinished(room: RoomStateInternal, winnerUsername: string): void
private resetRoomAfterGame(room: RoomStateInternal): void
private clearRoomGameTimer(roomId: string): void
```

Finish behavior:
1. Read `winningDishId` from `dishChoicesByUsername[winnerUsername]`.
2. Read `winningDishName` from `dishChoiceNamesByUsername[winnerUsername]`.
3. Emit `game.finished`.
4. Reset the room back to:
   1. `status = "lobby"`
   2. `selectedGame = null`
   3. `currentRound = null`
   4. all `isEliminated = false`
5. Emit `room.updated`.

Checkpoint:
1. The room is reusable after a finished match.
2. Only the winning dish is revealed.

---

### 9. Add frontend provider support for the new events
Files:
`frontend/src/multiplayer/MultiplayerContext.ts`
`frontend/src/multiplayer/MultiplayerConnectionProvider.tsx`
`frontend/src/types/multiplayer.ts`

Add provider state for:

```ts
currentRpsRound: RpsRoundStartedEvent | null;
lastRpsResolution: RpsRoundResolvedEvent | null;
lastGameResult: GameFinishedEvent | null;
updateRpsMove: (move: RpsMove) => boolean;
```

Register listeners for:
1. `rps.round.started`
2. `rps.round.locked`
3. `rps.round.resolved`
4. `game.finished`

Behavior:
1. `rps.round.started` stores the current round and the player's current move.
2. `rps.round.locked` marks the round as locked client-side.
3. `rps.round.resolved` stores the latest result.
4. `game.finished` stores the winner payload and clears active round state.

Checkpoint:
1. Phase 9 UI can read round/game state without adding another transport layer.

---

### 10. Sync the chosen dish name from the page
Files:
`frontend/src/multiplayer/MultiplayerContext.ts`
`frontend/src/multiplayer/MultiplayerConnectionProvider.tsx`
`frontend/src/pages/HomnayangiPage.tsx`

Update:

```ts
setRoomDishChoice: (dishId: number, dishName: string) => boolean;
```

When a player confirms a dish in `HomnayangiPage`, pass both values:

```ts
setRoomDishChoice(dishId, selectedDish.name);
```

Checkpoint:
1. Winner payloads have the correct dish name.

---

## Definition of Done
1. Starting `rps` immediately begins a timed round.
2. Active players can change moves until the deadline.
3. Tie rounds replay without eliminating anyone.
4. Non-tie rounds eliminate only the losing move.
5. The tournament ends with exactly one winner.
6. `game.finished` includes the real winning dish ID and name.
7. The room returns to lobby and is ready for another game.
