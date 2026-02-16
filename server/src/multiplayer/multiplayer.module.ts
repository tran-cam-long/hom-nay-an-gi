import { Module } from '@nestjs/common';
import { MultiplayerGateway } from './multiplayer.gateway';

@Module({
  providers: [MultiplayerGateway],
})
export class MultiplayerModule {}
