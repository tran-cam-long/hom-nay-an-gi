import { HttpService } from "@nestjs/axios";
import { Injectable, Logger } from "@nestjs/common";
import { firstValueFrom } from "rxjs";
import { DishDetails } from "src/dto/dish.detail";
import { ConfigService } from "@nestjs/config";


@Injectable()
export class DishChoiceService {
    private readonly logger = new Logger(DishChoiceService.name);
    private readonly backendUrl: string;

    constructor(
        private readonly http: HttpService,
        private readonly configService: ConfigService,
    ) {
        const backendUrl = this.configService.get<string>("BACKEND_URL");

        if (!backendUrl) {
            throw new Error("BACKEND_URL is not configured");
        }

        this.backendUrl = backendUrl;
    }

    async getAllDishes(accessToken: string): Promise<DishDetails[]> {
        const url = `${this.backendUrl}/api/cuisine/dishes`;

        const response = await firstValueFrom(
            this.http.get(url, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
            })
        );

        const payload = response.data;
        const dishes = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.dishes)
                ? payload.dishes
                : Array.isArray(payload?.data)
                    ? payload.data
                    : [];

        this.logger.log(`Fetched ${dishes.length} dishes from upstream`);

        return dishes;
    }

    async chooseDish(accessToken: string, dishId: number): Promise<void> {
        const url = `${this.backendUrl}/api/cuisine/rotation/choice`;

        const response = await firstValueFrom(
            this.http.post(
                url,
                { dishId },
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                    }
                },
            ),
        );

        return response.data;
    }
}
