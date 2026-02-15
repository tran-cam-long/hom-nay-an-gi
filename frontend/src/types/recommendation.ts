import type { DishDetails } from "./dish";

export type RecommendationItem = {
  dish: DishDetails;
  timesChosen: number;
  lastChosenTime: string | null;
};

export type RotationRecommendationsResponse = {
  userFavorites: RecommendationItem[];
  userDiscovery: RecommendationItem[];
  userLeastOftenInTop: RecommendationItem[];
};
