import { Scene as GameScene } from "@core/elements/scene";
import { Sound } from "@core/elements/sound";
import PlayerMenu from "@lib/game/player/elements/menu/PlayerMenu";
import Displayables from "@player/elements/displayable/Displayables";
import { Layer } from "@player/elements/player/Layer";
import { GameState, PlayerStateElement } from "@player/gameState";
import { useExposeState } from "@player/lib/useExposeState";
import { ExposedStateType } from "@player/type";
import clsx from "clsx";
import { useEffect, useRef } from "react";
import PlayerDialog from "../say/UIDialog";
import React from "react";

/**@internal */
export default function Scene(
    {
        state,
        className,
        elements,
    }: Readonly<{
        state: GameState;
        className?: string;
        elements: PlayerStateElement;
    }>) {
    const { scene, layers, texts, menus } = elements;
    const usingSkipRef = useRef(false);

    useEffect(() => {
        return scene.events.depends([
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
        state.logger.debug("Scene", "Scene mounted", scene.getId());

        return () => {
            scene.events.emit(GameScene.EventTypes["event:scene.unmount"]);
            state.logger.debug("Scene", "Scene unmounted", scene.getId());
        };
    }, []);

    useExposeState<ExposedStateType.scene>(scene, {
        setBackgroundMusic(music: Sound | null, fade: number) {
            return new Promise<void>((resolve) => {
                if (!scene.state.backgroundMusic) {
                    return;
                }

                (async function () {
                    if (scene.state.backgroundMusic && state.audioManager.isManaged(scene.state.backgroundMusic)) {
                        await state.audioManager.stop(scene.state.backgroundMusic, fade);
                    }
                    if (music) {
                        await state.audioManager.play(music, {
                            end: music.state.volume,
                            duration: fade,
                        });
                        scene.state.backgroundMusic = music;
                    } else {
                        scene.state.backgroundMusic = null;
                    }
                    resolve();
                })();
            });
        }
    });

    return (
        <div className={clsx(className, "w-full h-full absolute")}>
            {([...layers.entries()].sort(([layerA], [layerB]) => {
                return layerA.state.zIndex - layerB.state.zIndex;
            }).map(([layer, ele]) => (
                <Layer state={state} layer={layer} key={layer.getId()}>
                    <Displayables state={state} displayable={ele} />
                </Layer>
            )))}
            {texts.map(({ action, onClick }) => (
                <PlayerDialog
                    gameState={state}
                    key={"say-" + action.id}
                    action={action}
                    onFinished={(skiped) => {
                        if (skiped !== undefined) {
                            usingSkipRef.current = skiped;
                        }
                        onClick();
                        state.stage.next();
                    }}
                    useTypeEffect={!usingSkipRef.current}
                />
            ))}
            {menus.map(({ action, onClick }, i) => (
                <div key={"menu-" + i} data-element-type={"menu"}>
                    <PlayerMenu
                        state={state}
                        prompt={action.prompt}
                        choices={action.choices}
                        afterChoose={(choice) => {
                            usingSkipRef.current = false;
                            
                            onClick(choice);
                            state.stage.next();
                        }}
                        words={action.words}
                    />
                </div>
            ))}
        </div>
    );
};