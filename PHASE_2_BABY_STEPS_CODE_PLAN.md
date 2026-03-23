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

## 1. Create Shared Frontend Multiplayer Types

Create file: `frontend/src/types/multiplayer.ts`

Add the server-facing types first:
1. `InviteStatus`
2. `Invite`
3. `RoomMember`
4. `RoomState`

Add frontend-only helper types:
1. `MultiplayerConnectionStatus = "idle" | "connecting" | "connected" | "disconnected"`
2. `MultiplayerNotification`
3. `MultiplayerError`

Suggested `MultiplayerNotification` fields:
1. `id`
2. `type`
3. `message`
4. `invite`
5. `receivedAt`
6. `isRead`
7. `isExpired`

Why this step first:
1. It prevents `any` from leaking across provider, hook, and future UI work.
2. It makes Phase 3 much easier.

Checkpoint:
1. `yarn --cwd frontend build` or your normal frontend typecheck/build step passes.

---

## 2. Create Context and Hook Skeletons

Create file: `frontend/src/multiplayer/MultiplayerContext.ts`

Create file: `frontend/src/multiplayer/useMultiplayer.ts`

Expose a single context shape with:
1. `connectionStatus`
2. `notifications`
3. `activeRoom`
4. `lastError`
5. `sendInvite(toUsername: string)`
6. `acceptInvite(inviteId: string)`
7. `markAllNotificationsRead()`

Recommendation:
1. Keep the context value small and stable.
2. Do not expose raw `socket`.
3. Force all consumers through named action methods.

Checkpoint:
1. Provider compiles even if actions are temporary no-ops.
2. `useMultiplayer()` throws a clear error if used outside the provider.

---

## 3. Upgrade `MultiplayerConnectionProvider` Into a Real State Owner

Update file: `frontend/src/multiplayer/MultiplayerConnectionProvider.tsx`

Current job:
1. Connect socket.
2. Disconnect socket.

New job:
1. Own multiplayer React state.
2. Create and clean up socket listeners.
3. Expose state/actions through context.

Recommended local state:
1. `connectionStatus`
2. `notifications`
3. `activeRoom`
4. `lastError`

Recommended refs:
1. `socketRef`
2. `hasConnectedOnceRef` or similar if useful for reconnect handling

Recommendation:
1. Use `useReducer` if state updates start feeling repetitive.
2. `useState` is also acceptable if you want to keep this phase simpler.

Checkpoint:
1. Login creates exactly one socket connection.
2. Logout disconnects it and clears multiplayer state.
3. Re-rendering the provider does not create duplicate listeners.

---

## 4. Register the Core Socket Event Listeners

Inside the provider, listen for:
1. `connect`
2. `disconnect`
3. `connect_error`
4. `notification.new`
5. `invite.expired`
6. `room.joined`
7. `room.updated`
8. `error`

Event handling rules:
1. `connect`
   1. set status to `connected`
2. `disconnect`
   1. set status to `disconnected`
3. `connect_error`
   1. set status to `disconnected`
   2. store a normalized error message
4. `notification.new`
   1. prepend a new notification item
   2. default `isRead` to `false`
   3. default `isExpired` to `false`
5. `invite.expired`
   1. find matching notification by `inviteId`
   2. mark it expired
6. `room.joined`
   1. replace `activeRoom`
7. `room.updated`
   1. replace `activeRoom`
8. `error`
   1. normalize payload
   2. store it in `lastError`

Important cleanup rule:
1. Every `socket.on(...)` added in the effect must be matched by cleanup before the next socket instance is created.

Checkpoint:
1. You can log in with two tabs and see notification/room events enter React state.

---

## 5. Add Action Methods That Wrap Socket Emits

Implement these actions in the provider:
1. `sendInvite(toUsername)`
2. `acceptInvite(inviteId)`
3. `markAllNotificationsRead()`

Rules:
1. If socket is missing or disconnected, fail locally with a useful error.
2. Trim username input before emitting.
3. Keep emit payloads aligned with backend DTO names.

Emit payloads:
1. `invite.send` -> `{ toUsername }`
2. `invite.accept` -> `{ inviteId }`

Why now:
1. Phase 3 and Phase 4 should use the hook, not call `socket.emit(...)` directly.

Checkpoint:
1. A temporary consumer can call these actions without importing Socket.IO APIs.

---

## 6. Hydrate Login State on App Boot

Update file: `frontend/src/pages/LandingPage.tsx`

Current issue:
1. `loginRes` only exists in memory.
2. Tokens are saved, but React auth state is not restored after refresh.

For MVP, add:
1. Save `username` to `localStorage` on login.
2. Rebuild a minimal `loginRes`-like object from local storage on initial render.
3. Remove saved `username` on logout.

Important note:
1. Do not invent fields you cannot recover.
2. Only restore the fields actually needed by current frontend code.

Checkpoint:
1. Refreshing the page keeps the provider connected for the same logged-in user.

---

## 7. Add Reconnect Resync

Only do this if you chose to add a resync contract in Step 0.5B.

Recommended path:
1. On `connect`, if the client was previously connected or if you want immediate safety, emit `room.sync`.
2. Backend responds with current `room.updated` if the user is in a room.

Why this matters:
1. Without it, reconnect depends on some later room-changing event to repair client state.
2. That is fragile and hard to debug.

Minimal backend logic for `room.sync`:
1. Find username from socket.
2. Look up `userToRoom`.
3. If room exists, emit `room.updated` to that socket only.

Checkpoint:
1. Simulate reconnect and verify the room state reappears without requiring a new invite or room mutation.

---

## 8. Add a Tiny Read-Only Consumer for Validation

Do not build full Phase 3 UI yet.
Add one tiny consumer so you can verify the provider is real.

Simple options:
1. Show connection status text near the username in `TopBar`.
2. Show raw unread invite count in `TopBar`.
3. Add a temporary debug block on `HomnayangiPage`.

Recommendation:
1. Use the smallest possible read-only indicator in `TopBar`.

Why:
1. It proves the context is wired correctly.
2. It reduces blind debugging before Phase 3 notification UX starts.

Checkpoint:
1. You can visually confirm `connected` and notification count changes from live events.

---

## 9. Stop Point Before Phase 3

At the end of Phase 2, you should have:
1. A single reusable multiplayer provider.
2. A `useMultiplayer()` hook.
3. In-memory notification state.
4. In-memory active room state.
5. Socket action wrappers for invite send/accept.
6. Refresh-safe session bootstrap for current MVP.
7. Reconnect room recovery if `room.sync` was added.

You should not have yet:
1. Final notification bell UX.
2. Invite modal UX.
3. Room panel UI.
4. Host controls.
5. Game UI.

---

## Definition of Done for Phase 2

Phase 2 is done when:
1. Logging in creates exactly one socket per tab.
2. Refreshing the page still restores enough auth state for the socket to reconnect.
3. `notification.new` updates React state immediately.
4. `invite.expired` updates existing notification state correctly.
5. `room.joined` and `room.updated` both update `activeRoom`.
6. Future UI code can call `useMultiplayer()` without touching Socket.IO directly.
7. Reconnect restores room state if you implemented `room.sync`.

---

## Recommended File List

Likely files to create or update:
1. `frontend/src/types/multiplayer.ts`
2. `frontend/src/multiplayer/MultiplayerContext.ts`
3. `frontend/src/multiplayer/useMultiplayer.ts`
4. `frontend/src/multiplayer/MultiplayerConnectionProvider.tsx`
5. `frontend/src/multiplayer/socket.ts`
6. `frontend/src/pages/LandingPage.tsx`
7. Optional backend support:
   1. `server/src/multiplayer/dto/multiplayer.events.ts`
   2. `server/src/multiplayer/multiplayer.gateway.ts`

---

## Suggested Commit Boundary

If you want clean reviewable commits, split Phase 2 like this:
1. Commit 1:
   1. shared frontend types
   2. context and hook skeleton
2. Commit 2:
   1. stateful provider
   2. socket listeners
   3. action methods
3. Commit 3:
   1. auth bootstrap on refresh
   2. optional `room.sync`
   3. tiny validation consumer
