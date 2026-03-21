import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MultiplayerStore } from './services/multiplayer.store';
import { Invite, RoomState } from './types/multiplayer.types';
import type { InviteAcceptPayload, InviteSendPayload } from './dto/multiplayer.events';
import { randomUUID } from 'crypto';
import { SocketAddress } from 'net';

const DEFAULT_WS_CORS_ORIGINS = [
  'http://localhost:4000',
  'http://localhost:5173',
  'http://192.168.1.12:4000',
];

function resolveWsCorsOrigins(): string[] {
  const fromEnv = process.env.WS_CORS_ORIGINS
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_WS_CORS_ORIGINS;
}

@WebSocketGateway({
  cors: {
    origin: resolveWsCorsOrigins(),
    credentials: true,
  },
})
export class MultiplayerGateway
  implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(MultiplayerGateway.name);

  constructor(private readonly store: MultiplayerStore) { }

  @WebSocketServer()
  server!: Server;

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

  @SubscribeMessage("invite.send")
  handleInviteSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: InviteSendPayload,
  ) {
    const fromUsername = this.store.socketUser.get(client.id);
    if (!fromUsername) {
      client.emit("error", { code: "UNAUTHENTICATED", message: "Client is not registred." });
      return;
    }

    const toUsername = (payload?.toUsername ?? "").trim();
    if (!toUsername) {
      client.emit("error", { code: "INVALID_INPUT", message: "Username is required." });
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

  @SubscribeMessage("invite.accept")
  handleInviteAccept(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: InviteAcceptPayload,
  ) {
    const username = this.store.socketUser.get(client.id);
    if (!username) {
      client.emit("error", {
        code: "UNAUTHENTICATED", message: "Socket is not registered."
      });
    }

    const invite = this.store.invites.get(payload?.inviteId ?? "");
    if (!invite) {
      client.emit("error", { code: "INVITE_NOT_FOUND", message: "Invite does not exist." });
      return;
    }

    if (invite.toUsername !== username) {
      client.emit("error", { code: "FORBIDDEN", message: "This invite is not for you" });
      return;
    }

    if (invite.status !== "pending") {
      client.emit("error", { code: "INVITE_INVALID", message: `Invite is ${invite.status}` });
      return;
    }

    if (new Date(invite.expiresAt).getTime() <= Date.now()) {
      invite.status = "expired";
      this.store.invites.set(invite.inviteId, invite);
      client.emit("error", { code: "INVITE_EXPIRED", message: "Invite has expired." });
      return;
    }

    if (this.store.userToRoom.has(invite.fromUsername)) {
      client.emit("error", { code: "ALREADY_IN_ROOM", message: "You are already in a room." });
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

  private getUsernameFromHandshake(client: Socket): string | null {
    const value = client.handshake.auth?.username;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

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

  private createLobbyRoom(roomId: string, inviter: string, invitee: string) {
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
    };
  }

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

  private markUserDisconnectedInRoom(username: string): void {
    const roomId = this.store.userToRoom.get(username);
    if (!roomId) return;

    const room = this.store.rooms.get(roomId);
    if (!room) return;

    const member = room.members.find((item) => item.username === username);
    if (!member || !member.isConnected) return;

    member.isConnected = false;
    this.store.rooms.set(roomId, room);
    this.emitRoomToUsers(room);
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
}
