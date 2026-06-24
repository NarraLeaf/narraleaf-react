"use client";

import React, {useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState} from "react";
import {debounce} from "@lib/util/data";

export type FixedAspectRatioContainerHandle = {
    requestUpdate: () => void;
};

export type FixedAspectRatioMetrics = {
    width: number;
    height: number;
    scale: number;
    containerWidth: number;
    containerHeight: number;
};

export type FixedAspectRatioContainerProps = {
    aspectRatio: number;
    baseWidth: number;
    minWidth?: number;
    minHeight?: number;
    debounceMs?: number;
    className?: string;
    style?: React.CSSProperties;
    id?: string;
    dataAttributes?: Record<string, string>;
    onUpdate?: (metrics: FixedAspectRatioMetrics) => void;
    children: React.ReactNode;
};

const DEFAULT_DEBOUNCE_MS = 50;

const outerStyle: React.CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "hidden",
};

const innerBaseStyle: React.CSSProperties = {
    margin: "auto",
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
};

function buildDataAttributes(dataAttributes?: Record<string, string>) {
    if (!dataAttributes) {
        return {};
    }

    return Object.entries(dataAttributes).reduce((acc, [key, value]) => {
        acc[`data-${key}`] = value;
        return acc;
    }, {} as Record<string, string>);
}

function clamp(value: number, min?: number) {
    if (min === undefined || min === null) {
        return value;
    }
    return Math.max(value, min);
}

function computeDimensions(containerWidth: number, containerHeight: number, aspectRatio: number) {
    if (containerWidth <= 0 || containerHeight <= 0 || aspectRatio <= 0) {
        return {
            width: containerWidth,
            height: containerHeight,
        };
    }

    if (containerWidth / containerHeight > aspectRatio) {
        return {
            width: containerHeight * aspectRatio,
            height: containerHeight,
        };
    }

    return {
        width: containerWidth,
        height: containerWidth / aspectRatio,
    };
}

const FixedAspectRatioContainer = React.forwardRef<FixedAspectRatioContainerHandle, FixedAspectRatioContainerProps>(
    function FixedAspectRatioContainer(
        {
            aspectRatio,
            baseWidth,
            minWidth,
            minHeight,
            debounceMs,
            className,
            style,
            id,
            dataAttributes,
            onUpdate,
            children,
        }: FixedAspectRatioContainerProps,
        forwardedRef) {
        const containerRef = useRef<HTMLDivElement | null>(null);
        const [innerStyle, setInnerStyle] = useState<React.CSSProperties>({
            ...innerBaseStyle,
            width: "0px",
            height: "0px",
        });
        const onUpdateRef = useRef<FixedAspectRatioContainerProps["onUpdate"]>(onUpdate);
        const lastDimensionsRef = useRef<{ width: number; height: number } | null>(null);

        useEffect(() => {
            onUpdateRef.current = onUpdate;
        }, [onUpdate]);

        const handleUpdate = useCallback(() => {
            const container = containerRef.current;
            if (!container) {
                return;
            }

            const containerWidth = container.clientWidth;
            const containerHeight = container.clientHeight;
            if (containerWidth <= 0 || containerHeight <= 0 || aspectRatio <= 0) {
                return;
            }

            const rawDimensions = computeDimensions(containerWidth, containerHeight, aspectRatio);
            const width = clamp(rawDimensions.width, minWidth);
            const height = clamp(rawDimensions.height, minHeight);

            const lastDimensions = lastDimensionsRef.current;
            if (!lastDimensions || lastDimensions.width !== width || lastDimensions.height !== height) {
                lastDimensionsRef.current = { width, height };
                setInnerStyle({
                    ...innerBaseStyle,
                    width: `${width}px`,
                    height: `${height}px`,
                });
            }

            const scale = baseWidth > 0 ? width / baseWidth : 1;
            onUpdateRef.current?.({
                width,
                height,
                scale,
                containerWidth,
                containerHeight,
            });
        }, [aspectRatio, baseWidth, minWidth, minHeight]);

        const debouncedUpdate = useMemo(() => debounce(handleUpdate, typeof debounceMs === "number" ? debounceMs : DEFAULT_DEBOUNCE_MS), [
            handleUpdate,
            debounceMs,
        ]);

        useEffect(() => {
            handleUpdate();
        }, [handleUpdate]);

        useEffect(() => {
            const observer = new ResizeObserver(() => {
                debouncedUpdate();
            });

            if (containerRef.current) {
                observer.observe(containerRef.current);
            }

            const onResize = () => {
                debouncedUpdate();
            };
            window.addEventListener("resize", onResize);

            return () => {
                observer.disconnect();
                window.removeEventListener("resize", onResize);
            };
        }, [debouncedUpdate]);

        useImperativeHandle(forwardedRef, () => ({
            requestUpdate: handleUpdate,
        }), [handleUpdate]);

        const dataProps = useMemo(() => buildDataAttributes(dataAttributes), [dataAttributes]);

        return (
            <div
                id={id}
                ref={containerRef}
                style={outerStyle}
                {...dataProps}
            >
                <div className={className} style={{...innerStyle, ...style}}>
                    {children}
                </div>
            </div>
        );
    });

export default FixedAspectRatioContainer;

export {FixedAspectRatioContainer};
