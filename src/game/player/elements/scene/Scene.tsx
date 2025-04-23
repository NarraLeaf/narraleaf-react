import { Scene as GameScene } from "@core/elements/scene";
import React, { useEffect, useRef } from "react";
import { GameState, PlayerStateElement } from "@player/gameState";
import clsx from "clsx";
import { Layer } from "@player/elements/player/Layer";
import Displayables from "@player/elements/displayable/Displayables";
import { useExposeState } from "@player/lib/useExposeState";
import { ExposedStateType } from "@player/type";
import { Sound } from "@core/elements/sound";
import PlayerMenu from "@lib/game/player/elements/menu/PlayerMenu";
import PlayerDialog from "../say/UIDialog";
import PlayerNotification from "../notification/PlayerNotification";

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
                state.audioManager.stop(scene.state.backgroundMusic, fade).then(() => {
                    scene.state.backgroundMusic = null;
                    if (music) state.audioManager.play(music, {
                        end: music.state.volume,
                        duration: fade,
                    }).then(resolve);
                });
            });
        }
    });
    
    useEffect(() => {
        state.events.emit(GameState.EventTypes["event:state.onRender"]);
    }, []);

    return (
        <div className={clsx(className, "w-full h-full absolute")}>
            {([...layers.entries()].sort(([layerA], [layerB]) => {
                return layerA.config.zIndex - layerB.config.zIndex;
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
                    onClick={(skiped) => {
                        if (skiped) {
                            usingSkipRef.current = true;
                        }
                        onClick();
                        state.stage.next();
                        setTimeout(() => {
                            usingSkipRef.current = false;
                        }, 0);
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
                            onClick(choice);
                            state.stage.next();
                        }}
                        words={action.words}
                    />
                </div>
            ))}
            <PlayerNotification gameState={state} />
        </div>
    );
};