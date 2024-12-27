import {Scene as GameScene, SceneEventTypes} from "@core/elements/scene";
import {useRatio} from "@player/provider/ratio";
import React, {useEffect, useState} from "react";
import BackgroundTransition from "./BackgroundTransition";
import {GameState} from "@player/gameState";
import {Sound} from "@core/elements/sound";
import {Utils} from "@core/common/Utils";

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
    const {ratio} = useRatio();
    const [backgroundMusic, setBackgroundMusic] =
        useState<Sound | null>(() => scene.state.backgroundMusic);

    async function stopWithFade(music: Sound, fade: number) {
        await state.fadeSound(music, 0, fade);
        state.stopSound(music);
    }

    async function fadeTo(music: Sound | null, fade?: number) {
        const lastMusic = backgroundMusic;
        const nextMusic = music;

        await state.transitionSound(lastMusic, nextMusic, fade);

        if (!nextMusic) {
            return;
        }

        setBackgroundMusic(nextMusic);
    }

    useEffect(() => {
        const listeners: {
            type: keyof SceneEventTypes;
            listener: (...args: any[]) => void;
        }[] = [
            {
                type: "event:scene.setBackgroundMusic",
                listener: scene.events.on(GameScene.EventTypes["event:scene.setBackgroundMusic"], (music, fade) => {
                    fadeTo(music, fade).then();
                })
            },
            {
                type: "event:scene.preUnmount",
                listener: scene.events.on(GameScene.EventTypes["event:scene.preUnmount"], () => {
                    if (backgroundMusic) {
                        stopWithFade(backgroundMusic, scene.state.backgroundMusicFade).then();
                    }
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
            <BackgroundTransition scene={scene} props={{
                width: ratio.state.width,
                height: ratio.state.height,
                src: Utils.isImageSrc(scene.state.background) ?
                    Utils.srcToString(scene.state.background) : void 0,
                style: {
                    backgroundColor: Utils.isImageColor(scene.state.background) ?
                        Utils.toHex(scene.state.background) : void 0,
                }
            }} state={state}/>
            {children}
        </div>
    );
};