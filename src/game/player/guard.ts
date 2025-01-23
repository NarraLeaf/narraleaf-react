import {GameState} from "@player/gameState";

export interface GuardConfig {
    unassignedElement: boolean;
    unremovedScene: boolean;
}

type GuardTask = {
    cancel: () => void
};

/**
 * Guard for the game state.
 *
 * After NarraLeaf-React 0.3.0, this class is designed to be used as a guard for the game state.
 * With this feature, developers can easily find incorrect states or unexpected behaviors in the game.
 */
export class GameStateGuard {
    private watching: GameState | null = null;
    private guardTasks: GuardTask[] = [];
    constructor(public readonly config: GuardConfig) {
    }

    observe(state: GameState) {
        this.watching = state;
    }
}


