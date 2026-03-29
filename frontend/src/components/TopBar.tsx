import { LuBell, LuLogOut } from "react-icons/lu";
import { barStyle } from "./style";
import useMultiplayer from "../multiplayer/useMultiplayer";
import { useEffect, useRef, useState } from "react";

interface Props {
  username?: string;
  onLoginClick: () => void;
  onLogoutClick: () => void;
  onOpenHomnayangi: () => void;
}

function getInviteTimeLeftLabel(expiresAt: string, nowMs: number): string {
  const remainingMs = new Date(expiresAt).getTime() - nowMs;

  if (remainingMs <= 0) {
    return "Expired";
  }

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  return `${remainingSeconds}s left`;
}

function isJoinDisabled(
  isExpired: boolean,
  inviteId: string,
  pendingInviteId: string | null,
): boolean {
  return isExpired || pendingInviteId === inviteId;
}

export default function TopBar({ username, onLoginClick, onLogoutClick }: Props) {
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [pendingInviteId, setPendingInviteId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const {
    connectionStatus,
    notifications,
    activeRoom,
    acceptInvite,
    markAllNotificationsRead,
  } = useMultiplayer();
  const unreadCount = notifications.filter((item) => !item.isRead).length;

  useEffect(() => {
    if (!isNotificationOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setIsNotificationOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isNotificationOpen]);

  useEffect(() => {
    if (activeRoom && pendingInviteId) {
      setPendingInviteId(null);
    }
  }, [activeRoom, pendingInviteId]);

  return (
    <div style={barStyle}>
      <div style={{ fontWeight: 600 }}>Conmeo Vien Ultility App</div>

      <div>
        {!username ? (
          <button onClick={onLoginClick}>Login</button>
        ) : (

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img
              src="https://i.pravatar.cc/32"
              alt="avatar"
              style={{ borderRadius: "50%" }}
            />
            <span>{username}</span>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{connectionStatus}</span>
            <div ref={dropdownRef} style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => setIsNotificationOpen((prev) => !prev)}
                aria-label="Notifications" aria-expanded={isNotificationOpen}
                style={{
                  position: "relative",
                  border: 0, background: "transparent",
                  padding: 6, cursor: "pointer",
                  lineHeight: 1,
                  fontSize: 18
                }}>
                <LuBell />
                {unreadCount > 0 && (
                  <span style={{
                    position: "absolute",
                    top: 2, right: 2,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#d92d20"
                  }}>
                  </span>
                )}

              </button>
              {isNotificationOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    width: 320,
                    maxWidth: "min(320px, calc(100vw - 24px))",
                    background: "#fff",
                    border: "1px solid #ddd",
                    borderRadius: 12,
                    boxShadow: "0 12px 28px rgba(0, 0, 0, 0.12)",
                    padding: 12,
                    zIndex: 1100,
                  }}>
                  {notifications.length === 0 ? (
                    <div style={{ fontSize: 14, color: "#666" }}>
                      No notification yet.
                    </div>
                  ) : (
                    <span>Conmeo</span>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={onLogoutClick}
              aria-label="Logout"
              title="Logout"
              style={{
                border: 0,
                padding: "4px 6px",
                background: "transparent",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              <LuLogOut />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
