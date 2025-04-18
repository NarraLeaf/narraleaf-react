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
    }

    use(plugin: IGamePluginRegistry): this {
        this.plugins.push(plugin);
        return this;
    }

    register(plugin: IGamePluginRegistry) {
        plugin.register(this.game);
    }

    registerAll() {
        this.plugins.forEach(plugin => plugin.register(this.game));
    }

    unregisterAll() {
        this.plugins.forEach(plugin => plugin.unregister(this.game));
    }

    has(plugin: IGamePluginRegistry) {
        return this.plugins.some(p => p.name === plugin.name);
    }
}
