import { Scene as GameScene } from "@core/elements/scene";
import { Sound } from "@core/elements/sound";
import Displayables from "@player/elements/displayable/Displayables";
import { Layer } from "@player/elements/player/Layer";
import { GameState, PlayerStateElement } from "@player/gameState";
import { useExposeState } from "@player/lib/useExposeState";
import { ExposedStateType } from "@player/type";
import { setSceneBackgroundMusic } from "./backgroundMusic";
import clsx from "clsx";
import { useEffect, useRef } from "react";
import React from "react";

/**
 * The visual stage of a scene: its layers, backgrounds and sprites.
 *
 * Rendered inside the stage {@link Camera} so camera transforms move it as a single unit. The
 * scene's dialog box and menus are rendered separately by `SceneDialogs`, outside the camera, so
 * the text UI stays fixed while the camera moves.
 * @internal
 */
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
    const { scene, layers } = elements;
    const rootRef = useRef<HTMLDivElement | null>(null);

    // Bound for the scene's whole mounted life, not just while a transition runs: a stage
    // transition writes to this root in place rather than reparenting it, which is what lets the
    // scene keep its DOM (and its sprites' load state) across a jump.
    useEffect(() => {
        state.stageTransition.registerScene(scene, rootRef.current);

        return () => {
            state.stageTransition.registerScene(scene, null);
        };
    }, []);

    useEffect(() => {
        return scene.events.depends([
            scene.events.on(GameScene.EventTypes["event:scene.preUnmount"], () => {
                if (scene.state.backgroundMusic) {
                    return state.audioManager.stop(scene.state.backgroundMusic, scene.config.backgroundMusicFade);
                }
            }),
        ]).cancel;
    }, []);

    useEffect(() => {
        scene.events.emit(GameScene.EventTypes["event:scene.mount"]);
        state.events.emit(GameState.EventTypes["event:state.scene.mount"], scene);
        state.logger.debug("Scene", "Scene mounted", scene.getId());

        return () => {
            scene.events.emit(GameScene.EventTypes["event:scene.unmount"]);
            state.events.emit(GameState.EventTypes["event:state.scene.unmount"], scene);
            state.logger.debug("Scene", "Scene unmounted", scene.getId());
        };
    }, []);

    useExposeState<ExposedStateType.scene>(scene, {
        setBackgroundMusic(music: Sound | null, fade: number) {
            return setSceneBackgroundMusic(state, scene, music, fade);
        }
    });

    return (
        <div className={clsx(className, "w-full h-full absolute")} ref={rootRef} data-element-type={"scene"} data-scene-id={scene.getId()}>
            {([...layers.entries()].sort(([layerA], [layerB]) => {
                return layerA.state.zIndex - layerB.state.zIndex;
            }).map(([layer, ele]) => (
                <Layer state={state} layer={layer} key={layer.getId()}>
                    <Displayables state={state} displayable={ele} />
                </Layer>
            )))}
        </div>
    );
};
