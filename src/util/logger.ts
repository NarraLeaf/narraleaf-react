import type {Game} from "@core/game";
import React from "react";
import {GameConfig} from "@core/gameTypes";

export class Logger {
    private game: Game;
    private readonly prefix: string | undefined;

    constructor(game: Game, prefix?: string) {
        this.game = game;
        this.prefix = prefix;
    }

    log(tag: string, ...args: any[]) {
        if (this.isEnabled("log")) {
            console.log(...this.colorLog("gray", tag, ...args));
        }
    }

    info(tag: string, ...args: any[]) {
        if (this.isEnabled("info")) {
            console.info(...this._log(tag, ...args));
        }
    }

    warn(tag: string, ...args: any[]) {
        if (this.isEnabled("warn")) {
            console.warn(...this._log(tag, ...args));
        }
    }

    error(tag: string, ...args: any[]) {
        if (this.isEnabled("error")) {
            console.error(...this._log(tag, ...args));
        }
    }

    debug(tag: string, ...args: any[]) {
        if (this.isEnabled("debug")) {
            console.debug(...this.colorLog("gray", tag, ...args));
        }
    }

    trace(tag: string, ...args: any[]) {
        if (this.isEnabled("trace")) {
            console.trace(this._log(tag, ...args));
        }
    }

    weakWarn(tag: string, ...args: any[]) {
        if (this.isEnabled("warn")) {
            console.log(...this.colorLog("yellow", tag, ...args));
        }
    }

    weakError(tag: string, ...args: any[]) {
        if (this.isEnabled("error")) {
            console.log(...this.colorLog("red", tag, ...args));
        }
    }

    verbose(tag: string, ...args: any[]) {
        if (this.isEnabled("verbose")) {
            console.log(...this.colorLog("gray", tag, ...args));
        }
    }

    group(tag: string, collapsed = false) {
        const groupTag = this._log(tag).join(" ");
        if (this.isEnabled("info")) {
            if (collapsed) {
                console.groupCollapsed(groupTag);
            } else {
                console.group(groupTag);
            }
        }
        return {
            end: () => {
                if (this.isEnabled("info")) {
                    console.groupEnd();
                }
            }
        };
    }

    private isEnabled(type: keyof Extract<GameConfig["app"]["logger"], object>) {
        return typeof this.game.config.app.logger === "boolean"
            ? this.game.config.app.logger
            : this.game.config.app.logger[type];
    }

    private _log(tag: string, ...args: any[]) {
        if (args.length === 0) {
            return [this.prefix || "", tag];
        } else {
            return [`${this.prefix || ""} [${tag}]`, ...args];
        }
    }

    private colorLog(color: React.CSSProperties["color"], tag: string, ...args: any[]) {
        if (args.length === 0) {
            return [`%c${this.prefix || ""} ${tag}`, `color: ${color}`];
        }
        const messages: string[] = [];
        const styles: string[] = [];
        const logArgs: any[] = [];

        if (this.prefix) {
            messages.push(`%c${this.prefix} [${tag}]`);
            styles.push(`color: ${color}`);
        } else {
            messages.push(`%c[${tag}]`);
            styles.push(`color: ${color}`);
        }

        args.forEach(arg => {
            if (typeof arg === "string") {
                messages.push(`%c${arg}`);
                styles.push(`color: ${color}`);
            } else {
                messages.push("%O");
                logArgs.push(arg);
                styles.push("");
            }
        });

        return [messages.join(" ")].concat(styles, logArgs);
    }
}