import { useState } from "react";
import './RoomPancel.css';
import type { RoomState } from "../types/multiplayer";


interface RoomPanelProps {
    room: RoomState;
    currentUsername: string | null;
    isHost: boolean;
    isStartDisabled: boolean;
    startDisabledReason: string | null;
    onStart: () => void;
    onLeave: () => void;
}

export default function RoomPanel({
    room,
    currentUsername,
    isHost,
    isStartDisabled,
    startDisabledReason,
    onStart,
    onLeave
}: RoomPanelProps) {
    const [showStartTooltip, setShowStartTooltip] = useState(false);

    return (
        <div className="room-panel">
            <div className="room-panel-header">
                <div className="room-info">
                    <h3>Room</h3>
                    <p className="room-id">Multiplayer game room ID: {room.roomId}</p>
                    {room.selectedGame && (
                        <p className="room-selected-game">Selected game: {room.selectedGame.toUpperCase()}</p>
                    )}
                </div>
                <button
                    type="button"
                    className="leave-btn"
                    onClick={onLeave}
                >
                    Leave
                </button>
            </div>

            <div className="members-section">
                <h4>Players ({room.members.length})</h4>
                <ul className="members-list">
                    {room.members.map((member) => (
                        <li key={member.username} className="member-item">
                            <span className="member-name">
                                {member.username}
                                {member.isHost && <span className="host-badge">Host</span>}
                                {member.username === currentUsername && <span className="you-badge">You</span>}
                            </span>
                            <span className={`ready-status ${member.hasChosenDish ? "ready" : "not-ready"}`}>
                                {member.hasChosenDish ? "Ready" : "Choosing..."}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>

            {isHost && (
                <div className="host-actions">
                    <div
                        className="start-button-wrapper"
                        onMouseEnter={() => setShowStartTooltip(true)}
                        onMouseLeave={() => setShowStartTooltip(false)}
                    >
                        <button
                            type="button"
                            className="start-btn"
                            onClick={onStart}
                            disabled={isStartDisabled}
                            title={startDisabledReason || "Start the game"}
                        >
                            Start Game
                        </button>
                        {showStartTooltip && isStartDisabled && startDisabledReason && (
                            <div className="start-tooltip">{startDisabledReason}</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
