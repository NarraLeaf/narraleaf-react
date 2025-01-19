import {CSSProps} from "@core/elements/transition/type";

export enum CommonPositionType {
    Left = "left",
    Center = "center",
    Right = "right",
}

export const CommonPositions = {
    [CommonPositionType.Left]: "33.33%",
    [CommonPositionType.Center]: "50%",
    [CommonPositionType.Right]: "66.66%",
} as {
    [key in CommonPositionType]: `${number}%`;
};

export interface IPosition {
    toCSS(): D2Position;
}

/**@internal */
export type Coord2DPosition = {
    x: number | `${"-" | ""}${number}%`;
    y: number | `${"-" | ""}${number}%`;
} & Partial<OffsetPosition>;

/**@internal */
export type AlignPosition = {
    xalign: number;
    yalign: number;
} & Partial<OffsetPosition>;

/**@internal */
export type OffsetPosition = {
    xoffset: number;
    yoffset: number;
}

/**@internal */
export type D2Position<X = any, Y = any> = {
    x: UnknownAble<X>;
    y: UnknownAble<Y>;
    xoffset: UnknownAble<number>;
    yoffset: UnknownAble<number>;
}

/**@internal */
export type RawPosition = CommonPositionType
    | (Coord2DPosition & { xalign?: never; yalign?: never })
    | (AlignPosition & { x?: never; y?: never });

type Unknown = typeof PositionUtils.Unknown;
type UnknownAble<T> = T | Unknown;

/**@internal */
export class PositionUtils {
    static readonly Unknown: unique symbol = Symbol("Unknown");

    static isUnknown(arg: any): arg is typeof PositionUtils.Unknown {
        return arg === PositionUtils.Unknown;
    }

    static D2PositionToCSS(pos: D2Position, invertX = false, invertY = false): CSSProps {
        const posY = this.calc(pos.y, pos.yoffset);
        const posX = this.calc(pos.x, pos.xoffset);
        const yRes = invertY ? {bottom: posY} : {top: posY};
        const xRes = invertX ? {right: posX} : {left: posX};
        return this.wrap({
            ...yRes,
            ...xRes,
        });
    }

    static calc(pos: number | string, offset?: UnknownAble<number>): string {
        if (!pos || PositionUtils.isUnknown(pos)) {
            return "auto";
        }
        if (offset === undefined || PositionUtils.isUnknown(offset)) {
            return `calc(${pos} + 0px)`;
        }
        const left = typeof pos === "number" ? `${pos}px` : pos;
        return `calc(${left} + ${offset}px)`;
    }

    static toCoord2D(pos: IPosition | D2Position): Coord2D {
        if (CommonPosition.isCommonPositionType(pos)) {
            return Coord2D.fromCommonPosition(pos);
        } else if (Coord2D.isCoord2DPosition(pos)) {
            return pos;
        } else if (Align.isAlignPosition(pos)) {
            return Coord2D.fromAlignPosition(pos);
        } else if (typeof pos === "object"
            && ["x", "y", "xoffset", "yoffset"].some(key => key in pos)) {
            const position = pos as D2Position;
            return new Coord2D(position);
        } else {
            throw new Error("Invalid position type");
        }
    }

    static orUnknown<T>(arg: T | UnknownAble<T> | undefined): T | Unknown {
        return (PositionUtils.isUnknown(arg) || arg === undefined) ? PositionUtils.Unknown : arg;
    }

    static mergePosition(a: IPosition, b: IPosition): Coord2D {
        const aPos = this.toCoord2D(a);
        const bPos = this.toCoord2D(b);
        return Coord2D.merge(aPos, bPos);
    }

    static serializePosition(pos: IPosition): D2Position {
        const coord = this.toCoord2D(pos);
        return {
            x: PositionUtils.isUnknown(coord.x) ? 0 : coord.x,
            y: PositionUtils.isUnknown(coord.y) ? 0 : coord.y,
            xoffset: PositionUtils.isUnknown(coord.xoffset) ? 0 : coord.xoffset,
            yoffset: PositionUtils.isUnknown(coord.yoffset) ? 0 : coord.yoffset,
        };
    }

    static isRawCommonPositionType(arg: any): arg is CommonPositionType {
        return Object.values(CommonPositionType).includes(arg);
    }

    static isRawCoord2DPosition(arg: any): arg is Coord2DPosition {
        return typeof arg === "object" && (
            "x" in arg || "y" in arg || "xoffset" in arg || "yoffset" in arg
        );
    }

    static isRawAlignPosition(arg: any): arg is AlignPosition {
        return typeof arg === "object" && (
            "xalign" in arg || "yalign" in arg || "xoffset" in arg || "yoffset" in arg
        );
    }

    static isRawPosition(arg: any): arg is RawPosition {
        return this.isRawCommonPositionType(arg) || this.isRawCoord2DPosition(arg) || this.isRawAlignPosition(arg);
    }

    static isPosition(arg: any): arg is IPosition {
        return arg instanceof CommonPosition || arg instanceof Coord2D || arg instanceof Align;
    }

    static rawPositionToCoord2D(arg: any): Coord2D {
        if (this.isRawCommonPositionType(arg)) {
            return Coord2D.fromCommonPosition(new CommonPosition(arg));
        } else if (this.isRawCoord2DPosition(arg)) {
            return new Coord2D(arg);
        } else if (this.isRawAlignPosition(arg)) {
            return Coord2D.fromAlignPosition(arg);
        }
        throw new Error("Invalid position type");
    }

    static tryParsePosition(arg: any): IPosition {
        if (this.isPosition(arg)) {
            return arg;
        }
        if (this.isRawPosition(arg)) {
            return this.rawPositionToCoord2D(arg);
        }
        throw new Error("Invalid position type");
    }

    static wrap(def: CSSProps): CSSProps {
        return {
            left: "auto",
            top: "auto",
            right: "auto",
            bottom: "auto",
            ...def,
        };
    }
}

export class CommonPosition implements IPosition {
    public static Positions = CommonPositionType;

    static isCommonPositionType(arg: any): arg is CommonPosition {
        return arg instanceof CommonPosition;
    }

    readonly position: CommonPositionType;

    /**
     * Create a new CommonPosition instance
     * @example
     * ```ts
     * new CommonPosition(CommonPosition.Positions.Center);
     * new CommonPosition("center");
     * ```
     */
    constructor(position: CommonPositionType) {
        this.position = position;
    }

    toCSS(): D2Position {
        return {
            x: CommonPositions[this.position],
            y: "50%",
            xoffset: 0,
            yoffset: 0,
        };
    }
}

export class Coord2D implements IPosition {
    static isCoord2DPosition(arg: any): arg is Coord2D {
        return arg instanceof Coord2D;
    }

    static fromCommonPosition(position: CommonPosition): Coord2D {
        return new Coord2D({
            x: CommonPositions[position.position],
            y: "50%",
        });
    }

    static fromAlignPosition(position: AlignPosition): Coord2D {
        return new Coord2D({
            x: (PositionUtils.isUnknown(position.xalign)) ? PositionUtils.Unknown : `${position.xalign * 100}%`,
            y: (PositionUtils.isUnknown(position.yalign)) ? PositionUtils.Unknown : `${position.yalign * 100}%`,
            xoffset: position.xoffset,
            yoffset: position.yoffset
        });
    }

    static merge(a: Coord2D, b: Coord2D): Coord2D {
        return new Coord2D({
            x: ((PositionUtils.isUnknown(b.x)) ? a.x : b.x),
            y: ((PositionUtils.isUnknown(b.y)) ? a.y : b.y),
            xoffset: ((PositionUtils.isUnknown(b.xoffset)) ? a.xoffset : b.xoffset),
            yoffset: ((PositionUtils.isUnknown(b.yoffset)) ? a.yoffset : b.yoffset),
        });
    }

    readonly x: UnknownAble<Coord2DPosition["x"]>;
    readonly y: UnknownAble<Coord2DPosition["y"]>;
    readonly xoffset: UnknownAble<number>;
    readonly yoffset: UnknownAble<number>;

    /**
     * Create a new Coord2D instance
     * @example
     * ```ts
     * new Coord2D("50%", "50%");
     * new Coord2D({x: 1280, y: "50%"});
     * new Coord2D({x: 1280, y: "-50%", xoffset: 10, yoffset: 20});
     * ```
     */
    constructor(arg0: {
        x?: UnknownAble<Coord2DPosition["x"]>;
        y?: UnknownAble<Coord2DPosition["y"]>;
        xoffset?: UnknownAble<number>;
        yoffset?: UnknownAble<number>;
    });

    constructor(x: UnknownAble<Coord2DPosition["x"]>, y: UnknownAble<Coord2DPosition["y"]>);

    constructor(arg0: {
        x?: UnknownAble<Coord2DPosition["x"]>;
        y?: UnknownAble<Coord2DPosition["y"]>;
        xoffset?: UnknownAble<number>;
        yoffset?: UnknownAble<number>;
    } | UnknownAble<Coord2DPosition["x"]>, y?: UnknownAble<Coord2DPosition["y"]>) {
        if (typeof arg0 === "object") {
            this.x = PositionUtils.orUnknown<Coord2DPosition["x"]>(arg0.x);
            this.y = PositionUtils.orUnknown<Coord2DPosition["y"]>(arg0.y);
            this.xoffset = PositionUtils.orUnknown<number>(arg0.xoffset);
            this.yoffset = PositionUtils.orUnknown<number>(arg0.yoffset);
        } else {
            this.x = PositionUtils.orUnknown<Coord2DPosition["x"]>(arg0);
            this.y = PositionUtils.orUnknown<Coord2DPosition["y"]>(y);
            this.xoffset = PositionUtils.Unknown;
            this.yoffset = PositionUtils.Unknown;
        }
    }

    toCSS(): D2Position<Coord2DPosition["x"], Coord2DPosition["y"]> {
        return {
            x: this.x,
            y: this.y,
            xoffset: this.xoffset,
            yoffset: this.yoffset,
        };
    }
}

export class Align implements IPosition {

    static isAlignPosition(arg: any): arg is AlignPosition {
        return arg instanceof Align;
    }

    readonly xalign: UnknownAble<number>;
    readonly yalign: UnknownAble<number>;
    readonly xoffset: UnknownAble<number>;
    readonly yoffset: UnknownAble<number>;

    /**
     * Create a new Align instance
     * @example
     * ```ts
     * new Align(0.5, 0.5);
     * new Align({xalign: 0.25, yalign: 0.5});
     * new Align({xalign: 0.25, yalign: 0.5, xoffset: 10, yoffset: 20});
     * ```
     */
    constructor(xalign?: UnknownAble<number>, yalign?: UnknownAble<number>);

    constructor(arg0: {
        xalign?: UnknownAble<number>;
        yalign?: UnknownAble<number>;
        xoffset?: UnknownAble<number>;
        yoffset?: UnknownAble<number>;
    });

    constructor(arg0?: {
        xalign?: UnknownAble<number>;
        yalign?: UnknownAble<number>;
        xoffset?: UnknownAble<number>;
        yoffset?: UnknownAble<number>;
    } | UnknownAble<number>, yalign?: UnknownAble<number>) {
        if (typeof arg0 === "object") {
            this.xalign = PositionUtils.orUnknown<number>(arg0.xalign);
            this.yalign = PositionUtils.orUnknown<number>(arg0.yalign);
            this.xoffset = PositionUtils.orUnknown<number>(arg0.xoffset);
            this.yoffset = PositionUtils.orUnknown<number>(arg0.yoffset);
        } else {
            this.xalign = PositionUtils.orUnknown<number>(arg0);
            this.yalign = PositionUtils.orUnknown<number>(yalign);
            this.xoffset = PositionUtils.Unknown;
            this.yoffset = PositionUtils.Unknown;
        }
    }

    toCSS(): D2Position {
        return {
            x: (PositionUtils.isUnknown(this.xalign)) ? this.xalign : `${this.xalign * 100}%`,
            y: (PositionUtils.isUnknown(this.yalign)) ? this.yalign : `${this.yalign * 100}%`,
            xoffset: this.xoffset,
            yoffset: this.yoffset,
        };
    }
}

