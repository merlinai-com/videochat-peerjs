/** A queue of values */
export class Queue<T> {
    private array: (T | undefined)[] = [];
    private start = 0;
    length = 0;

    constructor(values?: Iterable<T>) {
        if (values) {
            this.array = [...values];
            this.length = this.array.length;
        }
    }

    private get nextWrite(): number {
        if (this.start + this.length >= this.array.length) {
            return this.start + this.length - this.array.length;
        } else {
            return this.start + this.length;
        }
    }

    private contiguousRanges(): { start: number; stop: number }[] {
        if (this.start + this.length <= this.array.length) {
            return [{ start: this.start, stop: this.start + this.length }];
        } else {
            return [
                { start: this.start, stop: this.array.length },
                {
                    start: 0,
                    stop: this.length - (this.array.length - this.start),
                },
            ];
        }
    }

    private ensureExtraCapacity(newCap: number) {
        if (newCap > this.array.length) {
            const array = new Array<T | undefined>(
                Math.max(this.array.length * 2, newCap)
            );
            let index = 0;
            for (const { start, stop } of this.contiguousRanges()) {
                for (let i = start; i < stop; i++, index++) {
                    array[index] = this.array[i];
                }
            }
            this.array = array;
            this.start = 0;
        }
    }

    /** Append a value without reallocating */
    private _push(val: T) {
        this.array[this.nextWrite] = val;
        this.length += 1;
    }

    push(...vals: T[]) {
        this.ensureExtraCapacity(this.length + vals.length);
        for (const val of vals) {
            this._push(val);
        }
    }

    pop(): T | undefined {
        if (this.length === 0) {
            return undefined;
        } else {
            const val = this.array[this.start];
            this.array[this.start] = undefined;
            this.length -= 1;
            this.start += 1;
            if (this.start === this.array.length) this.start = 0;
            return val;
        }
    }

    [Symbol.iterator](): Iterator<T> {
        return (function* (queue: Queue<T>) {
            while (queue.length > 0) {
                yield queue.pop()!;
            }
        })(this);
    }
}

/** A queue that can read and write asynchronously */
export class AsyncQueue<T> extends Queue<T> {
    private popQueue = new Queue<(val: T) => void>();

    /** Push values synchronously */
    push(...vals: T[]) {
        const claimed = vals.slice(0, this.popQueue.length);
        const toPush = vals.slice(this.popQueue.length);

        for (const val of claimed) {
            const callback = this.popQueue.pop()!;
            callback(val);
        }
        Queue.prototype.push.apply(this, toPush);
    }

    /** Pop a value */
    asyncPop(signal?: AbortSignal): Promise<T> {
        return new Promise((resolve, reject) => {
            if (signal?.aborted) reject(signal.reason);

            if (this.length > 0) {
                resolve(this.pop()!);
            } else {
                if (signal) {
                    const onabort = () => {
                        reject(signal.reason);
                    };
                    signal.addEventListener("abort", onabort);
                    this.popQueue.push((val) => {
                        signal.removeEventListener("abort", onabort);
                        resolve(val);
                    });
                } else {
                    this.popQueue.push(resolve);
                }
            }
        });
    }

    [Symbol.asyncIterator](): AsyncIterator<T> {
        return (async function* (queue: AsyncQueue<T>) {
            while (true) {
                yield await queue.asyncPop();
            }
        })(this);
    }

    private async _consume(
        cb: (val: T, signal?: AbortSignal) => void | Promise<void>,
        signal?: AbortSignal
    ) {
        while (true) {
            signal?.throwIfAborted();
            const val = await this.asyncPop(signal);
            await cb(val, signal);
        }
    }

    /**
     * Asynchronously consume a queue.
     *
     * If opts.workers is 1, then the queue is consumed in order
     * (i.e. waiting for each callback to finish before getting the next value)
     *
     * At most opts.workers values are processed at once.
     */
    async consume(
        cb: (val: T, signal?: AbortSignal) => void | Promise<void>,
        opts?: {
            /** The maximum number of workers to user. Default: 1 */
            workers?: number;
            /** The signal used to abort the operation */
            signal?: AbortSignal;
        }
    ) {
        const tasks = [];
        for (let i = 0; i < (opts?.workers ?? 1); i++) {
            tasks.push(this._consume(cb, opts?.signal));
        }
        await Promise.all(tasks);
    }
}
