export type InviteSendPayload = {
    toUsername: string;
};

export type InviteAcceptPayload = {
    inviteId: string;
}

export type RoomSetDishChoicePayload = {
    roomId: string,
    dishId: number;
    dishName: string;
}

export type RoomLeavePayload = {
    roomId: string;
}

export type GameStartPayload = {
    roomId: string;
    game: "rps"
}

export type RpsMoveUpdatePayload = {
    roomId: string;
    move: "rock" | "paper" | "scissors";
}
