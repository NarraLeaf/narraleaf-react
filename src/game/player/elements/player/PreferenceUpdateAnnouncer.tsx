import { useEffect } from "react";
import { usePreference } from "../../libElements";
import { SoundType } from "@lib/game/nlcore/elements/sound";
import { GameState } from "@lib/game/nlcore/common/game";


export default function PreferenceUpdateAnnouncer({gameState}: Readonly<{gameState: GameState}>) {
    const audioManager = gameState.audioManager;
    const [voiceVolume] = usePreference("voiceVolume");
    const [bgmVolume] = usePreference("bgmVolume");
    const [soundVolume] = usePreference("soundVolume");
    const [musicVolume] = usePreference("musicVolume");

    useEffect(() => {
        audioManager.setGroupVolume(SoundType.Voice, voiceVolume);
    }, [voiceVolume]);

    useEffect(() => {
        audioManager.setGroupVolume(SoundType.Bgm, bgmVolume);
    }, [bgmVolume]);

    useEffect(() => {
        audioManager.setGroupVolume(SoundType.Sound, soundVolume);
    }, [soundVolume]);

    useEffect(() => {
        audioManager.setGroupVolume(SoundType.Music, musicVolume);
    }, [musicVolume]);

    return null;
}
