import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Socket } from "socket.io-client";
import { createMultiplayerSocket } from "./socket";
import { MULTIPLAYER_DEBUG, WS_URL } from "../config";
import type {
  GameFinishedEvent,
  GameStartedEvent,
  MultiplayerConnectionStatus,
  MultiplayerError,
  MultiplayerGameKey,
  MultiplayerNotification,
  RoomState,
  RpsMove,
  RpsRoundLockedEvent,
  RpsRoundResolvedEvent,
  RpsRoundStartedEvent,
} from "../types/multiplayer";
import { MultiplayerContext } from "./MultiplayerContext";

type MultiplayerConnectionProviderProps = {
  accessToken?: string;
  username?: string;
  children: ReactNode;
};

function isSocketReady(socket: Socket | null): socket is Socket {
  return Boolean(socket && socket.connected);
}

function createLocalError(code: string, message: string): MultiplayerError {
  return {
    code,
    message,
    receivedAt: new Date().toISOString(),
  }
}

function normalizeSocketError(payload: unknown): MultiplayerError {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const data = payload as Record<string, unknown>;

    return {
      code:
        typeof data.code === "string" && data.code.trim()
          ? data.code
          : "SOCKET_ERROR",
      message:
        typeof data.message === "string" && data.message.trim()
          ? data.message
          : "Unknown socket error",
      receivedAt: new Date().toISOString(),
    }
  }

  return createLocalError("SOCKET_ERROR", "Unknown socket error");
}

function createNotificationFromPayload(payload: unknown): MultiplayerNotification {
  const data = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};

  const invite = data.invite && typeof data.invite === "object" && !Array.isArray(data.invite)
    ? (data.invite as MultiplayerNotification["invite"])
    : null;

  return {
    id: crypto.randomUUID(),
    type: typeof data.type === "string" ? data.type : "unknown",
    message:
      typeof data.message === "string"
        ? data.message
        : "You have a new notification.",
    invite,
    receivedAt: new Date().toISOString(),
    isRead: false,
    isExpired: false
  };
}

export default function MultiplayerConnectionProvider({
  accessToken,
  username,
  children,
}: MultiplayerConnectionProviderProps) {
  const socketRef = useRef<Socket | null>(null);

  const [connectionStatus, setConnectionStatus] =
    useState<MultiplayerConnectionStatus>("idle");
  const [notifications, setNotifications] = useState<MultiplayerNotification[]>([]);
  const [activeRoom, setActiveRoom] = useState<RoomState | null>(null);
  const [currentRpsRound, setCurrentRpsRound] = useState<RpsRoundStartedEvent | null>(null);
  const [lastRpsResolution, setLastRpsResolution] = useState<RpsRoundResolvedEvent | null>(null);
  const [lastGameResult, setLastGameResult] = useState<GameFinishedEvent | null>(null);
  const [lastError, setLastError] = useState<MultiplayerError | null>(null);

  const sendInvite = (toUsername: string) => {
    const socket = socketRef.current;
    const trimmedUsername = toUsername.trim();

    if (!trimmedUsername) {
      setLastError(createLocalError("INVALID_INPUT", "Username is required."));
      return;
    }

    if (!isSocketReady(socket)) {
      setLastError(
        createLocalError(
          "SOCKET_NOT_READY",
          "You are not connected to multiplayer."
        ),
      );
      return;
    }

    socket.emit("invite.send", { toUsername: trimmedUsername });
  };

  const acceptInvite = (inviteId: string) => {
    const socket = socketRef.current;
    const trimmedInviteId = inviteId.trim();

    if (!trimmedInviteId) {
      setLastError(createLocalError("INVALID_INPUT", "Invite ID is required."));
      return false;
    }

    if (!isSocketReady(socket)) {
      setLastError(
        createLocalError(
          "SOCKET_NOT_READY",
          "You are not connected to multiplayer."
        ),
      );

      return false;
    }

    setLastError(null);
    socket.emit("invite.accept", { inviteId: trimmedInviteId });
    return true;
  };

  const markAllNotificationsRead = () => {
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
  };

  const leaveRoom = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !activeRoom) return;
    socket.emit("room.leave", { roomId: activeRoom.roomId });
  }, [activeRoom]);

  const startGame = useCallback((game: MultiplayerGameKey) => {
    const socket = socketRef.current;

    if (!activeRoom) {
      setLastError(createLocalError("ROOM_NOT_FOUND", "You are not currently in a room."));
      return false;
    }

    if (!isSocketReady(socket)) {
      setLastError(
        createLocalError(
          "SOCKET_NOT_READY",
          "You are not connected to multiplayer."
        ),
      );
      return false;
    }

    setLastError(null);
    socket.emit("game.start", {
      roomId: activeRoom.roomId,
      game
    });

    return true;
  }, [activeRoom]);

  const updateRpsMove = useCallback((move: RpsMove) => {
    const socket = socketRef.current;

    if (!activeRoom) {
      setLastError(createLocalError("ROOM_NOT_FOUND", "You are not currently in a room."));
      return false;
    }

    if (!currentRpsRound) {
      setLastError(createLocalError("ROUND_NOT_FOUND", "There is no active RPS round."));
      return false;
    }

    if (currentRpsRound.isLocked) {
      setLastError(createLocalError("ROUND_LOCKED", "This round is already locked."));
      return false;
    }

    if (!isSocketReady(socket)) {
      setLastError(
        createLocalError(
          "SOCKET_NOT_READY",
          "You are not connected to multiplayer."
        ),
      );
      return false;
    }

    setLastError(null);
    socket.emit("rps.move.update", {
      roomId: activeRoom.roomId,
      move,
    });
    setCurrentRpsRound((current) => current ? { ...current, yourInitialMove: move } : current);
    return true;
  }, [activeRoom, currentRpsRound]);

  const setRoomDishChoice = (dishId: number, dishName: string) => {
    const socket = socketRef.current;

    if (!activeRoom) {
      setLastError(createLocalError("ROOM_NOT_FOUND", "You are not currently in a room."));
      return false;
    }

    if (!Number.isFinite(dishId)) {
      setLastError(createLocalError("INVALID_INPUT", "Dish ID is invalid."));
      return false;
    }

    if (!dishName.trim()) {
      setLastError(createLocalError("INVALID_INPUT", "Dish name is required."));
      return false;
    }

    if (!isSocketReady(socket)) {
      setLastError(
        createLocalError(
          "SOCKET_NOT_READY",
          "You are not connected to multiplayer."
        ),
      );
      return false;
    }

    setLastError(null);
    socket.emit("room.setDishChoice", {
      roomId: activeRoom.roomId,
      dishId,
      dishName: dishName.trim(),
    });
    return true;
  };

  useEffect(() => {
    if (!accessToken || !username) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      setConnectionStatus("idle");
      setNotifications([]);
      setActiveRoom(null);
      setCurrentRpsRound(null);
      setLastRpsResolution(null);
      setLastGameResult(null);
      setLastError(null);

      return;
    }

    setConnectionStatus("connecting");

    const socket = createMultiplayerSocket({ accessToken, username });
    socketRef.current = socket;

    if (MULTIPLAYER_DEBUG) {
      console.log("[multiplayer] creating socket", {
        pageOrigin: typeof window !== "undefined" ? window.location.origin : "unknown",
        wsUrl: WS_URL,
        socketPath: socket.io.opts.path,
        username,
      });
    }

    const handleConnect = () => {
      setConnectionStatus("connected");
      setLastError(null);
      setCurrentRpsRound(null);
      if (MULTIPLAYER_DEBUG) {
        console.log("[multiplayer] connected", {
          socketId: socket.id,
          transport: socket.io.engine?.transport?.name,
        });
      }
      socket.emit("room.sync");
    };

    const handleDisconnect = (reason: string) => {
      setConnectionStatus("disconnected");
      if (MULTIPLAYER_DEBUG) {
        console.log("[multiplayer] disconnected", {
          reason,
          active: socket.active,
          connected: socket.connected,
        });
      }
    };

    const handleConnectionError = (payload: unknown) => {
      setConnectionStatus("disconnected");
      setLastError(normalizeSocketError(payload));
      if (MULTIPLAYER_DEBUG) {
        console.log("[multiplayer] connect_error", payload);
      }
    };

    const handleNotificationNew = (payload: unknown) => {
      const notification = createNotificationFromPayload(payload);
      setNotifications((current) => [notification, ...current]);
    }

    const handleInviteExpired = (payload: unknown) => {
      const data = payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
      const inviteId = typeof data.inviteId === "string" ? data.inviteId : null;

      if (!inviteId) {
        return;
      }

      setNotifications((current) =>
        current.map((item) => item.invite?.inviteId === inviteId
          ? { ...item, isExpired: true } : item,))
    };

    const handleRoomJoined = (payload: unknown) => {
      const data = payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
      const roomState = data.roomState && typeof data.roomState === "object"
        ? (data.roomState as RoomState)
        : null;
      const roundState = data.currentRpsRound && typeof data.currentRpsRound === "object"
        ? (data.currentRpsRound as RpsRoundStartedEvent)
        : null;

      if (roomState) {
        setActiveRoom(roomState);
        setCurrentRpsRound(roundState);
        setLastGameResult((current) =>
          current && current.roomId === roomState.roomId ? current : null,
        );
      }
    };

    const handleRoomUpdated = (payload: unknown) => {
      const data = payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
      const roomState = data.roomState && typeof data.roomState === "object"
        ? (data.roomState as RoomState)
        : null;
      const roundState = data.currentRpsRound && typeof data.currentRpsRound === "object"
        ? (data.currentRpsRound as RpsRoundStartedEvent)
        : null;

      if (!roomState) {
        return;
      }

      const wasHost = activeRoom?.hostUsername === username;
      const isNowHost = roomState.hostUsername === username;
      if (!wasHost && isNowHost) {
        // We just became host
        console.log("You are now the host");
        // Could show toast here through a callback
      }

      setActiveRoom(roomState);
      setCurrentRpsRound(roundState);
    };

    const handleSocketError = (payload: unknown) => {
      setLastError(normalizeSocketError(payload));
    }

    const handleRoomLeft = () => {
      setActiveRoom(null);
      setCurrentRpsRound(null);
      setLastRpsResolution(null);
      setLastGameResult(null);
    }

    const handleGameStarted = (payload: unknown) => {
      const data = payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as GameStartedEvent)
        : null;

      if (!data) {
        return;
      }

      setActiveRoom((current) => {
        if (!current || current.roomId !== data.roomId) {
          return current;
        }

        return {
          ...current,
          status: "in_game",
          selectedGame: data.game
        }
      });
      setCurrentRpsRound(null);
      setLastRpsResolution(null);
      setLastGameResult(null);
    }

    const handleRpsRoundStarted = (payload: unknown) => {
      const data = payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Omit<RpsRoundStartedEvent, "isLocked">)
        : null;

      if (!data) {
        return;
      }

      setLastError(null);
      setLastRpsResolution(null);
      setLastGameResult(null);
      setCurrentRpsRound({
        ...data,
        isLocked: false,
      });
    };

    const handleRpsRoundLocked = (payload: unknown) => {
      const data = payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as RpsRoundLockedEvent)
        : null;

      if (!data) {
        return;
      }

      setCurrentRpsRound((current) => {
        if (!current || current.roomId !== data.roomId || current.roundNumber !== data.roundNumber) {
          return current;
        }

        return {
          ...current,
          isLocked: true,
        };
      });
    };

    const handleRpsRoundResolved = (payload: unknown) => {
      const data = payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as RpsRoundResolvedEvent)
        : null;

      if (!data) {
        return;
      }

      setLastRpsResolution(data);
      setCurrentRpsRound((current) => {
        if (!current || current.roomId !== data.roomId || current.roundNumber !== data.roundNumber) {
          return current;
        }

        return {
          ...current,
          isLocked: true,
        };
      });
    };

    const handleGameFinished = (payload: unknown) => {
      const data = payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as GameFinishedEvent)
        : null;

      if (!data) {
        return;
      }

      setCurrentRpsRound(null);
      setLastRpsResolution(null);
      setLastGameResult(data);
    };

    if (!socket) return;

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectionError);
    socket.on("notification.new", handleNotificationNew);
    socket.on("invite.expired", handleInviteExpired);
    socket.on("room.joined", handleRoomJoined);
    socket.on("room.updated", handleRoomUpdated);
    socket.on("room.left", handleRoomLeft);
    socket.on("game.started", handleGameStarted);
    socket.on("rps.round.started", handleRpsRoundStarted);
    socket.on("rps.round.locked", handleRpsRoundLocked);
    socket.on("rps.round.resolved", handleRpsRoundResolved);
    socket.on("game.finished", handleGameFinished);
    socket.on("error", handleSocketError);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectionError);
      socket.off("notification.new", handleNotificationNew);
      socket.off("invite.expired", handleInviteExpired);
      socket.off("room.joined", handleRoomJoined);
      socket.off("room.updated", handleRoomUpdated);
      socket.off("room.left", handleRoomLeft);
      socket.off("game.started", handleGameStarted);
      socket.off("rps.round.started", handleRpsRoundStarted);
      socket.off("rps.round.locked", handleRpsRoundLocked);
      socket.off("rps.round.resolved", handleRpsRoundResolved);
      socket.off("game.finished", handleGameFinished);
      socket.off("error", handleSocketError);
      socket.disconnect();

      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [accessToken, username]);

  return (
    <MultiplayerContext.Provider
      value={{
        connectionStatus,
        notifications,
        activeRoom,
        currentRpsRound,
        lastRpsResolution,
        lastGameResult,
        lastError,
        username,
        sendInvite,
        acceptInvite,
        markAllNotificationsRead,
        leaveRoom,
        startGame,
        updateRpsMove,
        setRoomDishChoice
      }}
    >
      {children}
    </MultiplayerContext.Provider>
  )
}
