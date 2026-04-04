import { createContext } from "react";
import type { MultiplayerConnectionStatus, MultiplayerError, MultiplayerNotification, RoomState } from "../types/multiplayer"


export type MultiplayerContextValue = {
    connectionStatus: MultiplayerConnectionStatus;
    notifications: MultiplayerNotification[];
    activeRoom: RoomState | null;
    lastError: MultiplayerError | null;
    username?: string;
    sendInvite: (toUsername: string) => void;
    acceptInvite: (inviteId: string) => boolean;
    markAllNotificationsRead: () => void;
    leaveRoom: () => void;
    startGame: (game: string) => void;
    setRoomDishChoice: (dishId: number) => boolean;
}

export const MultiplayerContext = createContext<MultiplayerContextValue | null>(null);