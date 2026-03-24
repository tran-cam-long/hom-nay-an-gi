# Phase 2 Baby Steps Code Plan (Frontend Realtime Core)

This guide is for implementing **Phase 2** yourself in very small steps, with checkpoints after each step.

Scope:
1. Frontend realtime core only.
2. No notification bell/dropdown UX yet.
3. No invite modal UX yet.
4. Keep client state in memory.

---

## 0. Current Starting Point

You already have:
1. `LandingPage` mounts `MultiplayerConnectionProvider`.
2. `frontend/src/multiplayer/socket.ts` creates a Socket.IO client with `token` and `username` in handshake auth.
3. `MultiplayerConnectionProvider` currently only connects/disconnects the socket.
4. Backend already emits:
   1. `notification.new`
   2. `invite.expired`
   3. `room.joined`
   4. `room.updated`
   5. `error`
5. No frontend multiplayer types exist yet.
6. No React context/hook exists yet.
7. No frontend component currently listens to or stores multiplayer events.

Important current gap:
1. After a full page refresh, `loginRes` is lost, so the provider no longer has `username` or `accessToken` from React state even though tokens are saved in `localStorage`.

Goal for Phase 2:
1. One socket connection per logged-in tab.
2. A reusable multiplayer state layer that any component can read.
3. React state for:
   1. connection status
   2. invite notifications
   3. active room
   4. last socket error
4. Stable action methods for future UI phases:
   1. `sendInvite`
   2. `acceptInvite`
   3. `markNotificationsRead`
5. Predictable reconnect behavior.

---

## 0.5 Make Two Small Decisions First

Before writing the main provider logic, decide these two things.

### A. Session bootstrap after refresh

Pick one:
1. MVP approach:
   1. Save `username` to `localStorage` during login.
   2. Rebuild minimal auth session state from local storage on app boot.
2. Cleaner long-term approach:
   1. Add `GET /auth/me` or equivalent backend endpoint.
   2. Rebuild session from token on app boot.

Recommendation:
1. Use the MVP approach in Phase 2.
2. Add a TODO comment that `/auth/me` should replace it later.

Checkpoint:
1. Refreshing the page still gives the frontend enough auth data to reconnect the socket.

If you choose `A2`, break it down like this:

#### A2.1 Add a tiny backend `GET /auth/me` proxy

Files:
1. `server/src/controller/auth.controller.ts`
2. `server/src/service/auth.service.ts`

Baby steps:
1. Add `@Get("me")` to `AuthController`.
2. Read the `Authorization` header.
3. Reject missing or malformed bearer tokens with `UnauthorizedException`.
4. Pass the access token string into `authService.me(accessToken)`.
5. In `AuthService`, proxy `GET ${BACKEND_URL}/api/auth/me` with `Authorization: Bearer <token>`.
6. Normalize the upstream payload into a stable frontend-safe shape:
   1. `userId`
   2. `username`
7. Be a little defensive in case upstream returns:
   1. `{ userId, username }`
   2. `{ id, username }`
   3. `{ user: { id, username } }`

Suggested response shape:

```ts
type AuthMeResponse = {
  userId: number;
  username: string;
};
```

Checkpoint:
1. `GET /auth/me` returns the current logged-in user when called with a valid bearer token.
2. Missing token returns `401`.

#### A2.2 Add frontend types for bootstrapped auth session

Files:
1. `frontend/src/types/auth.ts`

Baby steps:
1. Keep `LoginResponse` for login form submission.
2. Add a smaller `AuthMeResponse`.
3. Add an `AuthSession` type for client state that combines:
   1. `userId`
   2. `username`
   3. `token`
   4. `refreshToken`

Suggested types:

```ts
export interface AuthMeResponse {
  userId: number;
  username: string;
}

export interface AuthSession extends AuthMeResponse {
  token: string;
  refreshToken: string | null;
}
```

Checkpoint:
1. `LandingPage` can store a restored session without pretending it came directly from the login endpoint.

#### A2.3 Restore session on app boot in `LandingPage`

Files:
1. `frontend/src/pages/LandingPage.tsx`

Baby steps:
1. Change `loginRes` state to `AuthSession | null`.
2. On mount, read `token` and `refreshToken` from `localStorage`.
3. If there is no token, do nothing.
4. If there is a token, call `GET /auth/me` with `Authorization: Bearer <token>`.
5. On success, rebuild `loginRes` with:
   1. server `userId`
   2. server `username`
   3. local `token`
   4. local `refreshToken`
6. On failure:
   1. clear local storage tokens
   2. clear `loginRes`
7. Keep `handleLoginSuccess` writing tokens to local storage exactly as before.

Suggested effect:

```ts
useEffect(() => {
  const token = localStorage.getItem("token");
  const refreshToken = localStorage.getItem("refreshToken");

  if (!token) {
    return;
  }

  let isCancelled = false;

  const bootstrapSession = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Session bootstrap failed");
      }

      const session: AuthMeResponse = await response.json();

      if (!isCancelled) {
        setLoginRes({
          ...session,
          token,
          refreshToken,
        });
      }
    } catch {
      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");

      if (!isCancelled) {
        setLoginRes(null);
      }
    }
  };

  void bootstrapSession();

  return () => {
    isCancelled = true;
  };
}, []);
```

Checkpoint:
1. Refreshing the page preserves `username` for `TopBar`.
2. Refreshing the page gives `MultiplayerConnectionProvider` enough data to reconnect.

### B. Reconnect room resync contract

Today the backend only pushes room state when something changes.
That means reconnect may leave the client with stale or empty room state unless the server sends a fresh snapshot.

Pick one:
1. Add a tiny socket event now:
   1. Client -> Server: `room.sync`
   2. Server -> Client: `room.updated`
2. Add a tiny HTTP endpoint now:
   1. `GET /multiplayer/rooms/:roomId`
3. Defer true reconnect recovery until a later phase.

Recommendation:
1. Add `room.sync` now.
2. Keep the payload minimal.

Checkpoint:
1. Client can explicitly request current room state after reconnect.

If you choose `B1`, break it down like this:

#### B1.1 Add the `room.sync` gateway handler

Files:
1. `server/src/multiplayer/multiplayer.gateway.ts`

Baby steps:
1. Add `@SubscribeMessage("room.sync")`.
2. Resolve the caller username from `socketUser`.
3. If the socket is unknown, emit the same unauthenticated socket error you already use elsewhere.
4. Look up the user’s current room through `userToRoom`.
5. If the user is not in a room, return quietly.
6. Look up the room from `rooms`.
7. If the caller is marked disconnected inside `room.members`, flip `isConnected` back to `true`.
8. If you changed connection state, persist the room and broadcast `room.updated` to room members.
9. If connection state was already correct, send just one `room.updated` snapshot back to the caller socket.

Suggested shape:

```ts
@SubscribeMessage("room.sync")
handleRoomSync(@ConnectedSocket() client: Socket) {
  const username = this.store.socketUser.get(client.id);
  if (!username) {
    client.emit("error", {
      code: "UNAUTHENTICATED",
      message: "Socket is not registered.",
    });
    return;
  }

  const roomId = this.store.userToRoom.get(username);
  if (!roomId) {
    return;
  }

  const room = this.store.rooms.get(roomId);
  if (!room) {
    return;
  }

  const member = room.members.find((item) => item.username === username);
  if (member && !member.isConnected) {
    member.isConnected = true;
    this.store.rooms.set(roomId, room);
    this.emitRoomUpdated(room);
    return;
  }

  client.emit("room.updated", { roomState: room });
}
```

Checkpoint:
1. A reconnecting player can ask for a fresh room snapshot.
2. A reconnecting player shows up as connected again in room state.

#### B1.2 Request `room.sync` from the frontend socket provider

Files:
1. `frontend/src/multiplayer/MultiplayerConnectionProvider.tsx`

Baby steps:
1. After creating the socket, add a `connect` listener.
2. In that listener, emit `room.sync`.
3. Clean up the listener when the provider effect tears down.
4. Keep the provider single-socket behavior unchanged.

Suggested code:

```ts
const handleConnect = () => {
  socket.emit("room.sync");
};

socket.on("connect", handleConnect);

return () => {
  socket.off("connect", handleConnect);
  socket.disconnect();
};
```

Why connect is enough:
1. Socket.IO fires `connect` on the first connection and after successful reconnects.
2. You do not need a separate reconnect-only branch for this MVP.

Checkpoint:
1. Every successful connect asks the server for the latest room snapshot.
2. Refreshing or reconnecting no longer depends on waiting for some unrelated room mutation.

---

## 1. Read This Before You Start Coding

This section is here because you said you do not have React or Nest experience.

Mental model:
1. `multiplayer.gateway.ts` on the server is the WebSocket event hub.
2. `MultiplayerConnectionProvider.tsx` on the frontend is the one place that owns multiplayer state.
3. `MultiplayerContext.ts` is the shared container for that state.
4. `useMultiplayer.ts` is the helper hook that other React components will call.

React ideas used in this phase:
1. `useState(...)`
   1. Stores UI state and triggers re-render when it changes.
2. `useRef(...)`
   1. Stores something mutable without causing re-render.
   2. Perfect for `socketRef`.
3. `useEffect(...)`
   1. Runs side effects after render.
   2. Also lets you clean up listeners when the component unmounts or dependencies change.
4. `createContext(...)`
   1. Lets a parent component provide shared values to children without prop drilling.
5. `useContext(...)`
   1. Lets a child component read that shared value.

Nest ideas used in this phase:
1. `@WebSocketGateway(...)`
   1. Declares a Socket.IO gateway.
2. `@SubscribeMessage("event.name")`
   1. Says “run this method when the client emits this event”.
3. `@ConnectedSocket()`
   1. Gives you the current socket client.
4. `@MessageBody()`
   1. Gives you the payload the client emitted.

Rule for this whole phase:
1. Do one numbered sub-step at a time.
2. After each sub-step, run your build or at least save the file and read the TypeScript error list.
3. Do not jump ahead if the current file is red.

---

## 2. Create Shared Frontend Multiplayer Types

Goal:
1. Create one place for all multiplayer TypeScript types.
2. Remove guessing from the provider and future UI.

File:
1. `frontend/src/types/multiplayer.ts`

### 2.1 Replace the file with this exact code

```ts
export type InviteStatus = "pending" | "accepted" | "expired" | "declined";

export type Invite = {
  inviteId: string;
  roomId: string;
  fromUsername: string;
  toUsername: string;
  status: InviteStatus;
  createdAt: string;
  expiresAt: string;
};

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

export type MultiplayerConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected";

export type MultiplayerNotification = {
  id: string;
  type: string;
  message: string;
  invite: Invite | null;
  receivedAt: string;
  isRead: boolean;
  isExpired: boolean;
};

export type MultiplayerError = {
  code: string;
  message: string;
  receivedAt: string;
};
```

### 2.2 Why these types exist

1. `Invite`, `RoomMember`, and `RoomState` mirror server data.
2. `MultiplayerNotification` is frontend state, not raw server state.
3. `MultiplayerError` gives you a single shape for `error` and `connect_error`.

Checkpoint:
1. The file saves with no TypeScript error.

---

## 3. Create the React Context

Goal:
1. Define the shape that every multiplayer consumer will read.

File:
1. `frontend/src/multiplayer/MultiplayerContext.ts`

### 3.1 Replace the file with this exact code

```ts
import { createContext } from "react";
import type {
  MultiplayerConnectionStatus,
  MultiplayerError,
  MultiplayerNotification,
  RoomState,
} from "../types/multiplayer";

export type MultiplayerContextValue = {
  connectionStatus: MultiplayerConnectionStatus;
  notifications: MultiplayerNotification[];
  activeRoom: RoomState | null;
  lastError: MultiplayerError | null;
  sendInvite: (toUsername: string) => void;
  acceptInvite: (inviteId: string) => void;
  markAllNotificationsRead: () => void;
};

export const MultiplayerContext =
  createContext<MultiplayerContextValue | null>(null);
```

### 3.2 Why this file is small

1. It only describes the contract.
2. It does not know how sockets work.
3. The provider will fill in the actual values later.

Checkpoint:
1. `MultiplayerContext.ts` imports cleanly.

---

## 4. Create the `useMultiplayer()` Hook

Goal:
1. Make a safe helper so components do not call `useContext(...)` directly.

File:
1. `frontend/src/multiplayer/useMultiplayer.ts`

### 4.1 Replace the file with this exact code

```ts
import { useContext } from "react";
import { MultiplayerContext } from "./MultiplayerContext";

export function useMultiplayer() {
  const value = useContext(MultiplayerContext);

  if (!value) {
    throw new Error(
      "useMultiplayer must be used inside MultiplayerConnectionProvider",
    );
  }

  return value;
}

export default useMultiplayer;
```

### 4.2 Why this hook matters

1. If you call the hook outside the provider, you get a clear error immediately.
2. Every future UI file can import one hook instead of remembering context details.

Checkpoint:
1. The hook file has no TypeScript error.

---

## 5. Upgrade the Provider in Small Passes

Goal:
1. Turn `MultiplayerConnectionProvider` into the single source of multiplayer truth.

File:
1. `frontend/src/multiplayer/MultiplayerConnectionProvider.tsx`

### 5.1 Pass A: add state and context imports

Replace the file with this version first.
Do not add all socket listeners yet.

```tsx
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Socket } from "socket.io-client";
import { MultiplayerContext } from "./MultiplayerContext";
import { createMultiplayerSocket } from "./socket";
import type {
  MultiplayerConnectionStatus,
  MultiplayerError,
  MultiplayerNotification,
  RoomState,
} from "../types/multiplayer";

type MultiplayerConnectionProviderProps = {
  accessToken?: string;
  username?: string;
  children: ReactNode;
};

export default function MultiplayerConnectionProvider({
  accessToken,
  username,
  children,
}: MultiplayerConnectionProviderProps) {
  const socketRef = useRef<Socket | null>(null);

  const [connectionStatus, setConnectionStatus] =
    useState<MultiplayerConnectionStatus>("idle");
  const [notifications, setNotifications] = useState<MultiplayerNotification[]>(
    [],
  );
  const [activeRoom, setActiveRoom] = useState<RoomState | null>(null);
  const [lastError, setLastError] = useState<MultiplayerError | null>(null);

  const sendInvite = (_toUsername: string) => {
    setLastError({
      code: "NOT_IMPLEMENTED",
      message: "sendInvite is not implemented yet.",
      receivedAt: new Date().toISOString(),
    });
  };

  const acceptInvite = (_inviteId: string) => {
    setLastError({
      code: "NOT_IMPLEMENTED",
      message: "acceptInvite is not implemented yet.",
      receivedAt: new Date().toISOString(),
    });
  };

  const markAllNotificationsRead = () => {
    setNotifications((current) =>
      current.map((item) => ({ ...item, isRead: true })),
    );
  };

  useEffect(() => {
    if (!accessToken || !username) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      setConnectionStatus("idle");
      setNotifications([]);
      setActiveRoom(null);
      setLastError(null);
      return;
    }

    setConnectionStatus("connecting");

    const socket = createMultiplayerSocket({ accessToken, username });
    socketRef.current = socket;

    const handleConnect = () => {
      socket.emit("room.sync");
    };

    socket.on("connect", handleConnect);

    return () => {
      socket.off("connect", handleConnect);
      socket.disconnect();

      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [accessToken, username]);

  return (
    <MultiplayerContext.Provider
      value={{
        connectionStatus,
        notifications,
        activeRoom,
        lastError,
        sendInvite,
        acceptInvite,
        markAllNotificationsRead,
      }}
    >
      {children}
    </MultiplayerContext.Provider>
  );
}
```

What just changed:
1. The provider now owns four pieces of state.
2. The provider now returns a context value.
3. The action methods are placeholders for now.

Checkpoint:
1. The provider still renders children.
2. The code compiles before adding more complexity.

### 5.2 Pass B: add tiny helper functions above the component

Still in `frontend/src/multiplayer/MultiplayerConnectionProvider.tsx`, add these helper functions above `export default function ...`.

```ts
function createLocalError(code: string, message: string): MultiplayerError {
  return {
    code,
    message,
    receivedAt: new Date().toISOString(),
  };
}

function normalizeSocketError(payload: unknown): MultiplayerError {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const data = payload as Record<string, unknown>;

    return {
      code:
        typeof data.code === "string" && data.code.trim()
          ? data.code
          : "SOCKET_ERROR",
      message:
        typeof data.message === "string" && data.message.trim()
          ? data.message
          : "Unknown socket error",
      receivedAt: new Date().toISOString(),
    };
  }

  return createLocalError("SOCKET_ERROR", "Unknown socket error");
}

function createNotificationFromPayload(
  payload: unknown,
): MultiplayerNotification {
  const data =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};

  const invite =
    data.invite && typeof data.invite === "object" && !Array.isArray(data.invite)
      ? (data.invite as MultiplayerNotification["invite"])
      : null;

  return {
    id: crypto.randomUUID(),
    type: typeof data.type === "string" ? data.type : "unknown",
    message:
      typeof data.message === "string"
        ? data.message
        : "You have a new notification.",
    invite,
    receivedAt: new Date().toISOString(),
    isRead: false,
    isExpired: false,
  };
}
```

Why these helpers exist:
1. They keep your `useEffect` smaller.
2. They convert messy socket payloads into your clean frontend types.

Checkpoint:
1. The file still compiles after adding helper functions.

### 5.3 Pass C: replace the socket effect with real listeners

Inside the same provider file, replace the entire `useEffect(...)` with this version:

```tsx
useEffect(() => {
  if (!accessToken || !username) {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setConnectionStatus("idle");
    setNotifications([]);
    setActiveRoom(null);
    setLastError(null);
    return;
  }

  setConnectionStatus("connecting");

  const socket = createMultiplayerSocket({ accessToken, username });
  socketRef.current = socket;

  const handleConnect = () => {
    setConnectionStatus("connected");
    setLastError(null);
    socket.emit("room.sync");
  };

  const handleDisconnect = () => {
    setConnectionStatus("disconnected");
  };

  const handleConnectError = (error: unknown) => {
    setConnectionStatus("disconnected");
    setLastError(normalizeSocketError(error));
  };

  const handleNotificationNew = (payload: unknown) => {
    const notification = createNotificationFromPayload(payload);
    setNotifications((current) => [notification, ...current]);
  };

  const handleInviteExpired = (payload: unknown) => {
    const data =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const inviteId =
      typeof data.inviteId === "string" ? data.inviteId : null;

    if (!inviteId) {
      return;
    }

    setNotifications((current) =>
      current.map((item) =>
        item.invite?.inviteId === inviteId
          ? { ...item, isExpired: true }
          : item,
      ),
    );
  };

  const handleRoomJoined = (payload: unknown) => {
    const data =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const roomState =
      data.roomState && typeof data.roomState === "object"
        ? (data.roomState as RoomState)
        : null;

    if (roomState) {
      setActiveRoom(roomState);
    }
  };

  const handleRoomUpdated = (payload: unknown) => {
    const data =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const roomState =
      data.roomState && typeof data.roomState === "object"
        ? (data.roomState as RoomState)
        : null;

    if (roomState) {
      setActiveRoom(roomState);
    }
  };

  const handleSocketError = (payload: unknown) => {
    setLastError(normalizeSocketError(payload));
  };

  socket.on("connect", handleConnect);
  socket.on("disconnect", handleDisconnect);
  socket.on("connect_error", handleConnectError);
  socket.on("notification.new", handleNotificationNew);
  socket.on("invite.expired", handleInviteExpired);
  socket.on("room.joined", handleRoomJoined);
  socket.on("room.updated", handleRoomUpdated);
  socket.on("error", handleSocketError);

  return () => {
    socket.off("connect", handleConnect);
    socket.off("disconnect", handleDisconnect);
    socket.off("connect_error", handleConnectError);
    socket.off("notification.new", handleNotificationNew);
    socket.off("invite.expired", handleInviteExpired);
    socket.off("room.joined", handleRoomJoined);
    socket.off("room.updated", handleRoomUpdated);
    socket.off("error", handleSocketError);
    socket.disconnect();

    if (socketRef.current === socket) {
      socketRef.current = null;
    }
  };
}, [accessToken, username]);
```

What to verify now:
1. Logging in should connect once.
2. Refresh should reconnect because Step `A2` restores the session.
3. Every connect should emit `room.sync` because Step `B1` added the server handler.

Checkpoint:
1. The provider owns real state now.
2. No duplicate listeners are added on re-render.

---

## 6. Implement the Action Methods

Goal:
1. Components should call simple functions, not raw `socket.emit(...)`.

File:
1. `frontend/src/multiplayer/MultiplayerConnectionProvider.tsx`

### 6.1 Add a helper to guard missing sockets

Above the component, add:

```ts
function isSocketReady(socket: Socket | null): socket is Socket {
  return Boolean(socket && socket.connected);
}
```

### 6.2 Replace the placeholder action methods

Inside the component, replace `sendInvite`, `acceptInvite`, and `markAllNotificationsRead` with:

```tsx
const sendInvite = (toUsername: string) => {
  const socket = socketRef.current;
  const trimmedUsername = toUsername.trim();

  if (!trimmedUsername) {
    setLastError(createLocalError("INVALID_INPUT", "Username is required."));
    return;
  }

  if (!isSocketReady(socket)) {
    setLastError(
      createLocalError(
        "SOCKET_NOT_READY",
        "You are not connected to multiplayer.",
      ),
    );
    return;
  }

  socket.emit("invite.send", { toUsername: trimmedUsername });
};

const acceptInvite = (inviteId: string) => {
  const socket = socketRef.current;

  if (!inviteId.trim()) {
    setLastError(createLocalError("INVALID_INPUT", "Invite ID is required."));
    return;
  }

  if (!isSocketReady(socket)) {
    setLastError(
      createLocalError(
        "SOCKET_NOT_READY",
        "You are not connected to multiplayer.",
      ),
    );
    return;
  }

  socket.emit("invite.accept", { inviteId });
};

const markAllNotificationsRead = () => {
  setNotifications((current) =>
    current.map((item) => ({ ...item, isRead: true })),
  );
};
```

Checkpoint:
1. The provider exposes usable functions now.
2. You still have not built any real multiplayer UI, which is correct for this phase.

---

## 7. Confirm Step 0 Code Is In Place

This phase assumes these two foundation pieces already exist.

### 7.1 Session bootstrap after refresh

Files:
1. `server/src/controller/auth.controller.ts`
2. `server/src/service/auth.service.ts`
3. `frontend/src/types/auth.ts`
4. `frontend/src/pages/LandingPage.tsx`

What should already be true:
1. The server exposes `GET /auth/me`.
2. `LandingPage` restores session state from token plus `/auth/me`.
3. `MultiplayerConnectionProvider` receives `accessToken` and `username` even after refresh.

Checkpoint:
1. Refreshing the page keeps the username visible and reconnects the socket.

### 7.2 Reconnect room resync

Files:
1. `server/src/multiplayer/multiplayer.gateway.ts`
2. `frontend/src/multiplayer/MultiplayerConnectionProvider.tsx`

What should already be true:
1. The server handles `room.sync`.
2. The client emits `room.sync` on every successful `connect`.

Checkpoint:
1. A reconnecting user gets `room.updated` without waiting for another room mutation.

---

## 8. Add One Tiny Read-Only Consumer

Goal:
1. Prove the context actually works before building full UX.

Recommended file:
1. `frontend/src/components/TopBar.tsx`

### 8.1 Import the hook

Add:

```ts
import useMultiplayer from "../multiplayer/useMultiplayer";
```

### 8.2 Read the state near the top of the component

Inside `TopBar(...)`, add:

```ts
const { connectionStatus, notifications } = useMultiplayer();
const unreadCount = notifications.filter((item) => !item.isRead).length;
```

### 8.3 Show tiny debug text when logged in

Inside the logged-in branch, add something simple like:

```tsx
<span style={{ fontSize: 12, opacity: 0.7 }}>{connectionStatus}</span>
<span style={{ fontSize: 12, opacity: 0.7 }}>
  unread: {unreadCount}
</span>
```

Why this step matters:
1. It proves the provider, context, hook, and listeners are all connected.
2. It gives you a visual signal before you build a real notification UI.

Checkpoint:
1. You can see `connected` after login.
2. You can see unread count increase when `notification.new` arrives.

---

## 9. Suggested Test Flow for a Beginner

Do this manually in order.

### 9.1 Test the auth bootstrap

1. Log in.
2. Confirm the top bar shows your username.
3. Refresh the page.
4. Confirm the username still shows.
5. Confirm the socket reconnects.

If this fails:
1. Check `LandingPage.tsx`.
2. Check `/auth/me`.
3. Check browser Network tab for `GET /auth/me`.

### 9.2 Test the socket connection state

1. Log in.
2. Confirm the top bar shows `connected`.
3. Log out.
4. Confirm the provider resets state.

If this fails:
1. Check the `connect` and `disconnect` listeners in the provider.

### 9.3 Test invite notifications

1. Open two browser tabs or two browsers with different users.
2. Send an invite from user A to user B.
3. Confirm user B gets a new unread notification in React state.

If this fails:
1. Check `notification.new` listener.
2. Check the server emits in `multiplayer.gateway.ts`.

### 9.4 Test invite expiry

1. Send an invite.
2. Wait for it to expire.
3. Confirm the matching notification becomes `isExpired: true`.

If this fails:
1. Check the `invite.expired` listener.
2. Check the server timer logic.

### 9.5 Test room join and room update

1. Accept an invite.
2. Confirm `room.joined` sets `activeRoom`.
3. Confirm later `room.updated` also replaces `activeRoom`.

If this fails:
1. Check the room event listeners in the provider.

### 9.6 Test reconnect recovery

1. Join a room.
2. Refresh one tab.
3. Confirm the client reconnects.
4. Confirm `room.sync` causes the current room state to return.

If this fails:
1. Check that the frontend emits `room.sync` in `handleConnect`.
2. Check that the server `handleRoomSync(...)` emits `room.updated`.

---

## 10. Stop Point Before Phase 3

At the end of this phase, you should have:
1. One socket connection per logged-in tab.
2. Shared multiplayer types.
3. A real `MultiplayerContext`.
4. A real `useMultiplayer()` hook.
5. A provider that owns:
   1. `connectionStatus`
   2. `notifications`
   3. `activeRoom`
   4. `lastError`
6. Action methods for:
   1. `sendInvite`
   2. `acceptInvite`
   3. `markAllNotificationsRead`
7. A tiny read-only UI proof in `TopBar`.

You should still not build:
1. A polished notification bell.
2. An invite modal.
3. A room panel.
4. Game controls.
5. Any final Phase 3 UX.

---

## Definition of Done for Phase 2

Phase 2 is done when:
1. Logging in creates exactly one socket per tab.
2. Refreshing the page restores enough auth state for the socket to reconnect.
3. `notification.new` immediately adds a notification to React state.
4. `invite.expired` updates the matching notification.
5. `room.joined` updates `activeRoom`.
6. `room.updated` updates `activeRoom`.
7. `useMultiplayer()` is the only API consumers need.
8. Reconnect restores room state through `room.sync`.

---

## Recommended File List

Frontend:
1. `frontend/src/types/multiplayer.ts`
2. `frontend/src/types/auth.ts`
3. `frontend/src/multiplayer/MultiplayerContext.ts`
4. `frontend/src/multiplayer/useMultiplayer.ts`
5. `frontend/src/multiplayer/MultiplayerConnectionProvider.tsx`
6. `frontend/src/multiplayer/socket.ts`
7. `frontend/src/pages/LandingPage.tsx`
8. `frontend/src/components/TopBar.tsx`

Backend:
1. `server/src/controller/auth.controller.ts`
2. `server/src/service/auth.service.ts`
3. `server/src/multiplayer/multiplayer.gateway.ts`

---

## Suggested Commit Boundary

If you want reviewable commits, split them like this:
1. Commit 1:
   1. `frontend/src/types/multiplayer.ts`
   2. `frontend/src/multiplayer/MultiplayerContext.ts`
   3. `frontend/src/multiplayer/useMultiplayer.ts`
2. Commit 2:
   1. `frontend/src/multiplayer/MultiplayerConnectionProvider.tsx`
   2. `frontend/src/components/TopBar.tsx`
3. Commit 3:
   1. `server/src/controller/auth.controller.ts`
   2. `server/src/service/auth.service.ts`
   3. `frontend/src/types/auth.ts`
   4. `frontend/src/pages/LandingPage.tsx`
4. Commit 4:
   1. `server/src/multiplayer/multiplayer.gateway.ts`
   2. reconnect verification
