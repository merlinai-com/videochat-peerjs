import {
    Action,
    Emitter,
    ResponseError,
    Surreal,
    UUID as SurrealUUID,
} from "surrealdb.js";
import { RecordId } from "surrealdb.js";
import type { SignalId, UUID } from "./types.js";

export type UserId = RecordId<"user">;
export type User = {
    id: UserId;
    sso_id?: string;
    name?: string;
};

export type AttachmentId = RecordId<"attachment">;
export type Attachment = {
    name: string;
    group: GroupId;
};

export type MessageId = RecordId<"message">;
export type Message<A extends Attachment | AttachmentId = AttachmentId> = {
    id: MessageId;
    in: UserId;
    out: UserId;
    content: string;
    attachment?: A;
    sent_time: Date;
};

export type RecordingId = RecordId<"recording">;
export type Recording = {
    id: RecordingId;
    user?: UserId;
    userName?: string;
    mimeType: string;
    startTime: Date;
};

export type RoomId = RecordId<"room">;
export type Room<
    G extends Group | GroupId = GroupId,
    R extends Recording | RecordingId = RecordingId
> = {
    id: RoomId;
    group: G;
    recordings: R[];
    owner: UserId;
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
    : T extends [...infer TS]
    ? { [K in keyof TS]: JsonSafe<TS[K]> }
    : T extends object
    ? { [K in keyof T]: JsonSafe<T[K]> }
    : T;

export function get(
    env: Record<string, string | undefined>,
    v: string
): string {
    if (env[v] === undefined) {
        throw new Error(`$${v} must be set`);
    }
    return env[v];
}

export class Database extends Emitter<{ user: [Action, User] }> {
    /** The surreal database */
    surreal: Surreal;
    /** The live queries */
    live: {
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
        const surreal = new Surreal();
        if (!building) {
            await surreal.connect(get(env, "DATABASE_ENDPOINT"), {
                namespace: get(env, "DATABASE_NAMESPACE"),
                database: get(env, "DATABASE_DATABASE"),
                auth: {
                    namespace: get(env, "DATABASE_NAMESPACE"),
                    database: get(env, "DATABASE_DATABASE"),
                    username: get(env, "DATABASE_USER"),
                    password: get(env, "DATABASE_PASS"),
                },
            });
        }

        const db = new Database(surreal);

        if (!building)
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
        else return new RecordId(tb, id);
    }

    static jsonSafe<T>(val: T): JsonSafe<T> {
        // @ts-ignore-start
        if (val === null) return null;
        // @ts-ignore
        if (val instanceof RecordId) return `${val.tb}:${val.id}`;
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

    async run<T>(func: string, ...args: any[]): Promise<T> {
        const res = await this.surreal.run<T>(func, args);
        return Database.convert(res);
    }

    async fetchAll(ids: UserId[]): Promise<User[]>;
    async fetchAll(ids: RecordId[]): Promise<any[]> {
        return await this.run("fn::fetchAll", ids);
    }

    async exists(id: RecordId): Promise<boolean> {
        return await this.run("fn::exists", id);
    }

    async createUser(): Promise<User> {
        return await this.run("fn::createUser");
    }

    /** Get or create a user with an SSO id */
    async getSsoUser(sso_id: string, create: boolean = false): Promise<User> {
        return await this.run("fn::getSsoUser", sso_id, create);
    }

    async setUserName(user: UserId, name?: string): Promise<void> {
        return await this.run("fn::setUserName", user, name);
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

    async sendMessage(
        from: UserId,
        to: GroupId,
        content: string,
        attachment?: AttachmentId
    ): Promise<Message> {
        return await this.run("fn::sendMessage", from, to, content, attachment);
    }

    async getMessages(group: GroupId): Promise<Message[]> {
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

    /**
     * @param owner The signal ID of the owner of this recording
     */
    async createRecording(args: {
        user: UserId | undefined;
        owner: SignalId;
        userName: string | undefined;
        mimeType: string;
        room: RoomId;
    }): Promise<RecordingId> {
        return await this.run(
            "fn::createRecording",
            args.user,
            SurrealUUID.parse(args.owner.replace("signal:", "")),
            args.userName,
            args.mimeType,
            args.room
        );
    }

    async isRecordingOwner(
        owner: SignalId,
        recording: RecordingId
    ): Promise<string | null> {
        return await this.run(
            "fn::isRecordingOwner",
            SurrealUUID.parse(owner.replace("signal:", "")),
            recording
        );
    }

    async finishRecording(
        owner: SignalId,
        recording: RecordingId
    ): Promise<void> {
        await this.run(
            "fn::finishRecording",
            SurrealUUID.parse(owner.replace("signal:", "")),
            recording
        );
    }
}
