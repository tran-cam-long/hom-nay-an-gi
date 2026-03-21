# Multiplayer Mini Games Foundation Plan (Homnayangi)

## 1. Goal and Scope
Build a reusable multiplayer foundation for mini games in this project, then deliver the first game: **Rock-Paper-Scissors (RPS)**.

Required UX in scope:
1. On `HomnayangiPage`, add an `Invite` button under the title.
2. Clicking `Invite` opens a modal to enter another username.
3. Invited user receives notification in `TopBar`: `"<username> is inviting you to join Homnayangi"` with a `Join` action.
4. Notifications are always listening while user is logged in.
5. New notification adds a red dot on notification icon.
6. Clicking notification icon opens notification dropdown list.
7. Invite expires after 1 minute.
8. Join action navigates user to `Homnayangi` and shows room user list above page content.
9. Add host role and `Start` button.
10. Game can start only when all room users have made dish choice.
11. Dish choices are hidden during game; only final winning dish is revealed.
12. Host clicks `Start` -> popup to select game.
13. For RPS: 5-second round timer; each player can switch move during countdown; initial move is random.
14. After each round, eliminate losers and continue until one winner remains.

Out of scope for first iteration:
1. Cross-server scaling (will design for it, but initial implementation can be single-instance memory).
2. Match history persistence.
3. Additional game modes beyond RPS.

## 2. Current Codebase Constraints
1. Frontend is a single-page React app rooted at `frontend/src/pages/LandingPage.tsx`.
2. `Homnayangi` page exists at `frontend/src/pages/HomnayangiPage.tsx` with dish selection already implemented.
3. `TopBar` exists at `frontend/src/components/TopBar.tsx` and currently has no notifications.
4. Backend (`server`) is NestJS, currently mostly HTTP proxy style (auth and dishchoice), no websocket layer yet.
5. Auth token exists in `localStorage` and username is available in frontend login response state.

## 3. High-Level Architecture
Implement a **room + invite + game session** module with realtime transport.

Transport decision:
1. Use **Socket.IO** (Nest gateway + React client) for persistent notifications and room/game events.
2. Keep existing HTTP endpoints for dish data.

Core backend components:
1. `PresenceGateway`: manages socket connection/auth context.
2. `InviteService`: create invite, timeout/expire in 60s, send notification.
3. `RoomService`: room membership, host assignment, player ready status, dish choice status.
4. `MiniGameService`: generic game start/select flow with per-game runner.
5. `RpsGameRunner`: handles timer, move changes, elimination rounds, winner resolution.

Core frontend components:
1. Global realtime provider/hook (connect once while logged in).
2. `TopBar` notification bell + badge + dropdown + join action.
3. Invite modal from `HomnayangiPage`.
4. Room panel above Homnayangi content: users, host label, readiness, start button.
5. Game selection modal (host only).
6. RPS round UI state: timer, selected move, switching until countdown ends.

## 4. Data Contracts (MVP)
Define these shared types first (`frontend/src/types/multiplayer.ts` and server DTOs/interfaces):

1. `Invite`
   1. `inviteId: string`
   2. `roomId: string`
   3. `fromUsername: string`
   4. `toUsername: string`
   5. `status: "pending" | "accepted" | "expired" | "declined"`
   6. `createdAt: string`
   7. `expiresAt: string` (createdAt + 60s)
2. `RoomMember`
   1. `userId` or `username`
   2. `isHost: boolean`
   3. `hasChosenDish: boolean`
   4. `isConnected: boolean`
   5. `isEliminated: boolean` (in-game)
3. `RoomState`
   1. `roomId`
   2. `members: RoomMember[]`
   3. `status: "lobby" | "in_game" | "finished"`
   4. `selectedGame: "rps" | null`
   5. `hostUsername`
4. `RpsRoundState`
   1. `roundNumber`
   2. `activePlayers: string[]`
   3. `deadlineAt: string`
   4. `submittedMoves: Record<string, "rock" | "paper" | "scissors">` (server only, hidden from other players)
5. `GameResult`
   1. `winnerUsername`
   2. `winningDishId`
   3. `winningDishName`

## 5. Event/API Design
### 5.1 Socket events
Client -> Server:
1. `invite.send` `{ toUsername }`
2. `invite.accept` `{ inviteId }`
3. `room.leave` `{ roomId }`
4. `room.setDishChoice` `{ roomId, dishId }`
5. `game.start` `{ roomId, game: "rps" }` (host only)
6. `rps.move.update` `{ roomId, move }`

Server -> Client:
1. `notification.new` `{ type: "invite", invite, message }`
2. `invite.expired` `{ inviteId }`
3. `room.joined` `{ roomState }`
4. `room.updated` `{ roomState }`
5. `game.started` `{ roomId, game: "rps" }`
6. `rps.round.started` `{ roundNumber, deadlineAt, yourInitialMove }`
7. `rps.round.locked` `{ roundNumber }`
8. `rps.round.resolved` `{ eliminatedUsernames, survivors }`
9. `game.finished` `{ winnerUsername, winningDishId, winningDishName }`
10. `error` `{ code, message }`

### 5.2 Optional HTTP fallback endpoints (if needed for initial load/reconnect)
1. `GET /multiplayer/rooms/:roomId`
2. `GET /multiplayer/notifications`

## 6. Step-by-Step Delivery Plan

## Phase 0: Project Preparation
1. Add dependencies:
   1. Server: `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`.
   2. Frontend: `socket.io-client`.
2. Create base folders:
   1. `server/src/multiplayer/...`
   2. `frontend/src/multiplayer/...`
3. Add environment keys:
   1. `VITE_WS_URL` in frontend env.
   2. Any server config required for websocket CORS.

Definition of done:
1. App boots with websocket gateway enabled.
2. Frontend can connect/disconnect without crashing.

## Phase 1: Backend Multiplayer Foundation (No UI Yet)
1. Create Nest `MultiplayerModule` and register in `server/src/app.module.ts`.
2. Build `MultiplayerGateway`:
   1. Authenticate handshake using existing auth token flow (or username fallback for MVP with strict TODO).
   2. Map `username -> sockets`.
3. Build in-memory stores:
   1. `invites: Map<string, Invite>`
   2. `rooms: Map<string, RoomStateInternal>`
   3. `userToRoom: Map<string, string>`
4. Implement invite flow:
   1. Inviter sends `invite.send`.
   2. Validate target user online and not already in conflicting room.
   3. Create invite with 60s expiration.
   4. Emit `notification.new` to target user sockets.
   5. Schedule expiration timer and emit `invite.expired`.
5. Implement `invite.accept`:
   1. Validate invite pending and not expired.
   2. Create or fetch room.
   3. Add users, assign host (inviter as host by default).
   4. Broadcast `room.joined` / `room.updated`.

Definition of done:
1. Invite + accept works end-to-end via socket events.
2. Expiration after 60s works reliably.
3. Room state always consistent for all clients.

## Phase 2: Frontend Realtime Core
1. Add `MultiplayerProvider` mounted near `LandingPage` root.
2. Provider responsibilities:
   1. Connect socket when `loginRes` exists.
   2. Listen permanently for notification and room/game events.
   3. Expose state + action methods via context/hook.
3. Add shared types and event helpers:
   1. `frontend/src/types/multiplayer.ts`
   2. `frontend/src/multiplayer/socket.ts`
4. Add reconnect behavior:
   1. On reconnect, request room snapshot.
   2. Keep notifications list in memory (optional localStorage sync).

Definition of done:
1. One active socket per tab/user session.
2. Notification and room events update React state predictably.

## Phase 3: TopBar Notification UX
1. Extend `frontend/src/components/TopBar.tsx`:
   1. Add notification bell icon.
   2. Add red-dot badge when unread invite notifications exist.
   3. Add dropdown list on bell click.
2. Notification item layout:
   1. Message text: `"<fromUsername> is inviting you to join Homnayangi"`.
   2. `Join` button.
   3. Expiration countdown or expired state.
3. Join behavior:
   1. Calls `invite.accept`.
   2. On success, set active page to `"homnayangi"` in `LandingPage`.
4. Mark as read:
   1. Opening dropdown marks unread notifications as read.
   2. Keep expired invites visible with disabled action (optional for clarity).

Definition of done:
1. Bell is always visible when logged in.
2. Incoming invite triggers red dot immediately.
3. Clicking `Join` navigates to Homnayangi and joins room.

## Phase 4: Invite Entry on Homnayangi
1. In `frontend/src/pages/HomnayangiPage.tsx`:
   1. Add `Invite` button directly under `<h2>Homnayangi</h2>`.
   2. Add modal with username input + submit/cancel.
2. Invite submit flow:
   1. Validate non-empty username and not inviting self.
   2. Call `invite.send`.
   3. Show local success/error feedback using existing notification system.
3. Style additions in `frontend/src/pages/HomnayangiPage.css` and/or component CSS.

Definition of done:
1. User can invite any valid online username from Homnayangi page.
2. Error/success states are clear.

## Phase 5: Room UI and Host Controls
1. Add room panel above existing Homnayangi content:
   1. Room ID / host info.
   2. Current users list.
   3. Member status (`Ready` when dish chosen).
2. Add `Start` button visible only for host.
3. Guard rules:
   1. `Start` enabled only when room has at least 2 users.
   2. `Start` enabled only when all current users have selected a dish.
4. Host transfer logic:
   1. If host disconnects/leaves, transfer to next connected member deterministically.
   2. Broadcast update immediately.

Definition of done:
1. All users see same member list and host label in near real-time.
2. Start button availability reflects readiness rules correctly.

## Phase 6: Dish Choice Integration for Multiplayer
1. Keep existing dish choosing UI, but sync readiness to room:
   1. After local dish select succeeds, emit `room.setDishChoice`.
2. Privacy rule:
   1. During lobby and game, do not reveal selected dish names per player.
   2. Only expose `hasChosenDish` boolean in room list.
3. Game finish reveal:
   1. Reveal only winning player dish in final result event.

Definition of done:
1. Dish choices are hidden from peers.
2. Room readiness updates once each user chooses.

## Phase 7: Game Selection Modal and Start Flow
1. Host clicks `Start` -> open game selection modal.
2. First game option: `Rock Paper Scissors`.
3. On select:
   1. Emit `game.start` with `"rps"`.
   2. Server validates host and readiness conditions.
   3. Server changes room status to `in_game` and emits `game.started`.

Definition of done:
1. Non-host cannot start games.
2. Start blocked with explicit error if preconditions fail.

## Phase 8: RPS Game Engine Implementation
1. On round start:
   1. Active players = non-eliminated members.
   2. Assign random initial move for each active player.
   3. Emit `rps.round.started` with 5s `deadlineAt` and each player receives only `yourInitialMove`.
2. During 5s:
   1. Allow unlimited `rps.move.update` from active players.
   2. Server keeps latest move only.
3. At deadline:
   1. Lock round (`rps.round.locked`).
   2. Resolve eliminations.
4. Elimination logic (must be deterministic):
   1. If only one unique move -> tie, no eliminations, replay round.
   2. If all three moves present -> tie, no eliminations, replay round.
   3. If two moves present -> losing move users are eliminated.
5. Emit `rps.round.resolved` and continue next round until one player remains.
6. Finalization:
   1. Winner = last remaining player.
   2. Lookup winner's dish choice and dish name.
   3. Emit `game.finished` with winning dish only.
   4. Reset room to lobby for next game.

Definition of done:
1. RPS tournament always terminates with exactly one winner.
2. No other players' dish choice is exposed.

## Phase 9: Frontend RPS UX
1. Add in-game panel in `HomnayangiPage`:
   1. Round number.
   2. 5-second countdown.
   3. Move picker (rock/paper/scissors) with currently selected move highlighted.
2. On round start:
   1. Pre-select random move from server event.
   2. Let user switch until timer expires.
3. On round resolved:
   1. Show eliminated usernames and survivors.
4. On game finish:
   1. Show winner and winning dish only.
   2. Return to lobby state.

Definition of done:
1. Player can change move multiple times within timer.
2. UI transitions correctly through lobby -> in-game -> result -> lobby.

## Phase 10: Reliability, Testing, and Rollout
1. Backend unit tests:
   1. Invite expiry at 60s.
   2. Host transfer.
   3. RPS resolution logic edge cases (ties, 2-move rounds, eliminations).
2. Backend integration tests:
   1. Invite send/accept/join flow.
   2. Unauthorized start attempts rejected.
3. Frontend tests/manual checks:
   1. Notification red dot and dropdown behavior.
   2. Join invite navigation to Homnayangi.
   3. Room member list sync across two browsers.
   4. RPS 5-second switch behavior and final winner reveal.
4. Logging/observability:
   1. Add structured logs for invite lifecycle and game rounds.
   2. Add guardrail logs for invalid client events.

Definition of done:
1. Critical multiplayer flows are covered by tests.
2. Manual QA checklist passes with at least 2 concurrent users.

## 7. Suggested File-Level Task Breakdown
### Backend (new/updated)
1. `server/src/app.module.ts` (register multiplayer module).
2. `server/src/multiplayer/multiplayer.module.ts`.
3. `server/src/multiplayer/multiplayer.gateway.ts`.
4. `server/src/multiplayer/services/invite.service.ts`.
5. `server/src/multiplayer/services/room.service.ts`.
6. `server/src/multiplayer/services/game.service.ts`.
7. `server/src/multiplayer/games/rps.game.ts`.
8. `server/src/multiplayer/types/*.ts` (room, invite, events, rps).

### Frontend (new/updated)
1. `frontend/src/pages/LandingPage.tsx` (provider mount, join->navigate integration).
2. `frontend/src/components/TopBar.tsx` (notification bell/red dot/dropdown).
3. `frontend/src/pages/HomnayangiPage.tsx` (invite modal, room panel, host start, game UI).
4. `frontend/src/pages/HomnayangiPage.css` (new sections styling).
5. `frontend/src/multiplayer/MultiplayerProvider.tsx`.
6. `frontend/src/multiplayer/socket.ts`.
7. `frontend/src/types/multiplayer.ts`.
8. Optional: `frontend/src/components/InviteModal.tsx`, `frontend/src/components/NotificationDropdown.tsx`, `frontend/src/components/GameSelectModal.tsx`.

## 8. Acceptance Checklist (MVP)
1. User A invites User B from Homnayangi page.
2. User B sees realtime topbar notification with red dot.
3. Invite expires after 1 minute if ignored.
4. User B clicks `Join` and lands in Homnayangi room user list.
5. Host is visible; `Start` button only for host.
6. `Start` blocked until all users have chosen dish.
7. Host opens game selector and starts RPS.
8. Every round has 5-second switch window and elimination continues until one winner.
9. Only final winning dish is revealed after game.
10. Room returns to lobby for next game.

## 9. Future-Proofing (after MVP)
1. Replace in-memory room/invite store with Redis for multi-instance support.
2. Persist match summaries for history/leaderboard.
3. Introduce pluggable mini-game registry interface:
   1. `gameId`
   2. `validateStart(room)`
   3. `start(room)`
   4. `handleEvent(event)`
   5. `resolve()`
4. Add presence/offline push integration for invites.
