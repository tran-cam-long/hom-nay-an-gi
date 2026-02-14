import { LuLogOut } from "react-icons/lu";
import { barStyle } from "./style";

interface Props {
  username?: string;
  onLoginClick: () => void;
  onLogoutClick: () => void;
}

export default function TopBar({ username, onLoginClick, onLogoutClick }: Props) {
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
