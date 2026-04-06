import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Socket } from "socket.io-client";
import { createMultiplayerSocket } from "./socket";
import type { MultiplayerError, RoomState, MultiplayerConnectionStatus, MultiplayerNotification } from "../types/multiplayer";
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

  const startGame = useCallback((game: string) => {
    const socket = socketRef.current;
    if (!socket || !activeRoom) return;
    socket.emit("game.start", { roomId: activeRoom.roomId, game });
  }, [activeRoom]);

  const setRoomDishChoice = (dishId: number) => {
    const socket = socketRef.current;

    if (!activeRoom) {
      setLastError(createLocalError("ROOM_NOT_FOUND", "You are not currently in a room."));
      return false;
    }

    if (!Number.isFinite(dishId)) {
      setLastError(createLocalError("INVALID_INPUT", "Dish ID is invalid."));
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
      setLastError(null);

      return;
    }

    setConnectionStatus("connecting");

    const socket = createMultiplayerSocket({ accessToken, username });
    socketRef.current = socket;

    const handleConnect = () => {
      setConnectionStatus("connected");
      setLastError(null);
      socket.emit("room.sync");
    };

    const handleDisconnect = () => {
      setConnectionStatus("disconnected");
    };

    const handleConnectionError = (payload: unknown) => {
      setConnectionStatus("disconnected");
      setLastError(normalizeSocketError(payload));
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

      if (roomState) {
        setActiveRoom(roomState);
      }
    };

    const handleRoomUpdated = (payload: unknown) => {
      const data = payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
      const roomState = data.roomState && typeof data.roomState === "object"
        ? (data.roomState as RoomState)
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
    };

    const handleSocketError = (payload: unknown) => {
      setLastError(normalizeSocketError(payload));
    }

    const handleRoomLeft = () => {
      setActiveRoom(null);
    }

    if (!socket) return;

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectionError);
    socket.on("notification.new", handleNotificationNew);
    socket.on("invite.expired", handleInviteExpired);
    socket.on("room.joined", handleRoomJoined);
    socket.on("room.updated", handleRoomUpdated);
    socket.on("room.left", handleRoomLeft);
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
        lastError,
        username,
        sendInvite,
        acceptInvite,
        markAllNotificationsRead,
        leaveRoom,
        startGame,
        setRoomDishChoice
      }}
    >
      {children}
    </MultiplayerContext.Provider>
  )
}
