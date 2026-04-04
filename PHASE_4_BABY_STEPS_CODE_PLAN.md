# Phase 4 Baby Steps Code Plan (Invite Entry on Homnayangi)

This guide is for implementing **Phase 4** yourself in very small steps, with checkpoints after each step.

Scope:
1. Invite entry UX only.
2. Add `Invite` button directly under `<h2>Homnayangi</h2>`.
3. Add modal with username input + submit/cancel.
4. Invite submit flow with validation and error feedback.
5. Style additions in `frontend/src/pages/HomnayangiPage.css`.
6. No room panel yet.
7. No game UI yet.
8. No host controls yet.

---

## 0. Current Starting Point

You already have:
1. `HomnayangiPage` with dish selection UI, pull-to-refresh, and carousels.
2. `TopBar` with notification bell, red dot badge, dropdown list, and `Join` action that navigates to Homnayangi.
3. `MultiplayerConnectionProvider` with `sendInvite(toUsername)` method.
4. `frontend/src/types/multiplayer.ts` with shared types.
5. `frontend/src/multiplayer/useMultiplayer.ts` hook.
6. Backend already supports `invite.send` event.
7. Existing notification system in `LandingPage` for success/error feedback.

Important current gaps:
1. `HomnayangiPage` has no multiplayer imports or hooks yet.
2. No invite button or modal in the UI.
3. No validation for invite flow (non-empty, not self).
4. No local success/error feedback for invite attempts.

Goal for Phase 4:
1. User can invite any valid online username from Homnayangi page.
2. Invite button is visible under the page title.
3. Modal appears on invite button click.
4. Input validation prevents empty or self-invites.
5. Success/error states are shown via existing notification system.
6. Modal closes on success or cancel.

---

## 0.5 Make Two Small Decisions First

Before writing the invite modal logic, decide these two things.

### Decision 1: Modal Implementation Style
Choose between:
- **Option A**: Inline modal state in `HomnayangiPage` (simpler, no new files).
- **Option B**: Separate `InviteModal` component (reusable, cleaner separation).

For this phase, **choose Option B** (separate component) for better organization and reusability.

### Decision 2: Username Validation Rules
The validation should check:
- Non-empty username.
- Not inviting yourself (compare with current username).
- Optionally: basic format check (alphanumeric + underscores).

For this phase, implement basic checks and show errors in the modal.

---

## 1. Create InviteModal Component

Create `frontend/src/components/InviteModal.tsx` with the modal structure.

```tsx
import { useState } from "react";

interface InviteModalProps {
  isOpen: boolean;
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
  isSubmitting,
}: InviteModalProps) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const trimmedUsername = username.trim();
    setUsername(trimmedUsername);

    // Basic validation
    if (!trimmedUsername) {
      setError("Username cannot be empty");
      return;
    }

    if (!currentUsername) {
      setError("Not logged in");
      return;
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
          <label htmlFor="invite-username">Username:</label>
          <input
            id="invite-username"
            type="text"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setError(null); // Clear error on change
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
  );
}
```

Checkpoint:
1. New file created with modal component.
2. Component accepts props for state management.
3. Basic validation logic included.

---

## 2. Import Multiplayer Hook and Modal in HomnayangiPage

Add the imports and hook usage.

```tsx
import useMultiplayer from "../multiplayer/useMultiplayer";
import InviteModal from "../components/InviteModal";
// ... existing imports

export default function HomnayangiPage({ onNotify }: HomnayangiPageProps) {
  // ... existing state

  const { sendInvite, username: currentUsername } = useMultiplayer();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);

  // ... rest of component
}
```

Checkpoint:
1. No runtime errors.
2. `sendInvite`, `currentUsername`, and modal state available.

---

## 3. Add Invite Button and Modal to JSX

Add the button and modal component to the JSX.

```tsx
        <h2>Homnayangi</h2>

        <button
          type="button"
          className="invite-btn"
          onClick={() => setIsInviteModalOpen(true)}
        >
          Invite
        </button>

        <InviteModal
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          onSubmit={handleInviteSubmit}
          currentUsername={currentUsername}
          isSubmitting={isSubmittingInvite}
        />

        {!isChoosingEnabled && (
```

Checkpoint:
1. "Invite" button appears under the title with click handler.
2. Modal component is included in JSX with proper props.

---

## 4. Add Invite Submit Handler

Add the submit handler that calls sendInvite and shows feedback.

```tsx
  const handleInviteSubmit = async (username: string) => {
    setIsSubmittingInvite(true);

    try {
      sendInvite(username);
      onNotify(`Invite sent to ${username}!`);
      setIsInviteModalOpen(false);
    } catch (error) {
      // For now, assume success - backend validation will handle errors
      onNotify("Failed to send invite. Please try again.");
    } finally {
      setIsSubmittingInvite(false);
    }
  };
```

Checkpoint:
1. Handler receives validated username from modal.
2. Calls sendInvite and shows success notification.
3. Closes modal on success.
4. Handles errors gracefully.

---

## 5. Add Modal Styling

Add CSS in `frontend/src/pages/HomnayangiPage.css`.

```css
.invite-btn {
  background: #007bff;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  margin-bottom: 16px;
}

.invite-btn:hover {
  background: #0056b3;
}

.invite-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.invite-modal {
  background: white;
  padding: 24px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 300px;
  max-width: 400px;
}

.invite-modal h3 {
  margin-top: 0;
  margin-bottom: 16px;
}

.invite-modal label {
  display: block;
  margin-bottom: 8px;
  font-weight: bold;
}

.invite-modal input {
  width: 100%;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-sizing: border-box;
}

.invite-modal input:focus {
  outline: none;
  border-color: #007bff;
}

.invite-error {
  color: #dc3545;
  margin: 8px 0;
  font-size: 14px;
}

.invite-modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
}

.invite-modal-actions button {
  padding: 8px 16px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
  cursor: pointer;
}

.invite-modal-actions button[type="submit"] {
  background: #007bff;
  color: white;
  border-color: #007bff;
}

.invite-modal-actions button[type="submit"]:hover {
  background: #0056b3;
}

.invite-modal-actions button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

Checkpoint:
1. Invite button looks good under title.
2. Modal is centered with nice styling.
3. Form elements are properly styled.
4. Disabled states work.

---

## 6. Test End-to-End Invite Flow

Manual test:
1. Open two browser tabs, login as different users.
2. In User A's Homnayangi, click Invite, enter User B's username, submit.
3. User B should see notification in TopBar.
4. User A should see success notification.

Checkpoint:
1. Invite sends successfully.
2. Target user receives notification.
3. Error cases (empty, self, invalid user) show proper feedback in modal.

---

## 7. Handle Invite Errors from Backend

The `sendInvite` might fail if user is offline or invalid. Currently the try/catch won't catch async errors from socket.

For this phase, the modal shows validation errors, but backend errors should be handled. Since the socket events are async, add error handling in the provider or show generic error.

Checkpoint:
1. Invalid username shows error in modal.
2. Offline user shows error notification.

---

## 8. Final Cleanup and Polish

- Ensure modal closes on ESC key (add to InviteModal).
- Add loading spinner if needed.
- Test all edge cases.

Checkpoint:
1. UX feels polished.
2. All edge cases handled.