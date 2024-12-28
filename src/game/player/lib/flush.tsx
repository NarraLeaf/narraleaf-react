import {useReducer} from "react";

export function useFlush(): [
    () => void,
    number
] {
    const [count, update] = useReducer(x => x + 1, 0);
    return [update, count];
}
