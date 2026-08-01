import { useEffect } from "react";
import { usePreference } from "../../libElements";
import { DefaultAudioBusIds } from "@lib/game/nlcore/game/audioBus";
import { GameState } from "@lib/game/nlcore/common/game";


/**
 * The three volume preferences drive the three seeded buses.
 *
 * This is the whole of the alias: a preference is what a player's slider writes to, a bus is what
 * the audio graph reads, and one pushes into the other. Buses the host declared are not
 * preferences and are driven through `game.audioBuses` instead - `GamePreference` is a closed
 * object type and cannot grow a key per character.
 */
export default function PreferenceUpdateAnnouncer({gameState}: Readonly<{gameState: GameState}>) {
    const audioManager = gameState.audioManager;
    const [voiceVolume] = usePreference("voiceVolume");
    const [bgmVolume] = usePreference("bgmVolume");
    const [soundVolume] = usePreference("soundVolume");
    const [globalVolume, setGlobalVolume] = usePreference("globalVolume");

    // Set the global volume to the initial volume
    useEffect(() => {
        setGlobalVolume(audioManager.getGlobalVolume());
    }, []);

    useEffect(() => {
        audioManager.setBusVolume(DefaultAudioBusIds.voice, voiceVolume);
    }, [voiceVolume]);

    useEffect(() => {
        audioManager.setBusVolume(DefaultAudioBusIds.bgm, bgmVolume);
    }, [bgmVolume]);

    useEffect(() => {
        audioManager.setBusVolume(DefaultAudioBusIds.sound, soundVolume);
    }, [soundVolume]);

    useEffect(() => {
        audioManager.setGlobalVolume(globalVolume);
    }, [globalVolume]);

    return null;
}
