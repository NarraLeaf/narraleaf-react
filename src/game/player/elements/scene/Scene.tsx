import {Scene as GameScene} from "@core/elements/scene";
import React, {useEffect} from "react";
import {GameState} from "@player/gameState";
import clsx from "clsx";

/**@internal */
export default function Scene(
    {
        scene,
        state,
        children,
        className
    }: Readonly<{
        scene: GameScene;
        state: GameState;
        children?: React.ReactNode;
        className?: string;
    }>) {
    useEffect(() => {
        return scene.events.depends([
            scene.events.on(GameScene.EventTypes["event:scene.setBackgroundMusic"], (music, fade) => {
                return new Promise<void>((resolve) => {
                    if (!scene.state.backgroundMusic) {
                        return;
                    }
                    state.audioManager.stop(scene.state.backgroundMusic, fade).then(() => {
                        scene.state.backgroundMusic = null;
                        if (music) state.audioManager.play(music, {
                            end: music.state.volume,
                            duration: fade,
                        }).then(resolve);
                    });
                });
            }),
            scene.events.on(GameScene.EventTypes["event:scene.preUnmount"], () => {
                if (scene.state.backgroundMusic) {
                    return state.audioManager.stop(scene.state.backgroundMusic).then(() => {
                        scene.state.backgroundMusic = null;
                    });
                }
            }),
        ]).cancel;
    }, []);

    useEffect(() => {
        scene.events.emit(GameScene.EventTypes["event:scene.mount"]);

        return () => {
            scene.events.emit(GameScene.EventTypes["event:scene.unmount"]);
        };
    }, []);

    return (
        <div className={clsx(className, "w-full h-full")}>
            {children}
        </div>
    );
};