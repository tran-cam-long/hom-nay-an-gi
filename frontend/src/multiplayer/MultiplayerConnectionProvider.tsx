import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Socket } from "socket.io-client";
import { createMultiplayerSocket } from "./socket";
import { MultiplayerError, RoomState, type MultiplayerConnectionStatus, type MultiplayerNotification } from "../types/multiplayer";
import { MultiplayerContext } from "./MultiplayerContext";

type MultiplayerConnectionProviderProps = {
  accessToken?: string;
  username?: string;
  children: ReactNode;
};

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

  const sendInvite = (_toUsername: string) => {
    setLastError({
      code: "NOT_IMPLEMENTED",
      message: "sendInvite is not implemeted yet",
      receivedAt: new Date().toISOString(),
    })
  };

  const acceptInvite = (_inviteId: string) => {
    setLastError({
      code: "NOT_IMPLEMENTED",
      message: "acceptInvite is not implemented yet",
      receivedAt: new Date().toISOString(),
    })
  };

  const markAllNotificationsRead = () => {
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
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
      socket.emit("room.sync");
    };

    socket.on("connect", handleConnect);

    return () => {
      socket.off("connect", handleConnect);
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
        sendInvite,
        acceptInvite,
        markAllNotificationsRead,
      }}
    >
      {children}
    </MultiplayerContext.Provider>
  )
}
