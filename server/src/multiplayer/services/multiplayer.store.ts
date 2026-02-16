import { Injectable } from "@nestjs/common";
import { Invite, RoomState } from "../types/multiplayer.types";

@Injectable()
export class MultiplayerStore {
    readonly userSockers = new Map<string, Set<string>>();

    readonly socketUser = new Map<string, string>();

    readonly invites = new Map<string, Invite>();

    readonly inviteTimers = new Map<string, NodeJS.Timeout>();

    readonly rooms = new Map<string, RoomState>();

    readonly userToRoom = new Map<string, string>();
}