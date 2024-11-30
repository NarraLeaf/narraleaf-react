import type {Game} from "@core/game";
import React from "react";

export class Logger {
    private game: Game;
    private readonly prefix: string | undefined;

    constructor(game: Game, prefix?: string) {
        this.game = game;
        this.prefix = prefix;
    }

    log(tag: string, ...args: any[]) {
        if (this.game.config.app.logger.log) {
            console.log(...this.colorLog("gray", tag, ...args));
        }
    }

    info(tag: string, ...args: any[]) {
        if (this.game.config.app.logger.info) {
            console.info(...this._log(tag, ...args));
        }
    }

    warn(tag: string, ...args: any[]) {
        if (this.game.config.app.logger.warn) {
            console.warn(...this._log(tag, ...args));
        }
    }

    error(tag: string, ...args: any[]) {
        if (this.game.config.app.logger.error) {
            console.error(...this._log(tag, ...args));
        }
    }

    debug(tag: string, ...args: any[]) {
        if (this.game.config.app.logger.debug) {
            console.debug(...this.colorLog("gray", tag, ...args));
        }
    }

    trace(tag: string, ...args: any[]) {
        if (this.game.config.app.logger.trace) {
            console.trace(this._log(tag, ...args));
        }
    }

    weakWarn(tag: string, ...args: any[]) {
        if (this.game.config.app.logger.warn) {
            console.log(...this.colorLog("yellow", tag, ...args));
        }
    }

    group(tag: string, collapsed = false) {
        const groupTag = this._log(tag).join(" ");
        if (this.game.config.app.logger.info) {
            if (collapsed) {
                console.groupCollapsed(groupTag);
            } else {
                console.group(groupTag);
            }
        }
        return {
            end: () => {
                if (this.game.config.app.logger.info) {
                    console.groupEnd();
                }
            }
        };
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