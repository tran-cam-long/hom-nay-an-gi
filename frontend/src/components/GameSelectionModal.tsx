import { useState } from "react";
import type { MultiplayerGameKey } from "../types/multiplayer";

type GameSelectionModalProps = {
    isOpen: boolean;
    isSubmitting: boolean;
    onClose: () => void;
    onConfirm: (game: MultiplayerGameKey) => void;
};

const AVAILABLE_GAMES: Array<{
    key: MultiplayerGameKey;
    title: string;
    description: string;
}> = [
        {
            key: "rps",
            title: "Rock Paper Scissors",
            description: "Classic elimination rounds. Everyone starts with a random move and can switch until the timer ends."
        },
    ];

export default function GameSelectionModal({
    isOpen,
    isSubmitting,
    onClose,
    onConfirm,
}: GameSelectionModalProps) {
    const [selectedGame, setSelectedGame] = useState<MultiplayerGameKey>("rps");

    if (!isOpen) return null;

    return (
        <div className="game-selection-modal-overlay" onClick={() => !isSubmitting && onClose()}>
            <div className="game-selection-modal" onClick={(event) => event.stopPropagation()}>
                <h3>Select a game</h3>
                <div className="game-selection-list">
                    {AVAILABLE_GAMES.map((game) => (
                        <button
                            key={game.key}
                            type="button"
                            className={`game-selection-card ${selectedGame === game.key ? "game-selection-card--selected" : ""}`}
                            onClick={() => setSelectedGame(game.key)}
                            disabled={isSubmitting}>
                            <span className="game-selection-card__title">{game.title}</span>
                            <span className="game-selection-card__description">{game.description}</span>
                        </button>
                    ))}
                </div>

                <div className="game-selection-modal-actions">
                    <button type="button" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </button>
                    <button type="button" onClick={() => onConfirm(selectedGame)} disabled={isSubmitting}>
                        {isSubmitting ? "Starting..." : "Start game"}
                    </button>
                </div>
            </div>
        </div>
    );
}