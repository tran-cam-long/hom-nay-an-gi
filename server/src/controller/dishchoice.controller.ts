import { Body, Controller, Get, Head, Headers, Post, UnauthorizedException } from "@nestjs/common";
import { DishChoiceService } from "src/service/dishchoice.service";

@Controller("dishchoice")
export class DishChoiceController {
    constructor(private readonly dishChoiceService: DishChoiceService) { }

    @Get("dishes")
    async getAllDishes(@Headers("authorization") authorization?: string) {
        if (!authorization || !authorization.toLowerCase().startsWith("bearer ")) {
            throw new UnauthorizedException("Missing or invalid bearer token");
        }

        const accessToken = authorization.slice(7).trim();

        if (!accessToken) {
            throw new UnauthorizedException("Missing access token");
        }

        return this.dishChoiceService.getAllDishes(accessToken);
    }

    @Post("choice")
    async chooseDish(
        @Headers("Authorization") authorization: string | undefined,
        @Body() body: { dishId: number },
    ) {
        if (!authorization || !authorization.toLocaleLowerCase().startsWith("bearer ")) {
            throw new UnauthorizedException("Missing or invalid bearer token.");
        }

        const accessToken = authorization.slice(7).trim();
        return this.dishChoiceService.chooseDish(accessToken, body.dishId);
    }
}
