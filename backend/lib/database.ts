import {
    Action,
    Emitter,
    RecordId,
    ResponseError,
    Surreal,
    UUID as SurrealUUID,
} from "surrealdb.js";
import type { UUID } from "./types.js";
import { get, sleep } from "./utils.js";

export type UserId = RecordId<"user">;
export type User = {
    id: UserId;
    sso_id?: string;
    name?: string;
    allow_recording: boolean;
};

export type AttachmentId = RecordId<"attachment">;
export type Attachment = {
    id: AttachmentId;
    file_id: UUID;
    name: string;
    mime_type: string;
    group: GroupId;
};

export type MessageId = RecordId<"message">;
export type Message<A extends Attachment | AttachmentId = AttachmentId> = {
    id: MessageId;
    in: UserId;
    out: GroupId;
    content: string;
    attachments: A[];
    sent_time: Date;
};

export type RecordingId = RecordId<"recording">;
export type Recording = {
    id: RecordingId;
    user: UserId;
    mimeType: string;
    startTime: Date;
    endTime?: Date;
    is_screen: boolean;
    file_id: UUID;
    group: GroupId;
};

export type RoomId = RecordId<"room">;
export type Room<
    G extends Group | GroupId = GroupId,
    R extends Recording | RecordingId = RecordingId,
    U extends User | UserId = UserId
> = {
    id: RoomId;
    group: G;
    recordings: R[];
    owner: UserId;
    users: U[];
};

export type P2PGroup = {
    id: GroupId;
    type: "p2p";
    name?: unknown;
    owner?: unknown;
    users: [UserId, UserId];
};

export type GroupGroup = {
    id: GroupId;
    type: "group";
    name: string;
    owner: UserId;
    users?: unknown;
};

export type GroupId = RecordId<"group">;
export type Group = P2PGroup | GroupGroup;

type RecordUUID<T> = T extends RecordId<infer Tb> ? `${Tb}:${UUID}` : never;

/** Replace {@link RecordId}s with {@link UUID} */
export type JsonSafe<T> = T extends RecordId
    ? RecordUUID<T>
    : T extends Date
    ? string
    : T extends [...infer TS]
    ? { [K in keyof TS]: JsonSafe<TS[K]> }
    : T extends object
    ? { [K in keyof T]: JsonSafe<T[K]> }
    : T;

export class Database extends Emitter<{ user: [Action, User] }> {
    /** The surreal database */
    private surreal: Surreal;
    /** The live queries */
    private live: {
        user?: SurrealUUID;
    };

    private constructor(surreal: Surreal) {
        super();
        this.surreal = surreal;
        this.live = {};
    }

    static async init(
        env: Record<string, string | undefined>,
        building?: boolean
    ): Promise<Database> {
        if (building) return new Database(undefined as unknown as Surreal);

        const surreal = new Surreal();
        const endpoint = new URL(get(env, "DATABASE_ENDPOINT"));

        await surreal.connect(endpoint, {
            namespace: get(env, "DATABASE_NAMESPACE"),
            database: get(env, "DATABASE_DATABASE"),
            auth: {
                namespace: get(env, "DATABASE_NAMESPACE"),
                database: get(env, "DATABASE_DATABASE"),
                username: get(env, "DATABASE_USER"),
                password: get(env, "DATABASE_PASS"),
            },
        });

        const db = new Database(surreal);

        db.live.user = await db.surreal.live<User>("user", (act, res) => {
            db.emit("user", [act, res]);
        });

        return db;
    }

    private static isUserNotFound(err: any): boolean {
        return (
            err instanceof ResponseError &&
            err.message.includes("User not found")
        );
    }

    private static convert<T>(data: T): T {
        if (data instanceof SurrealUUID) {
            // @ts-ignore
            return data.toString();
        } else if (typeof data === "object" && data !== null) {
            for (const key of Object.getOwnPropertyNames(data)) {
                // @ts-ignore
                data[key] = Database.convert(data[key]);
            }
            return data;
        } else {
            return data;
        }
    }

    static parseRecord<Tb extends string>(tb: Tb, id: string): RecordId<Tb> {
        if (id.startsWith(tb + ":"))
            return new RecordId(tb, id.slice(tb.length + 1));
        else if (id.includes(":"))
            throw new Error(`Invalid id for table ${tb}: ${id}`);
        else return new RecordId(tb, id);
    }

    static isRecord<Tb extends string>(tb: Tb, id: string): boolean {
        try {
            Database.parseRecord(tb, id);
            return true;
        } catch {
            return false;
        }
    }

    static jsonSafe<T>(val: T): JsonSafe<T> {
        // @ts-ignore-start
        if (val === null) return null;
        // @ts-ignore
        if (val instanceof RecordId) return `${val.tb}:${val.id}`;
        // @ts-ignore
        if (val instanceof Date) return val.toISOString();
        // @ts-ignore
        else if (Array.isArray(val)) return val.map(Database.jsonSafe);
        else if (typeof val === "object") {
            const safe = {};
            for (const key in val) {
                // @ts-ignore
                safe[key] = Database.jsonSafe(val[key]);
            }
            // @ts-ignore
            return safe;
            // @ts-ignore
        } else return val;
    }

    /**
     * Retry the transaction if the resource is busy.
     * Retries occur after a small random time to prevent simultaneous failed
     * transactions from failing again.
     */
    private async retryOnBusy<T>(
        f: (
            this: Database,
            options?: { signal?: AbortSignal }
        ) => T | PromiseLike<T>,
        options?: { signal?: AbortSignal }
    ): Promise<T> {
        while (true) {
            try {
                return await f.call(this, options);
            } catch (error) {
                if (
                    error instanceof ResponseError &&
                    error.message.includes("Resource busy")
                ) {
                    // Retry after 0-1ms
                    await sleep(Math.random(), options);
                    continue;
                } else {
                    throw error;
                }
            }
        }
    }

    async run<T>(func: string, ...args: any[]): Promise<T> {
        return await this.retryOnBusy(async function () {
            const res = await this.surreal.run<T>(func, args);
            return Database.convert(res);
        });
    }

    async select(id: RecordingId): Promise<Recording>;
    async select(id: AttachmentId): Promise<Attachment>;
    async select(id: UserId): Promise<User>;
    async select(id: RecordId): Promise<any> {
        return await this.retryOnBusy(async function () {
            return Database.convert(await this.surreal.select(id));
        });
    }

    async merge(id: UserId, data: Partial<User>): Promise<void>;
    async merge(id: RecordingId, data: Partial<Recording>): Promise<void>;
    async merge(id: RecordId, data: any): Promise<void> {
        return await this.retryOnBusy(async function () {
            await this.surreal.merge(id, data);
        });
    }

    async selectAll(ids: UserId[]): Promise<User[]>;
    async selectAll(ids: RecordId[]): Promise<any[]> {
        return await this.run("fn::fetchAll", ids);
    }

    async exists(id: RecordId): Promise<boolean> {
        return await this.run("fn::exists", id);
    }

    /** Get or create a user with an SSO id */
    async getUser(sso_id: string, create: true): Promise<User>;
    async getUser(sso_id: string, create?: boolean): Promise<User | undefined>;
    async getUser(
        sso_id: string,
        create: boolean = false
    ): Promise<User | undefined> {
        return await this.run("fn::getSsoUser", sso_id, create);
    }

    async setUserName(user: UserId, name?: string): Promise<void> {
        return await this.run("fn::setUserName", user, name);
    }

    async migrateUser(dest: UserId, src: UserId): Promise<void> {
        await this.run("fn::migrateUser", dest, src);
    }

    async getGroups(user: UserId): Promise<Group[] | null> {
        try {
            const { groups } = await this.run<{ groups: Group[] }>(
                "fn::getGroups",
                user
            );
            return groups;
        } catch (err) {
            if (Database.isUserNotFound(err)) return null;
            else throw err;
        }
    }

    async getOrCreateP2PGroup(user1: UserId, user2: UserId): Promise<GroupId> {
        return await this.run("fn::getOrCreateP2PGroup", user1, user2);
    }

    async createAttachment(
        file_id: UUID,
        name: string,
        mimeType: string,
        group: GroupId
    ): Promise<AttachmentId> {
        return await this.run(
            "fn::createAttachment",
            SurrealUUID.parse(file_id),
            name,
            mimeType,
            group
        );
    }

    async sendMessage(
        from: UserId,
        to: GroupId,
        content: string,
        attachment: AttachmentId[],
        system: boolean
    ): Promise<Message<Attachment>> {
        return await this.run(
            "fn::sendMessage",
            from,
            to,
            content,
            attachment,
            system
        );
    }

    async getMessages(group: GroupId): Promise<Message<Attachment>[]> {
        return await this.run("fn::getMessages", group);
    }

    async createGroup(name: string, owner: UserId): Promise<Group> {
        return await this.run("fn::createGroup", name, owner);
    }

    async queryGroup(id: GroupId): Promise<Group> {
        return await this.run("fn::queryGroup", id);
    }

    async joinGroup(group: GroupId, user: UserId) {
        await this.run("fn::joinGroup", group, user);
    }

    async createRoom(group: GroupId, owner: UserId): Promise<RoomId> {
        return await this.run("fn::createRoom", group, owner);
    }

    async queryRoom(id: RoomId): Promise<Room<Group, Recording> | undefined> {
        return await this.run("fn::queryRoom", id);
    }

    async joinRoom(room: RoomId, user: UserId): Promise<void> {
        await this.run("fn::joinRoom", room, user);
    }

    async leaveRoom(room: RoomId, user: UserId): Promise<void> {
        await this.run("fn::leaveRoom", room, user);
    }

    /**
     * @param owner The signal ID of the owner of this recording
     */
    async createRecording(args: {
        user: UserId;
        mimeType: string;
        room: RoomId;
        is_screen: boolean;
        startTime: Date;
    }): Promise<RecordingId> {
        return await this.run(
            "fn::createRecording",
            args.user,
            args.mimeType,
            args.room,
            args.is_screen
        );
    }

    async isRecordingOwner(
        owner: UserId,
        recording: RecordingId
    ): Promise<boolean> {
        return await this.run("fn::isRecordingOwner", owner, recording);
    }

    async finishRecording(recording: RecordingId): Promise<void> {
        await this.merge(recording, { endTime: new Date() });
    }
}
