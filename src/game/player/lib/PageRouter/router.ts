import {useState} from "react";
import {EventDispatcher} from "@lib/util/data";
import {Game} from "@core/game";
import {useGame} from "@player/provider/game-state";


type RouterHookResult = Router;
type RouterEvents = {
    "event:router.onChange": [];
};

export class Router {
    /**@internal */
    public readonly events: EventDispatcher<RouterEvents> = new EventDispatcher();
    /**@internal */
    private current: string | null = null;
    /**@internal */
    private game: Game;
    /**@internal */
    private history: string[] = [];
    /**@internal */
    private historyIndex: number = -1;

    /**@internal */
    constructor(game: Game, defaultId?: string) {
        this.game = game;
        if (defaultId) {
            this.current = defaultId;
            this.history.push(defaultId);
            this.historyIndex = 0;
        }
    }

    public getCurrentId(): string | null {
        return this.current;
    }

    public push(id: string): this {
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        this.history.push(id);

        if (this.history.length > this.game.config.player.maxRouterHistory) {
            this.history.shift();
            this.historyIndex--;
        }

        this.historyIndex++;
        this.current = id;
        this.emitOnChange();
        return this;
    }

    public back(): this {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.current = this.history[this.historyIndex];
            this.emitOnChange();
        }
        return this;
    }

    public forward(): this {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.current = this.history[this.historyIndex];
            this.emitOnChange();
        }
        return this;
    }

    public cleanHistory(): this {
        this.history = this.current ? [this.current] : [];
        this.historyIndex = this.current ? 0 : -1;
        return this;
    }

    /**@internal */
    isActive(): boolean {
        return this.current !== null;
    }

    /**@internal */
    private emitOnChange(): void {
        this.events.emit("event:router.onChange");
    }
}


export function useRouter(defaultId?: string): RouterHookResult {
    const {game} = useGame();
    const [router] = useState(() => new Router(game, defaultId));

    return router;
}

