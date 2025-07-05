import { KeyBindingValue } from "@lib/game/nlcore/game/keyMap";
import { KeyBindingType } from "@lib/game/nlcore/game/types";
import { useGame } from "@player/provider/game-state";
import { useEffect, useState } from "react";

export function useKeyBinding(type: KeyBindingType): [KeyBindingValue, (value: KeyBindingValue) => void] {
    const game = useGame();
    const [keyBinding, setCurrentKeyBinding] = useState(game.keyMap.getKeyBinding(type));

    const setKeyBinding = (value: KeyBindingValue) => {
        game.keyMap.setKeyBinding(type, value);
        setCurrentKeyBinding(value);
    };

    useEffect(() => {
        return game.keyMap.onKeyBindingChange(type, setCurrentKeyBinding).cancel;
    }, [type, game.keyMap, setCurrentKeyBinding]);

    return [keyBinding, setKeyBinding];
}
