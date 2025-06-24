import { createContext, useContext } from "react";
import { HTMLMotionProps } from "motion/react";

export type AnimationProxyProps = HTMLMotionProps<"div">;
export type AnimationProxyContextType = {
    update: (props: AnimationProxyProps) => void;
};
export const AnimationProxyContext = createContext<AnimationProxyContextType | null>(null);

export function useAnimationProxy() {
    const context = useContext(AnimationProxyContext);
    if (!context) {
        throw new Error("useAnimationProxy must be used within a AnimationProxy");
    }
    return context;
}

