import {Choice} from "@core/elements/menu";

export * from "@player/elements/type";
export type Chosen = Choice & {
    evaluated: string;
};