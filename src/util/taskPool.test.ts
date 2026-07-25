import { describe, expect, it, vi } from "vitest";
import { TaskPool } from "@lib/util/data";

/**
 * `delay` paces consecutive batches. A trailing sleep after the final batch is pure latency, and
 * the initial preload pass — which this pool runs — gates the first painted frame.
 */
describe("TaskPool pacing", () => {
    it("does not sleep after the final batch", async () => {
        vi.useFakeTimers();
        try {
            const pool = new TaskPool(2, 1000);
            const ran: number[] = [];
            for (let i = 0; i < 2; i += 1) {
                pool.addTask(async () => {
                    ran.push(i);
                });
            }

            let settled = false;
            void pool.start().then(() => {
                settled = true;
            });

            // A single batch: no timer should be pending, so draining microtasks alone finishes it.
            await vi.advanceTimersByTimeAsync(0);
            expect(ran).toEqual([0, 1]);
            expect(settled).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it("still paces between batches", async () => {
        vi.useFakeTimers();
        try {
            const pool = new TaskPool(2, 1000);
            const ran: number[] = [];
            for (let i = 0; i < 4; i += 1) {
                pool.addTask(async () => {
                    ran.push(i);
                });
            }

            let settled = false;
            void pool.start().then(() => {
                settled = true;
            });

            await vi.advanceTimersByTimeAsync(0);
            expect(ran).toEqual([0, 1]);
            expect(settled).toBe(false);

            await vi.advanceTimersByTimeAsync(1000);
            expect(ran).toEqual([0, 1, 2, 3]);
            expect(settled).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it("resolves immediately when there is nothing queued", async () => {
        vi.useFakeTimers();
        try {
            const pool = new TaskPool(5, 5000);
            let settled = false;
            void pool.start().then(() => {
                settled = true;
            });
            await vi.advanceTimersByTimeAsync(0);
            expect(settled).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it("reports the queued size", () => {
        const pool = new TaskPool(2, 0);
        expect(pool.size).toBe(0);
        pool.addTask(async () => void 0);
        expect(pool.size).toBe(1);
    });
});
