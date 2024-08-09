import { ResponseError, Surreal, UUID as SurrealUUID } from "surrealdb.js";
import { RecordId } from "surrealdb.js";
import type { UUID } from "./types.js";

export type UserId = RecordId<"user">;
export type User = {
    id: UserId;
    email: string;
    current_id?: UUID;
};

export type MessageId = RecordId<"message">;
export type Message<
    I extends User | UserId = UserId,
    O extends User | UserId = UserId
> = {
    id: MessageId;
    in: I;
    out: O;
    content: string;
    sent_time: Date;
};

export type UserExtraId = RecordId<"user_extra">;
export type UserExtra<U extends User | UserId = UserId> = {
    id: UserExtraId;
    user: U;
    sent_to: UserId[];
    recv_from: UserId[];
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

    async createUser(email: string): Promise<void> {
        await this.run("fn::createUser", email);
    }

    async getUserExtra(email: string): Promise<UserExtra<User> | null> {
        try {
            return await this.run<UserExtra<User> | null>(
                "fn::getUserExtra",
                email
            );
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
        from: string,
        to: string,
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

    // async getMessages

    async createRoom(name: string, owner: string): Promise<RoomId> {
        return await this.run("fn::createRoom", name, owner);
    }

    async queryRoom(id: string): Promise<Room<User, Recording> | undefined> {
        return await this.run("fn::queryRoom", new RecordId("room", id));
    }

    async joinRoom(email: string, id: UUID, room: RoomId) {
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
