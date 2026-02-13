import { barStyle } from "./style";

interface Props {
    username?: string;
    onLoginClick: () => void;
}

export default function TopBar({ username, onLoginClick }: Props) {
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
          </div>
                )}
            </div>
        </div>
    )
}