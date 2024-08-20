import { EventEmitter } from "node:events";
import { injectErrorHandler } from "./errorHandler.js";

interface ReservedEvents<ev extends Record<keyof ev, any>> {
    error: (event: keyof ev, error: any) => void;
    unsubscribe: () => void;
}

type EventMap<E> = {
    [key in keyof E]: any;
};

export type Listeners<Id extends keyof E, E extends EventMap<E>> = {
    [ev in keyof (E[Id] &
        ReservedEvents<E[Id]>)]?: ev extends keyof ReservedEvents<E[Id]>
        ? ReservedEvents<E[Id]>[ev]
        : E[Id][ev];
};

export class Subscriber<
    Id extends keyof E,
    E extends EventMap<E>
> extends EventEmitter<{
    [ev in keyof E[Id] & ReservedEvents<E[Id]>]: Parameters<
        ev extends keyof ReservedEvents<E[Id]>
            ? ReservedEvents<E[Id]>[ev]
            : E[Id][ev]
    >;
}> {
    pub: Publisher<E>;
    id: Id;

    constructor(pub: Publisher<E>, id: Id, listeners?: Listeners<Id, E>) {
        super();
        injectErrorHandler(this, function (event, error) {
            // @ts-ignore
            this.emit("error", event, error);
        });

        this.pub = pub;
        this.id = id;
        if (listeners) {
            for (const ev in listeners) {
                // @ts-ignore
                this.on(ev, listeners[ev]);
            }
        }
    }

    unsubscribe() {
        // @ts-ignore
        this.emit("unsubscribe");
        this.pub._unsubscribe(this);
    }

    /** Publish a message for this topic */
    publish<Ev extends keyof E[Id]>(ev: Ev, ...message: Parameters<E[Id][Ev]>) {
        this.pub.publish(this.id, ev, ...message);
    }
}

export class Publisher<E extends EventMap<E>> {
    private subs: {
        [id in keyof E]?: Set<Subscriber<id, E>>;
    };

    constructor() {
        this.subs = {};
    }

    private getSubsFor<Id extends keyof E>(id: Id): Set<Subscriber<Id, E>> {
        this.subs[id] ??= new Set();
        return this.subs[id];
    }

    /** Subscribe to a topic */
    subscribe<Id extends keyof E>(
        id: Id,
        listeners?: Listeners<Id, E>
    ): Subscriber<Id, E> {
        const sub = new Subscriber(this, id, listeners);
        this.getSubsFor(id).add(sub);
        return sub;
    }

    /** @private */
    _unsubscribe<Id extends keyof E>(sub: Subscriber<Id, E>) {
        const subs = this.getSubsFor(sub.id);
        subs.delete(sub);
        if (subs.size === 0) delete this.subs[sub.id];
    }

    /**
     * Publish a message to all subscriber for an id and event
     */
    publish<Id extends keyof E, Ev extends keyof E[Id]>(
        id: Id,
        ev: Ev,
        ...message: Parameters<E[Id][Ev]>
    ) {
        const subs = this.subs[id];
        if (!subs) return;
        for (const sub of subs) {
            // @ts-ignore
            sub.emit(ev, ...message);
        }
    }
}
