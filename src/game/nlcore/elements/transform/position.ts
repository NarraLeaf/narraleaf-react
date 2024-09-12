import {CSSProps} from "@core/elements/transition/type";

export enum CommonPositionType {
    Left,
    Center,
    Right,
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

export type Coord2DPosition = {
    x: number | `${"-" | ""}${number}%`;
    y: number | `${"-" | ""}${number}%`;
} & OffsetPosition;

export type AlignPosition = {
    xalign: number;
    yalign: number;
} & OffsetPosition;

export type OffsetPosition = {
    xoffset: number;
    yoffset: number;
}

export type D2Position<X = any, Y = any> = {
    x: UnknownAble<X>;
    y: UnknownAble<Y>;
    xoffset: UnknownAble<number>;
    yoffset: UnknownAble<number>;
}

export type Unknown = typeof PositionUtils.Unknown;
export type UnknownAble<T> = T | Unknown;

export class PositionUtils {
    static readonly Unknown: unique symbol = Symbol("Unknown");

    static isUnknown(arg: any): arg is typeof PositionUtils.Unknown {
        return arg === PositionUtils.Unknown;
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
            return `${pos}`;
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
}

export class CommonPosition implements IPosition {
    public static positions = CommonPositionType;
    readonly position: CommonPositionType;

    constructor(position: CommonPositionType) {
        this.position = position;
    }

    static isCommonPositionType(arg: any): arg is CommonPosition {
        return arg instanceof CommonPosition;
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
    readonly x: UnknownAble<Coord2DPosition["x"]>;
    readonly y: UnknownAble<Coord2DPosition["y"]>;
    readonly xoffset: UnknownAble<number>;
    readonly yoffset: UnknownAble<number>;

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
            this.x = arg0.x || PositionUtils.Unknown;
            this.y = arg0.y || PositionUtils.Unknown;
            this.xoffset = arg0.xoffset || PositionUtils.Unknown;
            this.yoffset = arg0.yoffset || PositionUtils.Unknown;
        } else {
            this.x = arg0 || PositionUtils.Unknown;
            this.y = y || PositionUtils.Unknown;
            this.xoffset = PositionUtils.Unknown;
            this.yoffset = PositionUtils.Unknown;
        }
    }

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
            x: (!PositionUtils.isUnknown(position.xalign)) ? `${position.xalign * 100}%` : PositionUtils.Unknown,
            y: (!PositionUtils.isUnknown(position.yalign)) ? `${position.yalign * 100}%` : PositionUtils.Unknown,
            xoffset: position.xoffset,
            yoffset: position.yoffset
        });
    }

    static merge(a: Coord2D, b: Coord2D): Coord2D {
        return new Coord2D({
            x: ((!PositionUtils.isUnknown(b.x)) ? b.x : a.x),
            y: ((!PositionUtils.isUnknown(b.y)) ? b.y : a.y),
            xoffset: ((!PositionUtils.isUnknown(b.xoffset)) ? b.xoffset : a.xoffset),
            yoffset: ((!PositionUtils.isUnknown(b.yoffset)) ? b.yoffset : a.yoffset),
        });
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
    readonly xalign: UnknownAble<number>;
    readonly yalign: UnknownAble<number>;
    readonly xoffset: UnknownAble<number>;
    readonly yoffset: UnknownAble<number>;

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
            this.xalign = arg0.xalign || PositionUtils.Unknown;
            this.yalign = arg0.yalign || PositionUtils.Unknown;
            this.xoffset = arg0.xoffset || PositionUtils.Unknown;
            this.yoffset = arg0.yoffset || PositionUtils.Unknown;
        } else {
            this.xalign = arg0 || PositionUtils.Unknown;
            this.yalign = yalign || PositionUtils.Unknown;
            this.xoffset = PositionUtils.Unknown;
            this.yoffset = PositionUtils.Unknown;
        }
    }

    static isAlignPosition(arg: any): arg is AlignPosition {
        return arg instanceof Align;
    }

    toCSS(): D2Position {
        return {
            x: (!PositionUtils.isUnknown(this.xalign)) ? `${this.xalign * 100}%` : this.xalign,
            y: (!PositionUtils.isUnknown(this.yalign)) ? `${this.yalign * 100}%` : this.yalign,
            xoffset: this.xoffset,
            yoffset: this.yoffset,
        };
    }
}

