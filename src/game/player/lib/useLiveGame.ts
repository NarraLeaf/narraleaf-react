import { useGame } from "../provider/game-state";
export function useLiveGame() {
    const game = useGame();
    const liveGame = game.getLiveGame();

    return liveGame;
}