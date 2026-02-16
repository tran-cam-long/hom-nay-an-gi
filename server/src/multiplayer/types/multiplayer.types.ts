export type InviteStatus = "pending" | "accepted" | "expired" | "declined";

export type Invite = {
    inivetId: string;
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