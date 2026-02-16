import { Module } from '@nestjs/common';
import { MultiplayerGateway } from './multiplayer.gateway';
import { MultiplayerStore } from './services/multiplayer.store';

@Module({
  providers: [MultiplayerGateway, MultiplayerStore],
  exports: [MultiplayerStore],
})
export class MultiplayerModule { }
