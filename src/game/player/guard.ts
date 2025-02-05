import {GameState} from "@player/gameState";

export enum GuardWarningType {
    invalidExposedStateUnmounting = "invalidExposedStateUnmounting",
}

export interface GuardConfig {
    [GuardWarningType.invalidExposedStateUnmounting]: boolean;
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
    private warnings: [GuardWarningType, string][] = [];
    constructor(public readonly config: GuardConfig) {
    }

    observe(state: GameState): this {
        this.watching = state;
        return this;
    }

    warn(type: GuardWarningType, message: string): string {
        this.warnings.push([type, message]);
        this.watching?.logger.warn(message);
        return message;
    }

    getWarnings(): [GuardWarningType, string][] {
        return [...this.warnings];
    }
}


