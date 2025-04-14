import { Game } from "@core/game";

export interface IGamePluginRegistry {
    name: string;
    register(game: Game): void;
    unregister(game: Game): void;
}

export class Plugins {
    private plugins: IGamePluginRegistry[] = [];

    constructor(public readonly game: Game) {
        this.registerAll();
        this.game.hooks.trigger("pluginsInit", []);
    }

    use(plugin: IGamePluginRegistry) {
        this.plugins.push(plugin);
    }

    private registerAll() {
        this.plugins.forEach(plugin => plugin.register(this.game));
    }

    private unregisterAll() {
        this.plugins.forEach(plugin => plugin.unregister(this.game));
    }
}
