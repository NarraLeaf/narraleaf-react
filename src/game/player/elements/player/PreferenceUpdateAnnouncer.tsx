import { useEffect } from "react";
import { usePreference } from "../../libElements";
import { GameState } from "@lib/game/nlcore/common/game";


/**
 * Carries `globalVolume` — and only `globalVolume` — from the preferences to the audio subsystem.
 *
 * The three *bus* volumes used to be pushed from here too, one `useEffect` each. They are gone, and
 * their absence is the point: `bgmVolume`/`soundVolume`/`voiceVolume` **are** the player's half of
 * the three seeded buses now, read straight through by `game.audioBuses`, so there is nothing left
 * to copy. Copying them from a mounted component is what broke the feature twice — the effects fire
 * on mount with whatever the preference happens to hold, which erased first the author's declared
 * mix and then a player override the host had restored a moment earlier. It also meant a preference
 * written while no player was mounted reached the graph only on the next mount.
 *
 * `globalVolume` stays because it is the master output rather than a bus — it has no declared half
 * and no gain node in the tree.
 */
export default function PreferenceUpdateAnnouncer({gameState}: Readonly<{gameState: GameState}>) {
    const audioManager = gameState.audioManager;
    const [globalVolume, setGlobalVolume] = usePreference("globalVolume");

    // Set the global volume to the initial volume
    useEffect(() => {
        setGlobalVolume(audioManager.getGlobalVolume());
    }, []);

    useEffect(() => {
        audioManager.setGlobalVolume(globalVolume);
    }, [globalVolume]);

    return null;
}
