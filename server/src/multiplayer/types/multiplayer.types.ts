export type InviteStatus = "pending" | "accepted" | "expired" | "declined";

export type Invite = {
    inviteId: string;
    roomId: string;
    fromUsername: string;
    toUsername: string;
    status: InviteStatus;
    createdAt: string;
    expiresAt: string;
}

export type RoomMember = {
    username: string;
    isHost: boolean;
    hasChosenDish: boolean;
    isConnected: boolean;
    isEliminated: boolean;
}

export type RoomState = {
    roomId: string,
    members: RoomMember[];
    status: "lobby" | "in_game" | "finished";
    selectedGame: "rps" | null;
    hostUsername: string;
}

export type RoomStateInternal = RoomState & {
    dishChoicesByUsername: Record<string, number>;
}

export function toPublicRoomState(room: RoomStateInternal): RoomState {
    return {
        roomId: room.roomId,
        members: room.members,
        status: room.status,
        selectedGame: room.selectedGame,
        hostUsername: room.hostUsername,
    }
}
