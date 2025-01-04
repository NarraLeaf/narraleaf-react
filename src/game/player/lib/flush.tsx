import React, {useEffect, useReducer} from "react";

export function useFlush(deps: React.DependencyList = []): [
    () => void,
    number
] {
    const [count, update] = useReducer(x => x + 1, 0);

    useEffect(() => {
        update();
    }, deps);

    return [update, count];
}
