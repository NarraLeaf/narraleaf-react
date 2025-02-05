import {Scene as GameScene} from "@core/elements/scene";
import React, {useEffect} from "react";
import {GameState, PlayerStateElement} from "@player/gameState";
import clsx from "clsx";
import {Layer} from "@player/elements/player/Layer";
import Displayables from "@player/elements/displayable/Displayables";
import {useGame} from "@player/provider/game-state";
import {useExposeState} from "@player/lib/useExposeState";
import {ExposedStateType} from "@player/type";
import {Sound} from "@core/elements/sound";

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
    const {game} = useGame();
    const {scene, layers, texts, menus} = elements;
    const Say = game.config.elements.say.use;
    const Menu = game.config.elements.menu.use;

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

    return (
        <div className={clsx(className, "w-full h-full")}>
            {([...layers.entries()].sort(([layerA], [layerB]) => {
                return layerA.config.zIndex - layerB.config.zIndex;
            }).map(([layer, ele]) => (
                <Layer state={state} layer={layer} key={layer.getId()}>
                    <Displayables state={state} displayable={ele}/>
                </Layer>
            )))}
            {texts.map(({action, onClick}) => (
                <Say
                    state={state}
                    key={"say-" + action.id}
                    action={action}
                    onClick={() => {
                        onClick();
                        state.stage.next();
                    }}
                />
            ))}
            {menus.map(({action, onClick}, i) => (
                <div key={"menu-" + i}>
                    <Menu
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
        </div>
    );
};