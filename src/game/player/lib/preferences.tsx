import {StringKeyOf} from "@lib/util/data";
import { GamePreference } from "@lib/game/nlcore/gameTypes";
import React, {useEffect} from "react";
import {useGame} from "@player/provider/game-state";

/**
 * Custom hook for managing game preferences
 * @param key - Preference key to access/modify
 * @returns Tuple containing current preference value and setter function
 */
export function usePreference<K extends StringKeyOf<GamePreference>>(
    key: K
): [GamePreference[K], (value: GamePreference[K]) => void] {
    const game = useGame();
    const [currentValue, setCurrentValue] = React.useState(game.preference.getPreference(key));

    const setPreference = (value: GamePreference[K]) => {
        game.preference.setPreference(key, value);
        setCurrentValue(value);
    };

    useEffect(() => {
        return game.preference.onPreferenceChange(key, setCurrentValue).cancel;
    }, [key, game.preference, setCurrentValue]);

    return [currentValue, setPreference];
}


