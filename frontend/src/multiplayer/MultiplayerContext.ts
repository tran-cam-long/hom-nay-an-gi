import { createContext } from "react";
import type {
    GameFinishedEvent,
    MultiplayerConnectionStatus,
    MultiplayerError,
    MultiplayerGameKey,
    MultiplayerNotification,
    RoomState,
    RpsMove,
    RpsRoundResolvedEvent,
    RpsRoundStartedEvent,
} from "../types/multiplayer"


export type MultiplayerContextValue = {
    connectionStatus: MultiplayerConnectionStatus;
    notifications: MultiplayerNotification[];
    activeRoom: RoomState | null;
    currentRpsRound: RpsRoundStartedEvent | null;
    lastRpsResolution: RpsRoundResolvedEvent | null;
    lastGameResult: GameFinishedEvent | null;
    lastError: MultiplayerError | null;
    username?: string;
    sendInvite: (toUsername: string) => void;
    acceptInvite: (inviteId: string) => boolean;
    markAllNotificationsRead: () => void;
    leaveRoom: () => void;
    startGame: (game: MultiplayerGameKey) => boolean;
    updateRpsMove: (move: RpsMove) => boolean;
    setRoomDishChoice: (dishId: number, dishName: string) => boolean;
}

export const MultiplayerContext = createContext<MultiplayerContextValue | null>(null);
