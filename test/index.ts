import { Game, IGamePluginRegistry, LiveGameEventToken, Transform } from "../";

const transform = new Transform([
    {
        props: {
            position: { x: 100, y: 100 },
            scale: 2,
            rotation: 45,
            opacity: 0.5,
        },
        options: {
            duration: 1000,
            ease: "easeInOut",
        },
    }
]);

let listenerToken: LiveGameEventToken;

const plugin: IGamePluginRegistry = {
    name: "test_plugin",

    register: (game: Game) => {
        // This logic will be called once the game is initialized
        // and before the player has rendered
        listenerToken = game.hooks.hook("init", () => {
            console.log("init");
        })
    },

    unregister: (game: Game) => {
        // This logic will be called once the game is disposed
        // and before the player has unmounted
        listenerToken.cancel();
    }
};

