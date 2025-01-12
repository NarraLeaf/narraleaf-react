import React, {useEffect, useState} from "react";

export function useFlush(deps?: React.DependencyList): [
    () => void,
    number
] {
    const [count, setCount] = useState<number>(0);

    useEffect(() => {
        update();
    }, deps ?? []);

    function update() {
        setCount((count) => count + 1);
    }

    return [update, count];
}
