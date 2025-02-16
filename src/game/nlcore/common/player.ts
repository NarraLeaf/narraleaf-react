import Player from "@player/elements/Player";
import GameProviders from "@player/provider/providers";
import {useGame} from "@lib/game/player/provider/game-state";
import {useRouter} from "@player/lib/PageRouter/router";

export * from "@player/type";
export * from "@player/libElements";
export {
    GameProviders,
    Player,
    useGame,
    useRouter,
};
