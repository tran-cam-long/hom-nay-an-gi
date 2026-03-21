# Phase 1 Baby Steps Code Plan (Backend Only)

This guide is for implementing **Phase 1** yourself in very small steps, with checkpoints after each step.

Scope:
1. Backend multiplayer foundation only.
2. No frontend UI work yet.
3. Keep data in memory.

---

## 0. Current Starting Point

You already have:
1. `MultiplayerModule` wired in `server/src/app.module.ts`.
2. Basic `MultiplayerGateway` created.
3. Socket.IO dependencies installed.

Goal for Phase 1:
1. Real user socket presence map.
2. Invite send + 60s timeout.
3. Invite accept + room creation/join.
4. Room state broadcast events.

---

## 0.5 Build Test Clients First (Do this once before Step 4)

Before testing gateway steps, create a tiny CLI socket client so you can reuse it for all checkpoints.

Create file: `server/scripts/socket-test-client.cjs`

```js
const { io } = require("socket.io-client");
const readline = require("readline");

const username = process.argv[2];
const url = process.argv[3] || "http://localhost:3000";

if (!username) {
  console.error("Usage: node server/scripts/socket-test-client.cjs <username> [url]");
  process.exit(1);
}

const socket = io(url, {
  transports: ["websocket"],
  auth: { username },
});

let lastInviteId = null;

socket.on("connect", () => {
  console.log(`[${username}] connected: ${socket.id}`);
  console.log(`[${username}] commands: invite <user>, accept <inviteId>, accept-last, quit`);
});

socket.on("disconnect", (reason) => {
  console.log(`[${username}] disconnected: ${reason}`);
});

socket.on("connect_error", (err) => {
  console.error(`[${username}] connect_error:`, err.message);
});

socket.on("notification.new", (payload) => {
  console.log(`[${username}] notification.new:`, JSON.stringify(payload, null, 2));
  if (payload?.invite?.inviteId) {
    lastInviteId = payload.invite.inviteId;
  }
});

socket.on("invite.expired", (payload) => {
  console.log(`[${username}] invite.expired:`, JSON.stringify(payload, null, 2));
});

socket.on("room.joined", (payload) => {
  console.log(`[${username}] room.joined:`, JSON.stringify(payload, null, 2));
});

socket.on("room.updated", (payload) => {
  console.log(`[${username}] room.updated:`, JSON.stringify(payload, null, 2));
});

socket.on("error", (payload) => {
  console.log(`[${username}] error:`, JSON.stringify(payload, null, 2));
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.on("line", (line) => {
  const input = line.trim();
  if (!input) return;

  const [cmd, ...rest] = input.split(" ");

  if (cmd === "invite") {
    const toUsername = rest[0];
    socket.emit("invite.send", { toUsername });
    return;
  }

  if (cmd === "accept") {
    const inviteId = rest[0];
    socket.emit("invite.accept", { inviteId });
    return;
  }

  if (cmd === "accept-last") {
    if (!lastInviteId) {
      console.log(`[${username}] no lastInviteId yet`);
      return;
    }
    socket.emit("invite.accept", { inviteId: lastInviteId });
    return;
  }

  if (cmd === "quit") {
    rl.close();
    socket.disconnect();
    process.exit(0);
  }

  console.log(`[${username}] unknown command`);
});
```

How to run it:
1. Terminal A:
   1. `yarn --cwd server start:dev`
2. Terminal B:
   1. `node server/scripts/socket-test-client.cjs alice`
3. Terminal C:
   1. `node server/scripts/socket-test-client.cjs bob`

Quick command examples:
1. In Alice terminal: `invite bob`
2. In Bob terminal: `accept-last`
3. Close client: `quit`

Checkpoint:
1. Both clients connect successfully.
2. They receive and print socket events.

---

## 1. Create Shared Multiplayer Types

Create file: `server/src/multiplayer/types/multiplayer.types.ts`

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
```

Checkpoint:
1. Run `yarn --cwd server build`.
2. Ensure compile passes.

---

## 2. Add In-Memory Store Service

Create file: `server/src/multiplayer/services/multiplayer.store.ts`

```ts
import { Injectable } from "@nestjs/common";
import type { Invite, RoomState } from "../types/multiplayer.types";

@Injectable()
export class MultiplayerStore {
  // username -> socketIds
  readonly userSockets = new Map<string, Set<string>>();

  // socketId -> username
  readonly socketUser = new Map<string, string>();

  // inviteId -> invite
  readonly invites = new Map<string, Invite>();

  // inviteId -> timeout
  readonly inviteTimers = new Map<string, NodeJS.Timeout>();

  // roomId -> room state
  readonly rooms = new Map<string, RoomState>();

  // username -> roomId
  readonly userToRoom = new Map<string, string>();
}
```

Update module: `server/src/multiplayer/multiplayer.module.ts`

```ts
import { Module } from "@nestjs/common";
import { MultiplayerGateway } from "./multiplayer.gateway";
import { MultiplayerStore } from "./services/multiplayer.store";

@Module({
  providers: [MultiplayerGateway, MultiplayerStore],
  exports: [MultiplayerStore],
})
export class MultiplayerModule {}
```

Checkpoint:
1. `yarn --cwd server build` passes.

---

## 3. Add Event Payload DTOs

Create file: `server/src/multiplayer/dto/multiplayer.events.ts`

```ts
export type InviteSendPayload = {
  toUsername: string;
};

export type InviteAcceptPayload = {
  inviteId: string;
};
```

Checkpoint:
1. Build passes.

---

## 4. Upgrade Gateway: Register Online Users

Edit: `server/src/multiplayer/multiplayer.gateway.ts`

Copy-paste implementation:

```ts
constructor(private readonly store: MultiplayerStore) {}

handleConnection(client: Socket): void {
  const username = this.getUsernameFromHandshake(client);
  if (!username) {
    this.logger.warn(`Rejected socket without username: ${client.id}`);
    client.disconnect(true);
    return;
  }

  let socketIds = this.store.userSockets.get(username);
  if (!socketIds) {
    socketIds = new Set<string>();
    this.store.userSockets.set(username, socketIds);
  }
  socketIds.add(client.id);

  this.store.socketUser.set(client.id, username);
  this.logger.log(`Socket connected: ${client.id} (${username})`);
}

handleDisconnect(client: Socket): void {
  const username = this.store.socketUser.get(client.id);
  this.store.socketUser.delete(client.id);

  if (!username) {
    this.logger.log(`Socket disconnected: ${client.id}`);
    return;
  }

  const socketIds = this.store.userSockets.get(username);
  if (socketIds) {
    socketIds.delete(client.id);
    if (socketIds.size === 0) {
      this.store.userSockets.delete(username);
    }
  }

  this.logger.log(`Socket disconnected: ${client.id}`);
}

private getUsernameFromHandshake(client: Socket): string | null {
  const value = client.handshake.auth?.username;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
```

Checkpoint manual test:
1. Start server.
2. Run one test client: `node server/scripts/socket-test-client.cjs alice`
3. Verify logs for connect/disconnect and no crashes.

---

## 5. Add `invite.send` Handler (No Accept Yet)

In `MultiplayerGateway`, add:

```ts
import { randomUUID } from "crypto";
import { ConnectedSocket, MessageBody, SubscribeMessage } from "@nestjs/websockets";
import type { InviteSendPayload } from "./dto/multiplayer.events";
import type { Invite } from "./types/multiplayer.types";
```

Implement event:

```ts
@SubscribeMessage("invite.send")
handleInviteSend(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: InviteSendPayload,
) {
  const fromUsername = this.store.socketUser.get(client.id);
  if (!fromUsername) {
    client.emit("error", { code: "UNAUTHENTICATED", message: "Socket is not registered." });
    return;
  }

  const toUsername = (payload?.toUsername ?? "").trim();
  if (!toUsername) {
    client.emit("error", { code: "INVALID_INPUT", message: "toUsername is required." });
    return;
  }

  if (toUsername === fromUsername) {
    client.emit("error", { code: "INVALID_INPUT", message: "You cannot invite yourself." });
    return;
  }

  const targetSockets = this.store.userSockets.get(toUsername);
  if (!targetSockets || targetSockets.size === 0) {
    client.emit("error", { code: "USER_OFFLINE", message: "Target user is offline." });
    return;
  }

  const roomId = randomUUID();
  const inviteId = randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 60_000);

  const invite: Invite = {
    inviteId,
    roomId,
    fromUsername,
    toUsername,
    status: "pending",
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  this.store.invites.set(inviteId, invite);
  this.scheduleInviteExpiry(inviteId);

  for (const socketId of targetSockets) {
    this.server.to(socketId).emit("notification.new", {
      type: "invite",
      invite,
      message: `${fromUsername} is inviting you to join Homnayangi`,
    });
  }
}
```

Add timer helper:

```ts
private scheduleInviteExpiry(inviteId: string): void {
  const timeout = setTimeout(() => {
    const invite = this.store.invites.get(inviteId);
    if (!invite || invite.status !== "pending") return;

    invite.status = "expired";
    this.store.invites.set(inviteId, invite);
    this.server.emit("invite.expired", { inviteId });
    this.store.inviteTimers.delete(inviteId);
  }, 60_000);

  this.store.inviteTimers.set(inviteId, timeout);
}
```

Checkpoint:
1. Build passes.
2. With 2 test clients (`alice`, `bob`), run `invite bob` from Alice and verify Bob gets `notification.new`.
3. After 60s, `invite.expired` is emitted.

---

## 6. Add Room Factory Helper

Add helper in gateway:

```ts
private createLobbyRoom(roomId: string, inviter: string, invitee: string) {
  return {
    roomId,
    status: "lobby" as const,
    selectedGame: null as const,
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
  };
}
```

Checkpoint:
1. Build passes.

---

## 7. Add `invite.accept` Handler

Add handler:

```ts
import type { InviteAcceptPayload } from "./dto/multiplayer.events";
import type { RoomState } from "./types/multiplayer.types";
```

```ts
@SubscribeMessage("invite.accept")
handleInviteAccept(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: InviteAcceptPayload,
) {
  const username = this.store.socketUser.get(client.id);
  if (!username) {
    client.emit("error", { code: "UNAUTHENTICATED", message: "Socket is not registered." });
    return;
  }

  const invite = this.store.invites.get(payload?.inviteId ?? "");
  if (!invite) {
    client.emit("error", { code: "INVITE_NOT_FOUND", message: "Invite does not exist." });
    return;
  }

  if (invite.toUsername !== username) {
    client.emit("error", { code: "FORBIDDEN", message: "This invite is not for you." });
    return;
  }

  if (invite.status !== "pending") {
    client.emit("error", { code: "INVITE_INVALID", message: `Invite is ${invite.status}.` });
    return;
  }

  if (new Date(invite.expiresAt).getTime() <= Date.now()) {
    invite.status = "expired";
    this.store.invites.set(invite.inviteId, invite);
    client.emit("error", { code: "INVITE_EXPIRED", message: "Invite has expired." });
    return;
  }

  invite.status = "accepted";
  this.store.invites.set(invite.inviteId, invite);

  const timer = this.store.inviteTimers.get(invite.inviteId);
  if (timer) {
    clearTimeout(timer);
    this.store.inviteTimers.delete(invite.inviteId);
  }

  const room: RoomState = this.createLobbyRoom(invite.roomId, invite.fromUsername, invite.toUsername);
  this.store.rooms.set(room.roomId, room);
  this.store.userToRoom.set(invite.fromUsername, room.roomId);
  this.store.userToRoom.set(invite.toUsername, room.roomId);

  this.emitRoomToUsers(room);
}
```

Add broadcaster:

```ts
private emitRoomToUsers(room: RoomState): void {
  const usernames = room.members.map((m) => m.username);

  for (const uname of usernames) {
    const socketIds = this.store.userSockets.get(uname);
    if (!socketIds) continue;
    for (const socketId of socketIds) {
      this.server.to(socketId).emit("room.joined", { roomState: room });
      this.server.to(socketId).emit("room.updated", { roomState: room });
    }
  }
}
```

Checkpoint:
1. Build passes.
2. Receiver accepts invite using `accept-last`.
3. Both users receive `room.joined` and `room.updated`.

---

## 8. Add Minimal Conflict Guards

Before creating invite or accepting:
1. Reject if inviter already in room.
2. Reject if invitee already in room.

Snippet:

```ts
if (this.store.userToRoom.has(fromUsername)) {
  client.emit("error", { code: "ALREADY_IN_ROOM", message: "You are already in a room." });
  return;
}
```

Use same for target and accepter.

Checkpoint:
1. Invite blocked when either side already has room.

---

## 9. Add Cleanup on Disconnect (Basic)

If not already imported in `multiplayer.gateway.ts`, add:

```ts
import type { RoomState } from "./types/multiplayer.types";
```

Add these helpers in `MultiplayerGateway`:

```ts
private markUserDisconnectedInRoom(username: string): void {
  const roomId = this.store.userToRoom.get(username);
  if (!roomId) return;

  const room = this.store.rooms.get(roomId);
  if (!room) return;

  const member = room.members.find((item) => item.username === username);
  if (!member || !member.isConnected) return;

  member.isConnected = false;
  this.store.rooms.set(roomId, room);
  this.emitRoomUpdated(room);
}

private emitRoomUpdated(room: RoomState): void {
  for (const member of room.members) {
    const socketIds = this.store.userSockets.get(member.username);
    if (!socketIds) continue;

    for (const socketId of socketIds) {
      this.server.to(socketId).emit("room.updated", { roomState: room });
    }
  }
}
```

Then update `handleDisconnect` (from Step 4) to call it when user is fully offline:

```ts
if (socketIds) {
  socketIds.delete(client.id);
  if (socketIds.size === 0) {
    this.store.userSockets.delete(username);
    this.markUserDisconnectedInRoom(username);
  }
}
```

Checkpoint:
1. Disconnect one user.
2. Room broadcast reflects `isConnected: false`.

---

## 10. Manual Test Script Checklist (You Can Run Twice With Two Tabs)

Server behavior checklist:
1. Two users connect.
2. User A runs `invite <username>` to User B.
3. User B receives `notification.new`.
4. Wait > 60s without accept -> receive `invite.expired`.
5. Send again and accept within 60s.
6. Both users receive room events.
7. Disconnect one user -> room updates with disconnected flag.

---

## 11. Suggested Commit Strategy

Use tiny commits:
1. `feat(multiplayer): add shared types`
2. `feat(multiplayer): add in-memory store service`
3. `feat(multiplayer): map socket presence in gateway`
4. `feat(multiplayer): implement invite.send with timeout`
5. `feat(multiplayer): implement invite.accept and room join events`
6. `feat(multiplayer): add room conflict guards and disconnect room update`

---

## 12. Definition of Done for Your Phase 1

You are done when:
1. Invite send works between 2 connected users.
2. Invite auto-expires at 60 seconds.
3. Invite accept creates room with host assigned.
4. Room events are broadcast to all room members.
5. In-memory maps stay consistent during connect/disconnect.
