import React, {createContext, useContext, useState} from "react";
import {EventDispatcher} from "@lib/util/data";
import {Game} from "@core/game";
import {useGame} from "@player/provider/game-state";

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

    /**
     * Push a new page id to the router history
     */
    public push(id: string): this {
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        this.history.push(id);

        if (this.history.length > this.game.config.maxRouterHistory) {
            this.history.shift();
            this.historyIndex--;
        }

        this.historyIndex++;
        this.current = id;
        this.emitOnChange();
        return this;
    }

    /**
     * Go back to the previous page id in the router history
     */
    public back(): this {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.current = this.history[this.historyIndex];
            this.emitOnChange();
        } else {
            this.current = null;
            this.emitOnChange();
        }
        return this;
    }

    /**
     * Go forward to the next page id in the router history
     */
    public forward(): this {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.current = this.history[this.historyIndex];
            this.emitOnChange();
        }
        return this;
    }

    /**
     * Clear the current page id and history
     *
     * All pages will be removed from the stage
     */
    public clear(): this {
        this.current = null;
        this.history = [];
        this.historyIndex = -1;
        this.emitOnChange();
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

type RouterContextType = {
    router: Router;
};

const RouterContext = createContext<null | RouterContextType>(null);

/**@internal */
export function RouterProvider({children}: {
    children: React.ReactNode
}) {
    "use client";
    const game = useGame();
    const [router] = useState(() => new Router(game));

    return (
        <>
            <RouterContext value={{router}}>
                {children}
            </RouterContext>
        </>
    );
}

export function useRouter(): Router {
    if (!useContext(RouterContext)) throw new Error("usePreloaded must be used within a PreloadedProvider");
    return (useContext(RouterContext) as RouterContextType).router;
}

