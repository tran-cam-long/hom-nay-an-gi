import { io, type Socket } from "socket.io-client";
import { WS_URL } from "../config";

type MultiplayerSocketAuth = {
  accessToken: string;
  username: string;
};

export function createMultiplayerSocket(auth: MultiplayerSocketAuth): Socket {
  return io(WS_URL, {
    autoConnect: true,
    withCredentials: true,
    path: "/socket.io",
    auth: {
      token: auth.accessToken,
      username: auth.username,
    },
  });
}
