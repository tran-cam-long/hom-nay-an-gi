export type InviteSendPayload = {
    toUsername: string;
};

export type InviteAcceptPayload = {
    inviteId: string;
}

export type RoomSetDishChoicePayload = {
    roomId: string,
    dishId: number;
}