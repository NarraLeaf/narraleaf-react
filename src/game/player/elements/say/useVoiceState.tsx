import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sound } from "@core/elements/sound";
import { SoundToken } from "@narraleaf/sound";
import { CharacterAction } from "@core/action/actions/characterAction";
import { GameState } from "@player/gameState";
import { useFlush } from "../../lib/flush";
import { useDialogContext } from "./context";
import { DialogState } from "./UIDialog";

export type VoiceState = {
    done: boolean;
    voice: Sound | null;
    playVoice: (voice?: Sound | string | URL | null) => Promise<SoundToken | null>;
    getVoice: () => Sound | null;
    getVoiceId: () => string | number | null;
    getVoiceSrc: () => string | null;
};

export function useVoiceState(): VoiceState {
    const dialog = useDialogContext();
    const [flush] = useFlush(dialog.deps);
    const [autoDone, setAutoDone] = useState(true);
    const [manualDone, setManualDone] = useState(true);
    const manualTokenRef = useRef<SoundToken | null>(null);
    const gameState = dialog.config.gameState;
    const sentence = dialog.config.action.sentence;
    const voiceId = sentence?.config.voiceId ?? null;

    useEffect(() => {
        return dialog.events.on(DialogState.Events.onFlush, () => {
            flush();
        }).cancel;
    }, [dialog]);

    const voice = useMemo(() => {
        if (!sentence) {
            return null;
        }
        try {
            return CharacterAction.getVoice(gameState, sentence);
        } catch {
            return null;
        }
    }, [gameState, sentence, voiceId, sentence?.config.voice]);

    useEffect(() => {
        manualTokenRef.current = null;
        setManualDone(true);
    }, [sentence]);

    useEffect(() => {
        let cancelled = false;
        let currentToken: SoundToken | null = null;
        let offEnded: (() => void) | null = null;
        let offStop: (() => void) | null = null;

        if (!voice) {
            setAutoDone(true);
            return;
        }

        setAutoDone(false);

        const markDone = () => {
            if (!cancelled) {
                setAutoDone(true);
            }
        };

        currentToken = gameState.audioManager.getToken(voice);
        if (currentToken) {
            if (!currentToken.isPlaying()) {
                setAutoDone(true);
            }
            offEnded = () => markDone();
            offStop = () => markDone();
            currentToken.once("ended", offEnded);
            currentToken.once("stop", offStop);
        }

        const lineEndToken = gameState.events.on(GameState.EventTypes["event:state.player.lineEnd"], () => {
            markDone();
        });

        return () => {
            cancelled = true;
            lineEndToken.cancel();
            if (currentToken && offEnded) {
                currentToken.off("ended", offEnded);
            }
            if (currentToken && offStop) {
                currentToken.off("stop", offStop);
            }
        };
    }, [gameState, voice]);

    const playVoice = useCallback(async (input?: Sound | string | URL | null) => {
        const target = input ?? voice;
        if (!target) {
            setManualDone(true);
            return null;
        }

        if (manualTokenRef.current?.isPlaying()) {
            manualTokenRef.current.stop();
        }

        setManualDone(false);

        const resolved = target instanceof URL
            ? Sound.voice(target.toString())
            : typeof target === "string"
                ? Sound.voice(target)
                : target;

        const token = await gameState.getLiveGame().playSound(resolved);
        manualTokenRef.current = token;

        const markDone = () => {
            setManualDone(true);
        };
        token.once("ended", markDone);
        token.once("stop", markDone);

        return token;
    }, [gameState, voice]);

    const getVoice = useCallback(() => voice, [voice]);
    const getVoiceId = useCallback(() => voiceId, [voiceId]);
    const getVoiceSrc = useCallback(() => voice?.getSrc() ?? null, [voice]);

    return {
        done: autoDone && manualDone,
        voice,
        playVoice,
        getVoice,
        getVoiceId,
        getVoiceSrc,
    };
}
