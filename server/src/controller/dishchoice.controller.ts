import { Controller, Get, Headers, UnauthorizedException } from "@nestjs/common";
import { DishChoiceService } from "src/service/dishchoice.service";

@Controller("dishchoice")
export class DishChoiceController {
    constructor(private readonly dishChoiceService: DishChoiceService) {}

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
}
