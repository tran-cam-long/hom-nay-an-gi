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
import { Invite, RoomStateInternal, toPublicRoomState } from './types/multiplayer.types';
import type {
  GameStartPayload,
  InviteAcceptPayload,
  InviteSendPayload, RoomLeavePayload, RoomSetDishChoicePayload
} from './dto/multiplayer.events';
import { randomUUID } from 'crypto';

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
        this.markUserDisconnectedInRoom(username);
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

    const room: RoomStateInternal = this.createLobbyRoom(invite.roomId, invite.fromUsername, invite.toUsername);
    this.store.rooms.set(room.roomId, room);
    this.store.userToRoom.set(invite.fromUsername, room.roomId);
    this.store.userToRoom.set(invite.toUsername, room.roomId);
    this.emitRoomToUsers(room);
  }

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

    client.emit("room.updated", { roomState: toPublicRoomState(room) });
  }

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

    if (!payload || !payload.roomId || !Number.isFinite(payload.dishId)) {
      client.emit("error", {
        code: "INVALID_INPUT",
        message: "Room set dish choice payload must be present with roomId and numeric dishId."
      });
      return;
    }

    const payloadRoomId = payload.roomId;
    const currentRoomId = this.store.userToRoom.get(username);
    if (!currentRoomId || currentRoomId !== payloadRoomId) {
      client.emit("error", {
        code: "FORBIDDEN",
        message: "You are not in this room.",
      });
      return;
    }

    const room = this.store.rooms.get(payloadRoomId);
    if (!room) {
      client.emit("error", {
        code: "ROOM_NOT_FOUND",
        message: `This roomId ${payloadRoomId} is not existing!`
      });
      return;
    }
    if (room.status !== 'lobby') {
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
    this.logger.log(`${username} marked ready in room ${room.roomId}`);
    this.store.rooms.set(room.roomId, room);
    this.emitRoomUpdated(room);
  }

  @SubscribeMessage("room.leave")
  handleRoomLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RoomLeavePayload,
  ) {
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

    const room = this.store.rooms.get(roomId);
    if (!room) {
      client.emit("error", { code: "ROOM_NOT_FOUND", message: "Room does not exist." });
      return;
    }

    const wasHost = room.hostUsername === username;
    room.members = room.members.filter((member) => member.username !== username);
    delete room.dishChoicesByUsername[username];
    this.store.userToRoom.delete(username);

    for (const socketId of this.store.userSockets.get(username) ?? []) {
      this.server.to(socketId).emit("room.left", { roomId });
    }

    if (room.members.length === 0) {
      this.store.rooms.delete(roomId);
      return;
    }

    if (wasHost) {
      this.assignNextHost(room);
    }

    if (room.members.length === 0) {
      this.store.rooms.delete(roomId);
      return;
    }

    this.store.rooms.set(roomId, room);
    this.emitRoomUpdated(room);
  }

  @SubscribeMessage("game.start")
  handleGameStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: GameStartPayload,
  ) {
    const username = this.store.socketUser.get(client.id);
    if (!username) {
      client.emit("error", {
        code: "UNAUTHENTICATED",
        message: "Socket is not registerd."
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

    const room = this.store.rooms.get(roomId);
    if (!room) {
      client.emit("error", {
        code: "ROOM_NOT_FOUND",
        message: "Room does not exist."
      });
      return;
    }

    if (room.members.length < 2) {
      client.emit("error", {
        code: "ROOM_NOT_READY",
        message: "Need at least 2 players to start."
      });
      return;
    }

    const notReadyMembers = room.members.filter((member) => !member.hasChosenDish);
    if (notReadyMembers.length > 0) {
      client.emit("error", {
        code: "ROOM_NOT_READY",
        message: `Waiting for ${notReadyMembers.map((member) => member.username).join(", ")} to choose a dish.`
      });
      return;
    }

    room.status = "in_game";
    room.selectedGame = game;
    this.store.rooms.set(room.roomId, room);

    this.logger.log(`${username} started ${game} in room ${room.roomId}`);
    this.emitGameStarted(room);
    this.emitRoomUpdated(room);
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

  private createLobbyRoom(roomId: string, inviter: string, invitee: string): RoomStateInternal {
    return {
      roomId,
      status: "lobby" as const,
      selectedGame: null,
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

  private emitRoomToUsers(room: RoomStateInternal): void {
    const usernames = room.members.map((m) => m.username);
    const publicRoomState = toPublicRoomState(room);

    for (const uname of usernames) {
      const socketIds = this.store.userSockets.get(uname);
      if (!socketIds) continue;
      for (const socketId of socketIds) {
        this.server.to(socketId).emit("room.joined", { roomState: publicRoomState });
        this.server.to(socketId).emit("room.updated", { roomState: publicRoomState });
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

    if (member.isHost && room.members.length > 1) {
      this.assignNextHost(room);
    }

    this.store.rooms.set(roomId, room);
    this.emitRoomToUsers(room);
  }

  private emitRoomUpdated(room: RoomStateInternal): void {
    const publicRoomState = toPublicRoomState(room);

    for (const member of room.members) {
      const socketIds = this.store.userSockets.get(member.username);
      if (!socketIds) continue;

      for (const socketId of socketIds) {
        this.server.to(socketId).emit("room.updated", { roomState: publicRoomState });
      }
    }
  }

  private assignNextHost(room: RoomStateInternal): void {
    const nextHost = room.members.find((member) => member.isConnected) ?? room.members[0] ?? null;

    room.hostUsername = nextHost ? nextHost.username : "";
    room.members = room.members.map((member) => ({
      ...member,
      isHost: nextHost ? member.username === nextHost.username : false,
    }));
  }

  private emitGameStarted(room: RoomStateInternal): void {
    for (const member of room.members) {
      const socketIds = this.store.userSockets.get(member.username);
      if (!socketIds) continue;

      for (const socketId of socketIds) {
        this.server.to(socketId).emit("game.started", {
          roomId: room.roomId,
          game: room.selectedGame
        });
      }
    }
  }
}
