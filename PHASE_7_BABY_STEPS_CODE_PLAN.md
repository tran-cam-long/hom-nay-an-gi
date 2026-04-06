# Phase 7 Baby Steps Code Plan (Game Selection Modal and Start Flow)

## Summary
Build Phase 7 as a real host-only game selection modal with one current option, `Rock Paper Scissors`. The modal opens from the existing `Start Game` button, the host confirms the game choice, the client emits `game.start`, and the server validates host/readiness/lobby state before transitioning the room to `in_game`.

Important decisions already locked:
1. Use a real modal, not direct-start.
2. Keep `room.selectedGame = null` in lobby.
3. Set `selectedGame = "rps"` only after successful server start.
4. Stop at start flow only. No round engine or RPS gameplay UI yet.

## Implementation Changes

### 1. Add the new backend event payload
File:
`server/src/multiplayer/dto/multiplayer.events.ts`

Add this type under `RoomLeavePayload`:

```ts
export type GameStartPayload = {
    roomId: string;
    game: "rps";
}
```

Checkpoint:
1. The gateway has a typed payload for `game.start`.

---

### 2. Fix lobby room state so no game is preselected
File:
`server/src/multiplayer/multiplayer.gateway.ts`

In `createLobbyRoom`, change this line:

```ts
selectedGame: "rps" as const,
```

to:

```ts
selectedGame: null,
```

Checkpoint:
1. Newly created rooms stay unselected until the host actually starts a game.

---

### 3. Add the backend `game.start` handler
File:
`server/src/multiplayer/multiplayer.gateway.ts`

Update the import line:

```ts
import type { InviteAcceptPayload, InviteSendPayload, RoomLeavePayload, RoomSetDishChoicePayload } from './dto/multiplayer.events';
```

to:

```ts
import type {
  GameStartPayload,
  InviteAcceptPayload,
  InviteSendPayload,
  RoomLeavePayload,
  RoomSetDishChoicePayload,
} from './dto/multiplayer.events';
```

Then add this new handler above `handleRoomLeave`:

```ts
@SubscribeMessage("game.start")
handleGameStart(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: GameStartPayload,
) {
  const username = this.store.socketUser.get(client.id);
  if (!username) {
    client.emit("error", {
      code: "UNAUTHENTICATED",
      message: "Socket is not registered.",
    });
    return;
  }

  const roomId = payload?.roomId?.trim();
  const game = payload?.game;

  if (!roomId || game !== "rps") {
    client.emit("error", {
      code: "INVALID_INPUT",
      message: "Game start payload must include roomId and a supported game.",
    });
    return;
  }

  const currentRoomId = this.store.userToRoom.get(username);
  if (!currentRoomId || currentRoomId !== roomId) {
    client.emit("error", {
      code: "FORBIDDEN",
      message: "You are not in this room.",
    });
    return;
  }

  const room = this.store.rooms.get(roomId);
  if (!room) {
    client.emit("error", {
      code: "ROOM_NOT_FOUND",
      message: "Room does not exist.",
    });
    return;
  }

  if (room.hostUsername !== username) {
    client.emit("error", {
      code: "FORBIDDEN",
      message: "Only the host can start the game.",
    });
    return;
  }

  if (room.status !== "lobby") {
    client.emit("error", {
      code: "ROOM_NOT_JOINABLE",
      message: "This room is not in lobby state.",
    });
    return;
  }

  if (room.members.length < 2) {
    client.emit("error", {
      code: "ROOM_NOT_READY",
      message: "Need at least 2 players to start.",
    });
    return;
  }

  const notReadyMembers = room.members.filter((member) => !member.hasChosenDish);
  if (notReadyMembers.length > 0) {
    client.emit("error", {
      code: "ROOM_NOT_READY",
      message: `Waiting for ${notReadyMembers.map((member) => member.username).join(", ")} to choose a dish.`,
    });
    return;
  }

  room.status = "in_game";
  room.selectedGame = game;
  this.store.rooms.set(room.roomId, room);

  this.logger.log(`${username} started ${game} in room ${room.roomId}`);
  this.server.emit("game.started", {
    roomId: room.roomId,
    game,
  });
  this.emitRoomUpdated(room);
}
```

Important correction inside that handler:
Do not keep `this.server.emit("game.started", ...)` as-is for final implementation. Emit only to room members.

Add this helper:

```ts
private emitGameStarted(room: RoomStateInternal): void {
  for (const member of room.members) {
    const socketIds = this.store.userSockets.get(member.username);
    if (!socketIds) continue;

    for (const socketId of socketIds) {
      this.server.to(socketId).emit("game.started", {
        roomId: room.roomId,
        game: room.selectedGame,
      });
    }
  }
}
```

Then replace:

```ts
this.server.emit("game.started", {
  roomId: room.roomId,
  game,
});
```

with:

```ts
this.emitGameStarted(room);
```

Checkpoint:
1. Only the host can start.
2. Start is blocked unless the room is valid and everyone is ready.
3. `game.started` goes only to room members.

---

### 4. Add a frontend type for the start event
File:
`frontend/src/types/multiplayer.ts`

Add these new types below `RoomState`:

```ts
export type MultiplayerGameKey = "rps";

export type GameStartedEvent = {
    roomId: string;
    game: MultiplayerGameKey;
};
```

Checkpoint:
1. The frontend has a typed `game.started` payload.
2. The `startGame` client API can stop using raw `string`.

---

### 5. Tighten the multiplayer context contract
File:
`frontend/src/multiplayer/MultiplayerContext.ts`

Update imports:

```ts
import type { GameStartedEvent, MultiplayerConnectionStatus, MultiplayerError, MultiplayerNotification, MultiplayerGameKey, RoomState } from "../types/multiplayer"
```

Then change:

```ts
startGame: (game: string) => void;
```

to:

```ts
startGame: (game: MultiplayerGameKey) => boolean;
```

Checkpoint:
1. The page knows whether the emit happened.
2. The only supported game is typed.

---

### 6. Update the provider `startGame` helper
File:
`frontend/src/multiplayer/MultiplayerConnectionProvider.tsx`

Update the type import:

```ts
import type { GameStartedEvent, MultiplayerError, RoomState, MultiplayerConnectionStatus, MultiplayerNotification, MultiplayerGameKey } from "../types/multiplayer";
```

Replace the current `startGame` function:

```tsx
const startGame = useCallback((game: string) => {
  const socket = socketRef.current;
  if (!socket || !activeRoom) return;
  socket.emit("game.start", { roomId: activeRoom.roomId, game });
}, [activeRoom]);
```

with:

```tsx
const startGame = useCallback((game: MultiplayerGameKey) => {
  const socket = socketRef.current;

  if (!activeRoom) {
    setLastError(createLocalError("ROOM_NOT_FOUND", "You are not currently in a room."));
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
  socket.emit("game.start", {
    roomId: activeRoom.roomId,
    game,
  });
  return true;
}, [activeRoom]);
```

Checkpoint:
1. Game start emit is validated locally.
2. The page gets a boolean result.

---

### 7. Add a `game.started` socket listener
File:
`frontend/src/multiplayer/MultiplayerConnectionProvider.tsx`

Add this handler inside the `useEffect` where other socket handlers live:

```tsx
const handleGameStarted = (payload: unknown) => {
  const data = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as GameStartedEvent)
    : null;

  if (!data || !activeRoom) {
    return;
  }

  if (data.roomId !== activeRoom.roomId) {
    return;
  }

  setActiveRoom((current) => {
    if (!current || current.roomId !== data.roomId) {
      return current;
    }

    return {
      ...current,
      status: "in_game",
      selectedGame: data.game,
    };
  });
};
```

Register it:

```tsx
socket.on("game.started", handleGameStarted);
```

Clean it up in the return block:

```tsx
socket.off("game.started", handleGameStarted);
```

Important improvement:
The current effect reads `activeRoom` from closure but does not include it in dependencies. For this Phase 7 step, prefer using functional `setActiveRoom` and remove the early `!activeRoom` return inside the handler.

Use this safer version instead:

```tsx
const handleGameStarted = (payload: unknown) => {
  const data = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as GameStartedEvent)
    : null;

  if (!data) {
    return;
  }

  setActiveRoom((current) => {
    if (!current || current.roomId !== data.roomId) {
      return current;
    }

    return {
      ...current,
      status: "in_game",
      selectedGame: data.game,
    };
  });
};
```

Checkpoint:
1. Clients transition into `in_game` immediately on `game.started`.

---

### 8. Create the game selection modal component
File:
`frontend/src/components/GameSelectionModal.tsx`

Create this component:

```tsx
import { useState } from "react";
import type { MultiplayerGameKey } from "../types/multiplayer";

type GameSelectionModalProps = {
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (game: MultiplayerGameKey) => void;
};

const AVAILABLE_GAMES: Array<{
  key: MultiplayerGameKey;
  title: string;
  description: string;
}> = [
  {
    key: "rps",
    title: "Rock Paper Scissors",
    description: "Classic elimination rounds. Everyone starts with a random move and can switch until the timer ends.",
  },
];

export default function GameSelectionModal({
  isOpen,
  isSubmitting,
  onClose,
  onConfirm,
}: GameSelectionModalProps) {
  const [selectedGame, setSelectedGame] = useState<MultiplayerGameKey>("rps");

  if (!isOpen) return null;

  return (
    <div className="game-selection-modal-overlay" onClick={() => !isSubmitting && onClose()}>
      <div className="game-selection-modal" onClick={(event) => event.stopPropagation()}>
        <h3>Select a game</h3>
        <div className="game-selection-list">
          {AVAILABLE_GAMES.map((game) => (
            <button
              key={game.key}
              type="button"
              className={`game-selection-card ${selectedGame === game.key ? "game-selection-card--selected" : ""}`}
              onClick={() => setSelectedGame(game.key)}
              disabled={isSubmitting}
            >
              <span className="game-selection-card__title">{game.title}</span>
              <span className="game-selection-card__description">{game.description}</span>
            </button>
          ))}
        </div>

        <div className="game-selection-modal-actions">
          <button type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="button" onClick={() => onConfirm(selectedGame)} disabled={isSubmitting}>
            {isSubmitting ? "Starting..." : "Start Game"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

Checkpoint:
1. There is a reusable modal with one current game option.
2. The component is already future-friendly for more games.

---

### 9. Add modal styles
File:
`frontend/src/pages/HomnayangiPage.css`

Append these styles:

```css
.game-selection-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 1200;
}

.game-selection-modal {
  width: min(520px, 100%);
  background: #ffffff;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.2);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.game-selection-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.game-selection-card {
  border: 1px solid #d0d7de;
  border-radius: 12px;
  background: #f8fafc;
  padding: 14px 16px;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
}

.game-selection-card--selected {
  border-color: #1d4ed8;
  background: #dbeafe;
}

.game-selection-card__title {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.game-selection-card__description {
  font-size: 14px;
  line-height: 1.4;
  color: #475569;
}

.game-selection-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
```

Checkpoint:
1. The modal is visually usable on desktop and mobile.
2. The selected game looks intentional.

---

### 10. Wire the modal into `HomnayangiPage`
File:
`frontend/src/pages/HomnayangiPage.tsx`

Add imports:

```tsx
import GameSelectionModal from "../components/GameSelectionModal";
import type { MultiplayerGameKey } from "../types/multiplayer";
```

Add new state near the other page state:

```tsx
const [isGameSelectionOpen, setIsGameSelectionOpen] = useState(false);
const [isStartingGame, setIsStartingGame] = useState(false);
```

Replace this function:

```tsx
const handleStartGame = () => {
  if (isStartDisabled || !isHost || !activeRoom) return;
  startGame("rps"); // Phase 7 will add game selection modal
  onNotify("Starting Rock Paper Scissors...");
};
```

with:

```tsx
const handleStartGame = () => {
  if (isStartDisabled || !isHost || !activeRoom) return;
  setIsGameSelectionOpen(true);
};
```

Add a new confirm handler:

```tsx
const handleConfirmGameSelection = (game: MultiplayerGameKey) => {
  if (!isHost || !activeRoom) {
    return;
  }

  setIsStartingGame(true);
  const didEmit = startGame(game);

  if (!didEmit) {
    setIsStartingGame(false);
    onNotify("Could not start the game right now.");
    return;
  }

  onNotify("Starting game...");
};
```

Add this effect so the modal closes when the room actually starts:

```tsx
useEffect(() => {
  if (!activeRoom) {
    setIsGameSelectionOpen(false);
    setIsStartingGame(false);
    return;
  }

  if (activeRoom.status === "in_game") {
    setIsGameSelectionOpen(false);
    setIsStartingGame(false);
  }
}, [activeRoom]);
```

Add this effect so the modal closes if the user is no longer allowed to start:

```tsx
useEffect(() => {
  if (!isGameSelectionOpen) {
    return;
  }

  if (!isHost || !activeRoom || activeRoom.status !== "lobby") {
    setIsGameSelectionOpen(false);
    setIsStartingGame(false);
  }
}, [isGameSelectionOpen, isHost, activeRoom]);
```

Render the modal near `InviteModal`:

```tsx
<GameSelectionModal
  isOpen={isGameSelectionOpen}
  isSubmitting={isStartingGame}
  onClose={() => {
    if (!isStartingGame) {
      setIsGameSelectionOpen(false);
    }
  }}
  onConfirm={handleConfirmGameSelection}
/>
```

Checkpoint:
1. Start button opens the modal.
2. Confirm sends `game.start`.
3. Modal closes on success or invalidation.

---

### 11. Reset “starting” state on socket error
File:
`frontend/src/pages/HomnayangiPage.tsx`

Add this effect so failed starts do not leave the modal stuck in `Starting...`:

```tsx
const { activeRoom,
  sendInvite,
  username: currentUsername = null,
  leaveRoom,
  startGame,
  setRoomDishChoice,
  lastError } = useMultiplayer();
```

Then add:

```tsx
useEffect(() => {
  if (!isStartingGame || !lastError) {
    return;
  }

  setIsStartingGame(false);
  onNotify(lastError.message);
}, [isStartingGame, lastError, onNotify]);
```

Checkpoint:
1. Server-side validation failures return the modal to an actionable state.

---

### 12. Optional UI hint in room panel after start
File:
`frontend/src/components/RoomPanel.tsx`

Under the room id paragraph, add:

```tsx
{room.selectedGame && (
  <p className="room-selected-game">Selected game: {room.selectedGame.toUpperCase()}</p>
)}
```

If you do this, also add styles in the room panel CSS file currently named:
`frontend/src/components/RoomPancel.css`

Add:

```css
.room-selected-game {
  margin: 6px 0 0;
  font-size: 12px;
  opacity: 0.85;
}
```

Checkpoint:
1. Once the game starts, the room panel shows that the lobby has transitioned.

This is optional for Phase 7, but good for visibility.

## Test Plan
1. Host happy path:
   Create room, both players choose dishes, host clicks `Start Game`, modal opens, host selects `Rock Paper Scissors`, server emits `game.started`, both clients show `status: "in_game"` and `selectedGame: "rps"`.
2. Non-host blocked:
   Non-host does not see the button, and manual socket emit returns `FORBIDDEN`.
3. Not ready blocked:
   Host opens modal before everyone is ready, confirm returns `ROOM_NOT_READY`, modal stops submitting, room stays in lobby.
4. Too few players blocked:
   One-player room cannot start.
5. Wrong room state blocked:
   Calling `game.start` twice fails once the room is already `in_game`.
6. Unsupported game blocked:
   Any non-`"rps"` payload fails with input or unsupported-game error.
7. Lobby semantics:
   New room shows `selectedGame: null` until the successful start.
8. Reconnect:
   A player reconnecting after start gets `room.sync` and sees `status: "in_game"` and `selectedGame: "rps"`.

## Assumptions and Defaults
1. Phase 7 should be written into a new doc: `PHASE_7_BABY_STEPS_CODE_PLAN.md`.
2. The only selectable game for now is `"rps"`.
3. `game.started` should be treated as a lightweight transition event, not a full room snapshot.
4. Phase 7 ends once the room successfully enters `in_game`; all RPS round logic belongs to Phase 8.
5. Use the existing page-level `onNotify` toast path for all start-flow feedback.
