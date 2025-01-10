import {ElementProp, ITransition, TransitionEventTypes} from "@core/elements/transition/type";
import {useFlush} from "@player/lib/flush";
import {useEffect} from "react";
import {deepMerge} from "@lib/util/data";

export function Legacy_useTransition<T extends Element>(
    {
        transition,
        props
    }: Readonly<{ transition: ITransition | undefined, props: Record<string, any> }>
): [
    ElementProp<T>[]
] {
    const [flush] = useFlush();

    useEffect(() => {
        if (!transition) {
            return;
        }
        return transition.events.depends([
            transition.events.on(TransitionEventTypes.update, flush),
            transition.events.on(TransitionEventTypes.end, flush),
        ]).cancel;
    }, [transition]);

    return [
        (transition?.toElementProps() ?? [{}]).map((p) =>
            deepMerge<ElementProp<T>>({}, props, p)),
    ];
}

export function useTransition() {

}
