const { io } = require("socket.io-client");
const readline = require("readline");
const { toUSVString } = require("util");

const username = process.argv[2];
const url = process.argv[3] || "http://localhost:3000";

if (!username) {
    console.error("Usage: node server/scripts/socket-test-client.cjs <username> [url]");
    process.exit(1);
}

const socket = io(url, {
    transports: ["websocket"],
    auth: { username },
});

let lastInviteId = null;

socket.on("connect", () => {
    console.log(`[${username}] connected: ${socket.id}`);
    console.log(`[${username} commands: invite <user>, accept <inviteId>, accept-last, quit]`);
});

socket.on("connect", () => {
    console.log(`[${username} connected: ${socket.id}]`);
    console.log(`[${username} commands: invite <user>, accept <inviteId>, accept-last, quit]`);
});

socket.on("disconnect", (reason) => {
    console.log(`[${username}] disconnected: ${reason}`);
});

socket.on("connect_error", (err) => {
    console.error(`[${username}] connect_error:`, err.message);
});

socket.on("notification.new", (payload) => {
    console.log(`[${username}] notification.new:`, JSON.stringify(payload, null, 2));
    if (payload?.invite?.inviteId) {
        lastInviteId = payload.invite.inviteId;
    }
});

socket.on("notification.new", (payload) => {
    console.log(`[${username}] notification.new: `, JSON.stringify(payload, null, 2));
    if (payload?.invite?.inviteId) {
        lastInviteId = payload.invite.inviteId;
    }
});

socket.on("invite.expired", (payload) => {
    console.log(`[${username}] invite.expired:`, JSON.stringify(payload, null, 2));
});

socket.on("room.joined", (payload) => {
    console.log(`[${username}] room.joined:`, JSON.stringify(payload, null, 2));
});

socket.on("room.updated", (payload) => {
    console.log(`[${username}] room.updated:`, JSON.stringify(payload, null, 2));
});

socket.on("error", (payload) => {
    console.log(`[${username}] error:`, JSON.stringify(payload, null, 2));
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

rl.on("line", (line) => {
    const input = line.trim();
    if (!input) return;

    const [cmd, ...rest] = input.split(" ");

    if (cmd === "invite") {
        const toUsername = rest[0];
        socket.emit("invite.send", { toUsername });
        return;
    }

    if (cmd === "accept-last") {
        if (!lastInviteId) {
            console.log(`[${username}] no lastInviteId yet`);
            return;
        }
        socket.emit("invite.accept", { inviteId: lastInviteId });
        return;
    }

    if (cmd === "quit") {
        rl.close();
        socket.disconnect();
        process.exit(0);
    }

    console.log(`[${username} unknown command]`);
});


