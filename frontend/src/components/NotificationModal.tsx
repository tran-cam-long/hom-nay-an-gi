import { useEffect, useState } from "react";
import "./NotificationModal.css"

type NotificationModalProps = {
    isOpen: boolean;
    onClose: () => void;
    message: string;
    durationMs?: number;
};

export default function NotificationModal({
    isOpen,
    message,
    durationMs = 5000,
    onClose,
}: NotificationModalProps) {
    const [closing, setClosing] = useState(false);

    useEffect(() => {
        if (!isOpen) return;

        setClosing(false);

        const closeTimer = setTimeout(() => setClosing(true), durationMs);
        const unmountTimer = setTimeout(() => onClose(), durationMs + 220);

        return () => {
            clearTimeout(closeTimer);
            clearTimeout(unmountTimer);
        };
    }, [open, durationMs, onClose, message]);

    if (!isOpen) return null;

    return (
        <div className={`notify ${closing ? "notify--closing" : ""}`} role="status" aria-live="polite">
            <div className="notify__progress" style={{ animationDuration: `${durationMs}ms`}}></div>
            <p className="notify__text">{message}</p>
        </div>
    )
}
