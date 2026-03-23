export type InviteStatus = "pending" | "accepted" | "expired" | "declined";

export type Invite = {
    inviteId: string;
    roomId: string;
    fromUsername: string;
    toUsername: string;
    status: InviteStatus;
    createdAt: string;
    expiresAt: string;
};

export type RoomMember = {
    username: string;
    isHost: boolean;
    hasChosenDish: boolean;
    isConnected: boolean;
    isEliminated: boolean;
};

export type RoomState = {
    roomId: string;
    members: RoomMember[];
    status: "lobby" | "in_game" | "finished";
    selectedGame: "rps" | null;
    hostUsername: string;
};

export type MultiplayerConnectionStatus = "idle" | "connecting" | "connected" | "disconnected";

export type MultiplayerNotification = {
    id: string;
    type: string;
    message: string;
    invite: Invite | null;
    receivedAt: string;
    isRead: boolean;
    isExpired: boolean;
};

export type MultiplayerError = {
    code: string;
    message: string;
    receivedAt: string;
};
