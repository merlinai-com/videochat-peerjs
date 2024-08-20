import type { EventsMap } from "@socket.io/component-emitter";
import type { EventEmitter } from "node:events";
import type { Namespace, Socket } from "socket.io";

function createClosure(
    closures: Map<(...args: any) => void, (...args: any) => void>,
    handler: (this: EventEmitter, event: string | symbol, error: any) => void,
    emitter: EventEmitter,
    event: string | symbol,
    listener: (...args: any) => void | PromiseLike<void>
): (...args: any) => void | PromiseLike<void> {
    let withErrorHandler = closures.get(listener);
    if (withErrorHandler) return withErrorHandler;
    withErrorHandler = (...args) => {
        try {
            const res = listener(...args);
            if (
                typeof res === "object" &&
                "then" in res &&
                typeof res.then === "function"
            ) {
                return res.then(undefined, (error) =>
                    handler.call(emitter, event, error)
                );
            } else {
                return res;
            }
        } catch (error) {
            handler.call(emitter, event, error);
        }
    };
    closures.set(listener, withErrorHandler);
    return withErrorHandler;
}

/**
 * A horrible hack to add error handling to an event emitter.
 * This catches synchronous and asynchronous errors on listeners registered after this function is called
 *
 * Patches the `on`, `off` and `once` functions.
 */
export function injectErrorHandler<
    Listen extends EventsMap,
    Emit extends EventsMap,
    Server extends EventsMap,
    Data
>(
    emitter: Socket<Listen, Emit, Server, Data>,
    handler: (this: typeof emitter, event: keyof Listen, error: any) => void
): void;
export function injectErrorHandler<
    Listen extends EventsMap,
    Emit extends EventsMap,
    Server extends EventsMap,
    Data
>(
    emitter: Namespace<Listen, Emit, Server, Data>,
    handler: (this: typeof emitter, event: keyof Listen, error: any) => void
): void;
export function injectErrorHandler<T extends Record<keyof T, any[]>>(
    emitter: EventEmitter<T>,
    handler: (this: typeof emitter, event: keyof T, error: any) => void
): void;
export function injectErrorHandler(
    emitter: EventEmitter,
    handler: (this: typeof emitter, event: string | symbol, error: any) => void
): void {
    const old = { on: emitter.on, off: emitter.off, once: emitter.once };
    const closures = new Map<(...args: any) => void, (...args: any) => void>();
    emitter.on = function (event, listener) {
        return old.on.call(
            this,
            event,
            createClosure(closures, handler, this, event, listener)
        );
    };
    emitter.off = function (event, listener) {
        const clos = closures.get(listener);
        if (clos) old.off.call(this, event, clos);
        closures.delete(listener);
        return this;
    };
    emitter.once = function (event, listener) {
        return old.once.call(
            this,
            event,
            createClosure(closures, handler, this, event, listener)
        );
    };
}

/** An error to show the user */
export class UserError extends Error {
    constructor(message: string) {
        super(message);
    }

    toString() {
        return this.message;
    }
}
