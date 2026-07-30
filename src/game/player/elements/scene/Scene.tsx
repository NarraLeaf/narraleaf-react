import { Scene as GameScene } from "@core/elements/scene";
import { Sound } from "@core/elements/sound";
import Displayables from "@player/elements/displayable/Displayables";
import { Layer } from "@player/elements/player/Layer";
import { GameState, PlayerStateElement } from "@player/gameState";
import { useExposeState } from "@player/lib/useExposeState";
import { ExposedStateType } from "@player/type";
import clsx from "clsx";
import { useEffect } from "react";
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
            return new Promise<void>((resolve) => {
                (async function () {
                    if (scene.state.backgroundMusic && state.audioManager.isManaged(scene.state.backgroundMusic)) {
                        await state.audioManager.stop(scene.state.backgroundMusic, fade);
                    }
                    if (music) {
                        // `playSoundToken`, not `play`: `play` resolves when the track *finishes*
                        // unless it loops, so awaiting it here would hold the caller for the whole
                        // song. That caller is `SceneAction.initBackgroundMusic`, which the scene's
                        // init awaits - so a scene configured with a non-looping BGM would sit on
                        // its first frame until the music ran out. This resolves once playback has
                        // started and the fade-in is under way.
                        //
                        // It rejects where `play` swallowed (it hands the token back, so it cannot
                        // resolve on failure). Unhandled, that would strand the awaiting scene init
                        // forever, which is a worse failure than silence: the manager has already
                        // logged the reason, so treat it as "no music" and carry on.
                        try {
                            await state.audioManager.playSoundToken(music, {
                                end: music.state.volume,
                                duration: fade,
                            });
                            scene.state.backgroundMusic = music;
                        } catch {
                            scene.state.backgroundMusic = null;
                        }
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
        </div>
    );
};
