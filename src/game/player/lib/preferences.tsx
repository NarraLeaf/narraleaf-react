import {StringKeyOf} from "@lib/util/data";
import {GamePreference} from "@core/game";
import React, {useEffect} from "react";
import {useGame} from "@player/provider/game-state";

export function usePreference<K extends StringKeyOf<GamePreference>>(
    key: K
): [GamePreference[K], (value: GamePreference[K]) => void] {
    const {game} = useGame();
    const [currentValue, setCurrentValue] = React.useState(game.preference.getPreference(key));

    const setPreference = (value: GamePreference[K]) => {
        game.preference.setPreference(key, value);
        setCurrentValue(value);
    };

    useEffect(() => {
        return game.preference.onPreferenceChange(key, setCurrentValue).cancel;
    }, []);

    return [currentValue, setPreference];
}


