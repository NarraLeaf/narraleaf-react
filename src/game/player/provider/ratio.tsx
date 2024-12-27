"use client";

import React, {createContext, useContext, useEffect, useReducer, useState} from "react";
import {EventDispatcher} from "@lib/util/data";

/**@internal */
export type AspectRatioState = {
    width: number;
    height: number;
    minWidth: number;
    minHeight: number;
    paused: boolean;
    scale: number;
};

type AspectRatioEvents = {
    "event:aspectRatio.update": [width: number, height: number];
    "event:aspectRatio.pause": [];
    "event:aspectRatio.resume": [];
    "event:aspectRatio.requestUpdate": [];
};

class AspectRatio {
    static EventTypes: { [K in keyof AspectRatioEvents]: K } = {
        "event:aspectRatio.update": "event:aspectRatio.update",
        "event:aspectRatio.pause": "event:aspectRatio.pause",
        "event:aspectRatio.resume": "event:aspectRatio.resume",
        "event:aspectRatio.requestUpdate": "event:aspectRatio.requestUpdate",
    };
    state: AspectRatioState = {
        width: 0,
        height: 0,
        minWidth: 800,
        minHeight: 450,
        paused: false,
        scale: 0,
    };

    public readonly events = new EventDispatcher<AspectRatioEvents>();
    private lockers: symbol[] = [];
    private updater: (() => void) | null = null;

    constructor() {
    }

    update(width: number, height: number, scale: number) {
        this.state.width = width;
        this.state.height = height;
        this.state.scale = scale;
        this.events.emit(AspectRatio.EventTypes["event:aspectRatio.update"], width, height);
    }

    updateMin(width: number, height: number) {
        this.state.minWidth = width;
        this.state.minHeight = height;
    }

    lock() {
        const locker = Symbol();
        this.lockers.push(locker);
        return locker;
    }

    unlock(locker: symbol | null | undefined) {
        if (locker && (!this.lockers.includes(locker))) {
            throw new Error("Locker not found");
        }
        this.lockers = this.lockers.filter((l) => l !== locker);
        this.triggerUpdate();
        return null;
    }

    isLocked() {
        return !!this.lockers.length;
    }

    getStyle() {
        return {
            width: `${this.state.width}px`,
            height: `${this.state.height}px`,
        };
    }

    setUpdate(updater: () => void) {
        this.updater = updater;
    }

    pause() {
        this.state.paused = true;
        this.events.emit(AspectRatio.EventTypes["event:aspectRatio.pause"]);
    }

    resume() {
        this.state.paused = false;
        this.events.emit(AspectRatio.EventTypes["event:aspectRatio.resume"]);
    }

    onUpdate(callback: (width: number, height: number) => void) {
        this.events.on(AspectRatio.EventTypes["event:aspectRatio.update"], callback);
        return () => {
            this.events.off(AspectRatio.EventTypes["event:aspectRatio.update"], callback);
        };
    }

    requestUpdate() {
        this.events.emit(AspectRatio.EventTypes["event:aspectRatio.requestUpdate"]);
    }

    onRequestedUpdate(callback: () => void) {
        this.events.on(AspectRatio.EventTypes["event:aspectRatio.requestUpdate"], callback);
        return () => {
            this.events.off(AspectRatio.EventTypes["event:aspectRatio.requestUpdate"], callback);
        };
    }

    private triggerUpdate() {
        if (this.updater) {
            this.updater();
        }
    }
}

const RatioContext = createContext<null | { ratio: AspectRatio }>(null);

/**@internal */
export function RatioProvider({children}: {
    children: React.ReactNode
}) {
    const [ratio] = useState(() => new AspectRatio());

    return (
        <RatioContext.Provider value={{ratio}}>
            {children}
        </RatioContext.Provider>
    );
}

/**@internal */
export function useRatio(): { ratio: AspectRatio } {
    const context = useContext(RatioContext);
    if (!RatioContext || !context) throw new Error("useRatio must be used within a RatioProvider");

    const [, forceUpdate] = useReducer((x) => x + 1, 0);
    const {ratio} = context;

    useEffect(() => {
        return ratio.onUpdate(() => {
            forceUpdate();
        });
    }, []);

    return context;
}

