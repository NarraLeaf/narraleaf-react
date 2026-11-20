/**
 * What a step waiting on the stack has said about being skipped.
 *
 * Skipping is a request the step answers, not something done to it: the dialog, a displayable, a
 * user service each decide for themselves how to finish when the player asks them to hurry. Most of
 * them answer by finishing. A gate is for the answer that is not an action - "you cannot skip past
 * me" - which has to be readable by whoever is doing the asking, so that a fast-forward stops at the
 * step instead of asking again until it gives up.
 *
 * The gate is looked up by the awaitable the stack is waiting on. A step whose awaitable is wrapped
 * before it reaches the stack (an action forwarding its element's awaitable) attaches the same gate
 * to the wrapper.
 *
 * The text given with a refusal is for people - a log line, a developer tool. Nothing in the engine
 * reads it to decide anything.
 * @internal
 */
export class SkipGate {
    private static readonly gates = new WeakMap<object, SkipGate>();

    public static of(awaitable: object): SkipGate | null {
        return SkipGate.gates.get(awaitable) ?? null;
    }

    public static attach(awaitable: object, gate: SkipGate): void {
        SkipGate.gates.set(awaitable, gate);
    }

    /** Every refusal still standing, oldest first. */
    private readonly refusals: { message: string | undefined }[] = [];

    /**
     * Refuse to be skipped until the returned function is called. Refusals stack: the gate opens
     * once every one of them has been released.
     */
    public refuse(message?: string): () => void {
        const refusal = { message };
        this.refusals.push(refusal);
        return () => {
            const index = this.refusals.indexOf(refusal);
            if (index !== -1) {
                this.refusals.splice(index, 1);
            }
        };
    }

    public isRefused(): boolean {
        return this.refusals.length > 0;
    }

    /** The text of the newest refusal still standing, if it gave one. */
    public getRefusal(): string | undefined {
        return this.refusals[this.refusals.length - 1]?.message;
    }
}
