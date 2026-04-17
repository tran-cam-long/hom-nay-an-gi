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
import { Invite, RoomStateInternal, RpsMove, toPublicRoomState } from './types/multiplayer.types';
import type {
  GameStartPayload,
  InviteAcceptPayload,
  InviteSendPayload,
  RoomLeavePayload,
  RoomSetDishChoicePayload,
  RpsMoveUpdatePayload,
} from './dto/multiplayer.events';
import { randomUUID } from 'crypto';

const DEFAULT_WS_CORS_ORIGINS = [
  'http://localhost:4000',
  'http://localhost:5173',
  'http://192.168.1.12:4000',
];
const RPS_ROUND_DURATION_MS = 5_000;
const RPS_MOVES: RpsMove[] = ['rock', 'paper', 'scissors'];

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

    if (
      !payload ||
      !payload.roomId ||
      !Number.isFinite(payload.dishId) ||
      !payload.dishName?.trim()
    ) {
      client.emit("error", {
        code: "INVALID_INPUT",
        message: "Room set dish choice payload must include roomId, numeric dishId, and dishName."
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
    room.dishChoiceNamesByUsername[username] = payload.dishName.trim();
    member.hasChosenDish = true;
    this.logger.log(`${username} marked ready in room ${room.roomId}`);
    this.store.rooms.set(room.roomId, room);
    this.emitRoomUpdated(room);
  }

  @SubscribeMessage("rps.move.update")
  handleRpsMoveUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RpsMoveUpdatePayload,
  ) {
    const username = this.store.socketUser.get(client.id);
    if (!username) {
      client.emit("error", { code: "UNAUTHENTICATED", message: "Socket is not registered." });
      return;
    }

    const roomId = payload?.roomId?.trim();
    const move = payload?.move;
    if (!roomId || !this.isRpsMove(move)) {
      client.emit("error", {
        code: "INVALID_INPUT",
        message: "Move update must include roomId and a supported move.",
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
    if (!room || room.status !== "in_game" || room.selectedGame !== "rps" || !room.currentRound) {
      client.emit("error", {
        code: "ROOM_NOT_READY",
        message: "There is no active RPS round for this room.",
      });
      return;
    }

    if (Date.now() >= new Date(room.currentRound.deadlineAt).getTime()) {
      client.emit("error", {
        code: "ROUND_LOCKED",
        message: "This round is already locked.",
      });
      return;
    }

    if (!room.currentRound.activePlayers.includes(username)) {
      client.emit("error", {
        code: "FORBIDDEN",
        message: "You are not an active player in this round.",
      });
      return;
    }

    room.currentRound.submittedMoves[username] = move;
    this.store.rooms.set(roomId, room);
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
      this.clearRoomGameTimer(roomId);
      this.store.rooms.delete(roomId);
      return;
    }

    if (wasHost) {
      this.assignNextHost(room);
    }

    if (room.members.length === 0) {
      this.clearRoomGameTimer(roomId);
      this.store.rooms.delete(roomId);
      return;
    }

    if (room.currentRound) {
      room.currentRound.activePlayers = room.currentRound.activePlayers.filter((memberUsername) => memberUsername !== username);
      delete room.currentRound.submittedMoves[username];
    }

    if (room.status === "in_game") {
      const survivors = room.members.filter((member) => !member.isEliminated).map((member) => member.username);
      if (survivors.length === 1) {
        this.finishRpsGame(room, survivors[0]);
        return;
      }
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

    const currentRoomId = this.store.userToRoom.get(username);
    if (!currentRoomId || currentRoomId !== roomId) {
      client.emit("error", {
        code: "FORBIDDEN",
        message: "You are not in this room.",
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

    room.members = room.members.map((member) => ({
      ...member,
      isEliminated: false,
    }));
    room.status = "in_game";
    room.selectedGame = game;
    room.currentRound = null;
    this.store.rooms.set(room.roomId, room);

    this.logger.log(`${username} started ${game} in room ${room.roomId}`);
    this.emitGameStarted(room);
    this.startNextRpsRound(room, 1);
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
      dishChoiceNamesByUsername: {},
      currentRound: null,
    };
  }

  private emitRoomToUsers(room: RoomStateInternal): void {
    const publicRoomState = toPublicRoomState(room);

    for (const uname of room.members.map((m) => m.username)) {
      const socketIds = this.store.userSockets.get(uname);
      if (!socketIds) continue;

      const roundState = this.createRoundSnapshotForUser(room, uname);
      for (const socketId of socketIds) {
        this.server.to(socketId).emit("room.joined", {
          roomState: publicRoomState,
          currentRpsRound: roundState,
        });
        this.server.to(socketId).emit("room.updated", {
          roomState: publicRoomState,
          currentRpsRound: roundState,
        });
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

      const roundState = this.createRoundSnapshotForUser(room, member.username);

      for (const socketId of socketIds) {
        this.server.to(socketId).emit("room.updated", {
          roomState: publicRoomState,
          currentRpsRound: roundState,
        });
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

  private startNextRpsRound(room: RoomStateInternal, roundNumber: number): void {
    if (room.selectedGame !== "rps" || room.status !== "in_game") {
      return;
    }

    this.clearRoomGameTimer(room.roomId);

    const activePlayers = room.members
      .filter((member) => !member.isEliminated)
      .map((member) => member.username);

    if (activePlayers.length === 1) {
      this.finishRpsGame(room, activePlayers[0]);
      return;
    }

    const submittedMoves: Record<string, RpsMove> = {};
    for (const username of activePlayers) {
      submittedMoves[username] = this.getRandomRpsMove();
    }

    room.currentRound = {
      roundNumber,
      activePlayers,
      deadlineAt: new Date(Date.now() + RPS_ROUND_DURATION_MS).toISOString(),
      submittedMoves,
    };

    this.logger.log(
      `RPS round ${roundNumber} started in room ${room.roomId} for ${activePlayers.join(", ")} until ${room.currentRound.deadlineAt}`,
    );

    this.store.rooms.set(room.roomId, room);
    this.emitRoomUpdated(room);
    this.emitRpsRoundStarted(room);
    this.scheduleRpsRoundResolution(room.roomId, roundNumber);
  }

  private emitRpsRoundStarted(room: RoomStateInternal): void {
    const round = room.currentRound;
    if (!round) {
      return;
    }

    for (const username of round.activePlayers) {
      const socketIds = this.store.userSockets.get(username);
      if (!socketIds) continue;

      for (const socketId of socketIds) {
        this.server.to(socketId).emit("rps.round.started", {
          roomId: room.roomId,
          roundNumber: round.roundNumber,
          activePlayers: round.activePlayers,
          deadlineAt: round.deadlineAt,
          yourInitialMove: round.submittedMoves[username],
        });
      }
    }
  }

  private scheduleRpsRoundResolution(roomId: string, roundNumber: number): void {
    const timer = setTimeout(() => {
      this.lockAndResolveRpsRound(roomId, roundNumber);
    }, RPS_ROUND_DURATION_MS);

    this.store.roomGameTimers.set(roomId, timer);
  }

  private lockAndResolveRpsRound(roomId: string, roundNumber: number): void {
    this.clearRoomGameTimer(roomId);

    const room = this.store.rooms.get(roomId);
    if (!room || room.selectedGame !== "rps" || room.status !== "in_game" || !room.currentRound) {
      return;
    }

    if (room.currentRound.roundNumber !== roundNumber) {
      return;
    }

    const { activePlayers, submittedMoves } = room.currentRound;
    this.logger.log(`RPS round ${roundNumber} locked in room ${room.roomId}`);
    this.emitRpsRoundLocked(room, roundNumber);

    const outcome = this.resolveRpsOutcome(submittedMoves, activePlayers);
    if (!outcome.isTie) {
      room.members = room.members.map((member) => ({
        ...member,
        isEliminated: outcome.eliminatedUsernames.includes(member.username)
          ? true
          : member.isEliminated,
      }));
    }

    room.currentRound = null;
    this.store.rooms.set(room.roomId, room);
    this.emitRoomUpdated(room);
    this.emitRpsRoundResolved(
      room,
      roundNumber,
      outcome.eliminatedUsernames,
      outcome.survivors,
      outcome.isTie,
    );

    this.logger.log(
      `RPS round ${roundNumber} resolved in room ${room.roomId}: ` +
      `${outcome.isTie ? "tie" : `eliminated ${outcome.eliminatedUsernames.join(", ") || "none"}`}, ` +
      `survivors ${outcome.survivors.join(", ")}`,
    );

    if (outcome.survivors.length === 1) {
      this.finishRpsGame(room, outcome.survivors[0]);
      return;
    }

    this.startNextRpsRound(room, roundNumber + 1);
  }

  private emitRpsRoundLocked(room: RoomStateInternal, roundNumber: number): void {
    for (const member of room.members) {
      const socketIds = this.store.userSockets.get(member.username);
      if (!socketIds) continue;

      for (const socketId of socketIds) {
        this.server.to(socketId).emit("rps.round.locked", {
          roomId: room.roomId,
          roundNumber,
        });
      }
    }
  }

  private emitRpsRoundResolved(
    room: RoomStateInternal,
    roundNumber: number,
    eliminatedUsernames: string[],
    survivors: string[],
    isTie: boolean,
  ): void {
    for (const member of room.members) {
      const socketIds = this.store.userSockets.get(member.username);
      if (!socketIds) continue;

      for (const socketId of socketIds) {
        this.server.to(socketId).emit("rps.round.resolved", {
          roomId: room.roomId,
          roundNumber,
          eliminatedUsernames,
          survivors,
          isTie,
        });
      }
    }
  }

  private resolveRpsOutcome(submittedMoves: Record<string, RpsMove>, activePlayers: string[]): {
    eliminatedUsernames: string[];
    survivors: string[];
    isTie: boolean;
  } {
    const activeMoves = activePlayers.map((username) => submittedMoves[username]);
    const uniqueMoves = new Set(activeMoves);
    if (uniqueMoves.size <= 1 || uniqueMoves.size === 3) {
      return {
        eliminatedUsernames: [],
        survivors: activePlayers,
        isTie: true,
      };
    }

    const [firstMove, secondMove] = Array.from(uniqueMoves);
    const beats: Record<RpsMove, RpsMove> = {
      rock: "scissors",
      paper: "rock",
      scissors: "paper",
    };
    const losingMove = beats[firstMove] === secondMove ? secondMove : firstMove;
    const eliminatedUsernames = activePlayers.filter((username) => submittedMoves[username] === losingMove);
    const survivors = activePlayers.filter((username) => submittedMoves[username] !== losingMove);

    return {
      eliminatedUsernames,
      survivors,
      isTie: false,
    };
  }

  private finishRpsGame(room: RoomStateInternal, winnerUsername: string): void {
    this.clearRoomGameTimer(room.roomId);
    room.status = "finished";
    room.currentRound = null;
    this.store.rooms.set(room.roomId, room);
    this.logger.log(`RPS game finished in room ${room.roomId}. Winner: ${winnerUsername}`);
    this.emitGameFinished(room, winnerUsername);
    this.resetRoomAfterGame(room);
  }

  private emitGameFinished(room: RoomStateInternal, winnerUsername: string): void {
    const winningDishId = room.dishChoicesByUsername[winnerUsername];
    const winningDishName = room.dishChoiceNamesByUsername[winnerUsername] ?? `Dish ${winningDishId}`;
    if (!Number.isFinite(winningDishId)) {
      this.logger.warn(`Missing winning dish for ${winnerUsername} in room ${room.roomId}`);
      return;
    }

    for (const member of room.members) {
      const socketIds = this.store.userSockets.get(member.username);
      if (!socketIds) continue;

      for (const socketId of socketIds) {
        this.server.to(socketId).emit("game.finished", {
          roomId: room.roomId,
          winnerUsername,
          winningDishId,
          winningDishName,
        });
      }
    }
  }

  private resetRoomAfterGame(room: RoomStateInternal): void {
    room.status = "lobby";
    room.selectedGame = null;
    room.currentRound = null;
    room.members = room.members.map((member) => ({
      ...member,
      isEliminated: false,
    }));

    this.store.rooms.set(room.roomId, room);
    this.emitRoomUpdated(room);
  }

  private clearRoomGameTimer(roomId: string): void {
    const timer = this.store.roomGameTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.store.roomGameTimers.delete(roomId);
    }
  }

  private getRandomRpsMove(): RpsMove {
    return RPS_MOVES[Math.floor(Math.random() * RPS_MOVES.length)];
  }

  private isRpsMove(value: unknown): value is RpsMove {
    return value === "rock" || value === "paper" || value === "scissors";
  }

  private createRoundSnapshotForUser(room: RoomStateInternal, username: string) {
    const round = room.currentRound;
    if (!round) {
      return null;
    }

    const yourInitialMove = round.submittedMoves[username];
    if (!yourInitialMove) {
      return null;
    }

    return {
      roomId: room.roomId,
      roundNumber: round.roundNumber,
      activePlayers: round.activePlayers,
      deadlineAt: round.deadlineAt,
      yourInitialMove,
      isLocked: Date.now() >= new Date(round.deadlineAt).getTime(),
    };
  }
}
