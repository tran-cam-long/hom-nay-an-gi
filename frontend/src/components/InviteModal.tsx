import React, { useState } from "react";


interface InviteModalProps {
    isOpen: boolean,
    onClose: () => void;
    onSubmit: (username: string) => void;
    currentUsername: string | null;
    isSubmitting: boolean;
}

export default function InviteModal({
    isOpen,
    onClose,
    onSubmit,
    currentUsername,
    isSubmitting
}: InviteModalProps) {
    const [username, setUsername] = useState("");
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();

        const trimmedUsername = username.trim();
        setUsername(trimmedUsername);

        if (!trimmedUsername) {
            setError("Username cannot be empty");
            return;
        }

        if (!currentUsername) {
            setError("Not logged in")
        }

        if (trimmedUsername === currentUsername) {
            setError("Cannot invite yourself");
            return;
        }

        setError(null);
        onSubmit(trimmedUsername);
        setUsername("");
    };

    const handleClose = () => {
        if (!isSubmitting) {
            setUsername("");
            setError(null);
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="invite-modal-overlay" onClick={handleClose}>
            <div className="invite-modal" onClick={(e) => e.stopPropagation()}>
                <h3>Invite Player</h3>
                <form onSubmit={handleSubmit}>
                    <label htmlFor="invite-username">Username</label>
                    <input type="text"
                        id="invite-username"
                        value={username}
                        onChange={(e) => {
                            setUsername(e.target.value);
                            setError(null);
                        }}
                        disabled={isSubmitting}
                        autoFocus
                    />
                    {error && <p className="invite-error">{error}</p>}
                    <div className="invite-modal-actions">
                        <button type="button" onClick={handleClose} disabled={isSubmitting}>
                            Cancel
                        </button>
                        <button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? "Sending..." : "Send Invite"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}