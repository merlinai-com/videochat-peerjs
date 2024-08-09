import { ResponseError, Surreal, UUID as SurrealUUID } from "surrealdb.js";
import { RecordId } from "surrealdb.js";
import type { Email, UUID } from "./types.js";

export type UserId = RecordId<"user">;
export type User = {
    id: UserId;
    email: Email;
    current_id?: UUID;
};

export type AttachmentId = RecordId<"attachment">;
export type Attachment = {
    name: string;
    group: GroupId;
};

export type MessageId = RecordId<"message">;
export type Message<
    I extends User | UserId = UserId,
    O extends User | UserId = UserId,
    A extends Attachment | AttachmentId = AttachmentId
> = {
    id: MessageId;
    in: I;
    out: O;
    content: string;
    attachment?: A;
    sent_time: Date;
};

export type RecordingId = RecordId<"recording">;
export type Recording<U extends User | UserId = UserId> = {
    id: RecordingId;
    user?: U;
    userName?: string;
    mimeType: string;
    startTime: Date;
};

export type RoomId = RecordId<"room">;
export type Room<
    O extends User | UserId = UserId,
    R extends Recording | RecordingId = RecordingId
> = {
    id: RoomId;
    name: string;
    owner: O;
    users: UserId[];
    recordings: R[];
};

export type GroupId = RecordId<"group">;
export type Group<O extends User | UserId> = (
    | { type: "p2p"; name?: string; owner?: O }
    | { type: "group"; name: string; owner: O }
) & { messages: MessageId[] };

export type UserExtraId = RecordId<"user_extra">;
export type UserExtra = {
    id: UserExtraId;
    user: User;
    in: (GroupId | RoomId)[];
};

function get(env: Record<string, string | undefined>, v: string): string {
    if (env[v] === undefined) {
        throw new Error(`$${v} must be set`);
    }
    return env[v];
}

export class Database {
    db: Surreal;

    private constructor(db: Surreal) {
        this.db = db;
    }

    static async init(
        env: Record<string, string | undefined>,
        building?: boolean
    ): Promise<Database> {
        const db = new Surreal();
        if (!building) {
            await db.connect(get(env, "DATABASE_ENDPOINT"), {
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
        return new Database(db);
    }

    static convert<T>(data: T): T {
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

    async run<T>(func: string, ...args: any[]): Promise<T> {
        // console.log(func, ...args);
        const res = await this.db.run<T>(func, args);
        return Database.convert(res);
    }

    async getUserExtra(email: Email): Promise<UserExtra | null> {
        try {
            return await this.run<UserExtra | null>("fn::getUserExtra", email);
        } catch (err) {
            if (
                err instanceof ResponseError &&
                err.message.includes("User not found")
            )
                return null;
            else throw err;
        }
    }

    async getUserByCurrentId(id: UUID): Promise<User | null> {
        return await this.run("fn::getUserByCurrentId", id);
    }

    async sendMessage(
        from: Email,
        to: Email,
        content: string
    ): Promise<ResponseError | undefined> {
        try {
            await this.run("fn::sendMessage", from, to, content);
        } catch (err) {
            if (
                err instanceof ResponseError &&
                err.message.includes("User not found")
            )
                return err;
            else throw err;
        }
    }

    async getContacts(
        email: Email
    ): Promise<{ sent_to: (User | Room)[]; recv_from: User[] }> {
        return await this.run("fn::getContacts", email);
    }

    // async getMessages

    async createRoom(name: string, owner: Email): Promise<RoomId> {
        return await this.run("fn::createRoom", name, owner);
    }

    async queryRoom(id: string): Promise<Room<User, Recording> | undefined> {
        return await this.run("fn::queryRoom", new RecordId("room", id));
    }

    async joinRoom(email: Email, id: UUID, room: RoomId) {
        await this.run("fn::joinRoom", email, id, room);
    }

    async createRecording(
        user: UserId | undefined,
        owner: UUID,
        userName: string | undefined,
        mimeType: string,
        room: RoomId
    ): Promise<RecordingId> {
        return await this.run(
            "fn::createRecording",
            user,
            owner,
            userName,
            mimeType,
            room
        );
    }

    async isRecordingOwner(
        user: UUID,
        recording: RecordingId
    ): Promise<string | null> {
        return await this.run("fn::isRecordingOwner", user, recording);
    }

    async finishRecording(user: UUID, recording: RecordingId): Promise<void> {
        await this.run("fn::finishRecording", user, recording);
    }
}
