import { useState } from "react";


export function useConstant<T>(fn: () => T): T {
    const [value] = useState<T>(fn);
    return value;
}
