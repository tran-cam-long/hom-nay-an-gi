import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

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
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(MultiplayerGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket): void {
    const username =
      typeof client.handshake.auth?.username === 'string'
        ? client.handshake.auth.username
        : 'unknown';

    this.logger.log(`Socket connected: ${client.id} (${username})`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Socket disconnected: ${client.id}`);
  }
}
