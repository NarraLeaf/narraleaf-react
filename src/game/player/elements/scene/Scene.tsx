import {Scene as GameScene, SceneEventTypes} from "@core/elements/scene";
import React, {useEffect} from "react";
import BackgroundTransition from "./BackgroundTransition";
import {GameState} from "@player/gameState";

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
    // const [backgroundMusic, setBackgroundMusic] =
    //     useState<Sound | null>(() => scene.state.backgroundMusic);

    useEffect(() => {
        const listeners: {
            type: keyof SceneEventTypes;
            listener: (...args: any[]) => void;
        }[] = [
            {
                type: "event:scene.setBackgroundMusic",
                listener: scene.events.on(GameScene.EventTypes["event:scene.setBackgroundMusic"], (_music, _fade) => {
                    // @todo
                })
            },
            {
                type: "event:scene.preUnmount",
                listener: scene.events.on(GameScene.EventTypes["event:scene.preUnmount"], () => {
                    // @todo
                })
            }
        ];

        return () => {
            listeners.forEach(({type, listener}) => {
                scene.events.off(type, listener);
            });
        };
    }, []);

    useEffect(() => {
        scene.events.emit(GameScene.EventTypes["event:scene.mount"]);

        return () => {
            scene.events.emit(GameScene.EventTypes["event:scene.unmount"]);
        };
    }, []);

    return (
        <div className={className}>
            <BackgroundTransition scene={scene} state={state}/>
            {children}
        </div>
    );
};