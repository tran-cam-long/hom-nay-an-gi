import { createContext } from "react";
import type { MultiplayerConnectionStatus, MultiplayerError, MultiplayerNotification, RoomState } from "../types/multiplayer"


export type MultiplayerContextValue = {
    connectionStatus: MultiplayerConnectionStatus;
    notifications: MultiplayerNotification[];
    activeRoom: RoomState | null;
    lastError: MultiplayerError | null;
    sendInvite: (toUsername: string) => void;
    acceptInvite: (inviteId: string) => void;
    markAllNotificationsRead: () => void;
}

export const MultiplayerContext = createContext<MultiplayerContextValue | null>(null);