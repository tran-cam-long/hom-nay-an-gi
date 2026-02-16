import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MultiplayerStore } from './services/multiplayer.store';

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
    if (username === null || username === "") {
      this.handleDisconnect(client);
      return;
    }

    this.store.socketUser.set(client.id, username);

    this.logger.log(`Socket connected: ${client.id} (${username})`);
  }

  handleDisconnect(client: Socket): void {
    this.store.socketUser.delete(client.id);

    this.logger.log(`Socket disconnected: ${client.id}`);
  }

  private getUsernameFromHandshake(client: Socket): string | null {
    const value = client.handshake.auth?.username;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
}
