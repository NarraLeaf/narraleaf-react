import { Scene as GameScene } from "@core/elements/scene";
import { Sound } from "@core/elements/sound";
import { GameState } from "@player/gameState";

/**
 * Swap a scene's background music, cross-fading the outgoing track into the incoming one.
 *
 * A cross-fade is the two tracks *overlapping*: the incoming one starts while the outgoing one is
 * still fading, not once it has finished. Starting them in sequence — which is what this used to do
 * — left a hole of `fade` milliseconds of silence between two pieces of music that were supposed to
 * blend, and the longer the fade an author asked for, the longer the hole.
 *
 * The returned promise still settles only once the outgoing fade has finished. `SceneAction`'s init
 * awaits it and its contract is that the previous track is gone by then; overlapping changes when
 * the new track *starts*, which is the whole point, not when this resolves.
 *
 * Lives outside `Scene.tsx` so the ordering above can be asserted directly — there is no DOM in
 * this repo's test setup to render the component into.
 * @internal
 */
export async function setSceneBackgroundMusic(
    state: GameState,
    scene: GameScene,
    music: Sound | null,
    fade: number,
): Promise<void> {
    const outgoing = scene.state.backgroundMusic;
    const fadingOut = outgoing && state.audioManager.isManaged(outgoing)
        ? state.audioManager.stop(outgoing, fade)
        : null;

    // Setting the same clip again is the one case that cannot overlap with itself. `AudioManager`
    // keys its book-keeping by the sound element, so the fade-out's cleanup would delete the entry
    // the restarted track had just registered under that same key, and the manager would lose its
    // handle on a track that is still audible. Those two stay sequential, exactly as before.
    if (fadingOut && music === outgoing) {
        await fadingOut;
    }

    if (music) {
        // `playSoundToken`, not `play`: `play` resolves when the track *finishes* unless it loops,
        // so awaiting it here would hold the caller for the whole song. That caller is
        // `SceneAction.initBackgroundMusic`, which the scene's init awaits - so a scene configured
        // with a non-looping BGM would sit on its first frame until the music ran out. This
        // resolves once playback has started and the fade-in is under way.
        //
        // It rejects where `play` swallowed (it hands the token back, so it cannot resolve on
        // failure). Unhandled, that would strand the awaiting scene init forever, which is a worse
        // failure than silence: the manager has already logged the reason, so treat it as "no
        // music" and carry on.
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

    if (fadingOut) {
        await fadingOut;
    }
}
