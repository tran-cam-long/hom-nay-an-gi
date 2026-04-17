import { useEffect, useState } from "react";
import type {
  GameFinishedEvent,
  RoomState,
  RpsMove,
  RpsRoundResolvedEvent,
  RpsRoundStartedEvent,
} from "../types/multiplayer";
import "./RpsGamePanel.css";

type RpsGamePanelProps = {
  room: RoomState;
  currentUsername: string | null;
  currentRound: RpsRoundStartedEvent | null;
  lastResolution: RpsRoundResolvedEvent | null;
  lastGameResult: GameFinishedEvent | null;
  onMoveSelect: (move: RpsMove) => void;
};

const MOVE_OPTIONS: Array<{
  move: RpsMove;
  label: string;
  icon: string;
  detail: string;
}> = [
  { move: "rock", label: "Rock", icon: "✊", detail: "Crushes scissors" },
  { move: "paper", label: "Paper", icon: "✋", detail: "Wraps rock" },
  { move: "scissors", label: "Scissors", icon: "✌", detail: "Cuts paper" },
];

function formatCountdownLabel(remainingMs: number, isLocked: boolean): string {
  if (isLocked) {
    return "Locked";
  }

  if (remainingMs <= 0) {
    return "Resolving...";
  }

  return `${Math.ceil(remainingMs / 1000)}s left`;
}

export default function RpsGamePanel({
  room,
  currentUsername,
  currentRound,
  lastResolution,
  lastGameResult,
  onMoveSelect,
}: RpsGamePanelProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!currentRound || currentRound.isLocked) {
      return;
    }

    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);

    return () => {
      window.clearInterval(timer);
    };
  }, [currentRound]);

  if (
    room.selectedGame !== "rps" &&
    room.status !== "in_game" &&
    (!lastGameResult || lastGameResult.roomId !== room.roomId)
  ) {
    return null;
  }

  const currentMember = room.members.find((member) => member.username === currentUsername) ?? null;
  const isEliminated = Boolean(currentMember?.isEliminated);
  const isActivePlayer = Boolean(
    currentRound &&
    currentUsername &&
    currentRound.activePlayers.includes(currentUsername),
  );
  const remainingMs = currentRound
    ? Math.max(0, new Date(currentRound.deadlineAt).getTime() - nowMs)
    : 0;
  const resolutionForRoom = lastResolution?.roomId === room.roomId ? lastResolution : null;
  const gameResultForRoom = lastGameResult?.roomId === room.roomId ? lastGameResult : null;
  const youWereEliminated = Boolean(
    resolutionForRoom &&
    currentUsername &&
    resolutionForRoom.eliminatedUsernames.includes(currentUsername),
  );
  const youSurvivedRound = Boolean(
    resolutionForRoom &&
    currentUsername &&
    resolutionForRoom.survivors.includes(currentUsername),
  );

  return (
    <section className="rps-panel" aria-live="polite">
      <div className="rps-panel__header">
        <div>
          <p className="rps-panel__eyebrow">Mini game</p>
          <h3 className="rps-panel__title">Rock Paper Scissors</h3>
        </div>
        <span
          className={`rps-panel__status ${currentRound?.isLocked ? "rps-panel__status--locked" : "rps-panel__status--live"}`}
        >
          {currentRound ? formatCountdownLabel(remainingMs, currentRound.isLocked) : "Waiting"}
        </span>
      </div>

      {room.status === "in_game" ? (
        <>
          {currentRound ? (
            <>
              <div className="rps-panel__meta">
                <div className="rps-panel__meta-card">
                  <span className="rps-panel__meta-label">Round</span>
                  <strong>#{currentRound.roundNumber}</strong>
                </div>
                <div className="rps-panel__meta-card">
                  <span className="rps-panel__meta-label">Players still in</span>
                  <strong>{currentRound.activePlayers.length}</strong>
                </div>
              </div>

              <div className="rps-panel__players">
                {currentRound.activePlayers.map((player) => (
                  <span
                    key={player}
                    className={`rps-panel__player-chip ${player === currentUsername ? "rps-panel__player-chip--you" : ""}`}
                  >
                    {player === currentUsername ? `${player} (You)` : player}
                  </span>
                ))}
              </div>

              {isActivePlayer ? (
                <>
                  <div className="rps-panel__banner">
                    <div>
                      <strong>Your move:</strong> {currentRound.yourInitialMove}
                    </div>
                    <div className="rps-panel__banner-copy">
                      {currentRound.isLocked
                        ? "Moves are locked while the server resolves this round."
                        : "You can switch moves until the countdown ends."}
                    </div>
                  </div>

                  <div className="rps-panel__moves" role="group" aria-label="Choose your move">
                    {MOVE_OPTIONS.map((option) => {
                      const isSelected = currentRound.yourInitialMove === option.move;

                      return (
                        <button
                          key={option.move}
                          type="button"
                          className={`rps-move-button ${isSelected ? "rps-move-button--selected" : ""}`}
                          disabled={currentRound.isLocked}
                          onClick={() => onMoveSelect(option.move)}
                        >
                          <span className="rps-move-button__icon" aria-hidden>
                            {option.icon}
                          </span>
                          <span className="rps-move-button__label">{option.label}</span>
                          <span className="rps-move-button__detail">{option.detail}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="rps-panel__spectator">
                  <strong>{isEliminated ? "You were eliminated." : "Round in progress."}</strong>
                  <span>
                    {isEliminated
                      ? "You can stay in the room and watch the remaining players finish the match."
                      : "Waiting for the server to send your round state."}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="rps-panel__spectator">
              <strong>{isEliminated ? "You were eliminated." : "Preparing next round..."}</strong>
              <span>
                {isEliminated
                  ? "You are now spectating while the remaining players continue."
                  : "The server is setting up the next round."}
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="rps-panel__lobby-ready">
          <strong>Lobby ready for the next match.</strong>
          <span>The room has returned to lobby state and can start another round when everyone is ready.</span>
        </div>
      )}

      {resolutionForRoom && (
        <div className="rps-panel__resolution">
          <div className="rps-panel__resolution-header">
            <strong>Round {resolutionForRoom.roundNumber} result</strong>
            <span>
              {resolutionForRoom.isTie
                ? "Tie"
                : youWereEliminated
                  ? "You were eliminated"
                  : youSurvivedRound
                    ? "You survived"
                    : "Round complete"}
            </span>
          </div>
          <p className="rps-panel__resolution-copy">
            {resolutionForRoom.isTie
              ? "All active players replay this round because the move set did not produce a loser."
              : `Eliminated: ${resolutionForRoom.eliminatedUsernames.join(", ")}. Survivors: ${resolutionForRoom.survivors.join(", ")}.`}
          </p>
        </div>
      )}

      {gameResultForRoom && (
        <div className="rps-panel__winner">
          <p className="rps-panel__winner-label">Winning reveal</p>
          <h4 className="rps-panel__winner-title">{gameResultForRoom.winnerUsername} wins</h4>
          <p className="rps-panel__winner-copy">
            Final dish reveal: <strong>{gameResultForRoom.winningDishName}</strong>
          </p>
        </div>
      )}
    </section>
  );
}
