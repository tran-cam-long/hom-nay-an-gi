export type InviteStatus = "pending" | "accepted" | "expired" | "declined";
export type RpsMove = "rock" | "paper" | "scissors";

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

export type RpsRoundState = {
    roundNumber: number;
    activePlayers: string[];
    deadlineAt: string;
    submittedMoves: Record<string, RpsMove>;
}

export type RoomStateInternal = RoomState & {
    dishChoicesByUsername: Record<string, number>;
    dishChoiceNamesByUsername: Record<string, string>;
    currentRound: RpsRoundState | null;
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
