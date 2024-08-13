interface EventMap {
    [id: string | symbol | number]: any;
}

export type Listeners<Id extends keyof E, E extends EventMap> = {
    [ev in keyof E[Id]]?: E[Id][ev];
};

export class Subscriber<Id extends keyof E, E extends EventMap> {
    pub: Publisher<E>;
    id: Id;
    listeners: {
        [ev in keyof E[Id]]?: Set<E[Id][ev]>;
    };

    constructor(pub: Publisher<E>, id: Id, listeners?: Listeners<Id, E>) {
        this.pub = pub;
        this.id = id;
        this.listeners = {};
        if (listeners) {
            for (const ev in listeners) {
                this.listeners[ev] = new Set([listeners[ev]]);
            }
        }
    }

    unsubscribe() {
        this.pub._unsubscribe(this);
    }

    /** Add an event listener */
    on<Ev extends keyof E[Id]>(ev: Ev, callback: E[Id][Ev]) {
        this.listeners[ev] ??= new Set();
        this.listeners[ev].add(callback);
    }

    /** Remove an event listener */
    off<Ev extends keyof E[Id]>(ev: Ev, callback: E[Id][Ev]) {
        if (this.listeners[ev]) this.listeners[ev].delete(callback);
    }

    _emit<Ev extends keyof E[Id]>(ev: Ev, ...message: Parameters<E[Id][Ev]>) {
        if (this.listeners[ev]) {
            for (const listener of this.listeners[ev]) {
                try {
                    listener(...message);
                } catch (err) {
                    console.error(
                        `Listener for ${this.id.toString()} threw an error:`,
                        err
                    );
                }
            }
        }
    }

    publish<Ev extends keyof E[Id]>(ev: Ev, ...message: Parameters<E[Id][Ev]>) {
        this.pub.publish(this.id, ev, ...message);
    }
}

export class Publisher<E extends EventMap> {
    private subs: {
        [id in keyof E]?: Set<Subscriber<id, E>>;
    };

    constructor() {
        this.subs = {};
    }

    _getSubsFor<Id extends keyof E>(id: Id): Set<Subscriber<Id, E>> {
        this.subs[id] ??= new Set();
        return this.subs[id];
    }

    subscribe<Id extends keyof E>(
        id: Id,
        listeners?: Listeners<Id, E>
    ): Subscriber<Id, E> {
        const sub = new Subscriber(this, id, listeners);
        this._getSubsFor(id).add(sub);
        return sub;
    }

    _unsubscribe(sub: Subscriber<keyof E, E>) {
        const subs = this._getSubsFor(sub.id);
        subs.delete(sub);
        if (subs.size === 0) delete this.subs[sub.id];
    }

    publish<Id extends keyof E, Ev extends keyof E[Id]>(
        id: Id,
        ev: Ev,
        ...message: Parameters<E[Id][Ev]>
    ) {
        setImmediate(() => {
            const subs = this.subs[id];
            if (!subs) return;
            for (const sub of subs) {
                sub._emit(ev, ...message);
            }
        });
    }
}
