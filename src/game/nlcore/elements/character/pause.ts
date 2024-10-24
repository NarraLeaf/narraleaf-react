export type PauseConfig = {
    duration?: number;
};

export type PausingShortcut = typeof Pause;
export type Pausing = Pause | PausingShortcut;

export class Pause {
    /**@internal */
    public static from(input: typeof Pause | Pause): Pause {
        if (Pause.isPauseConstructor(input)) {
            return new Pause();
        }
        return input;
    }

    public static wait(duration: number): Pause {
        return new Pause({duration});
    }

    /**@internal */
    public static isPause(obj: any): obj is Pausing {
        return this.isPauseConstructor(obj) || obj instanceof Pause;
    }

    /**@internal */
    private static isPauseConstructor(input: any): input is typeof Pause {
        return input === Pause;
    }

    /**@internal */
    public config: Partial<PauseConfig>;

    constructor(config: Partial<PauseConfig> = {}) {
        this.config = config;
    }
}
