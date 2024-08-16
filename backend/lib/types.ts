import type { User } from "sso";
import type {
    User as DbUser,
    GroupId,
    JsonSafe,
    Message,
    RecordingId,
    RoomId,
    UserId,
} from "./database.js";

export type UUID = ReturnType<typeof crypto.randomUUID>;
export type Email = `${string}@${string}.${string}`;
export type SignalId = `signal:${UUID}`;

const emailRegex = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

export function isEmail(email: string): email is Email {
    return emailRegex.test(email);
}

export function assertEmail(email: string): asserts email is Email {
    if (!isEmail(email))
        throw new Error(`Expected an email. Got ${JSON.stringify(email)}`);
}

export function isSignalId(id: string): id is SignalId {
    return id.startsWith("signal:");
}

export type RecordingEvent = (arg: {
    action: "start" | "stop";
    from: SignalId;
}) => void;

export interface RoomServerToClientEvents {
    /** WebRTC signalling */
    signal: (arg: {
        from: SignalId;
        desc?: RTCSessionDescription | null;
        candidate?: RTCIceCandidate | null;
    }) => void;

    /** A user connected */
    connect_to: (arg: { id: SignalId; polite: boolean }) => void;

    /** A user disconnected */
    disconnect_from: (arg: { id: SignalId }) => void;

    /** A recording should start or stop */
    recording: RecordingEvent;

    /** A screen share has started or stopped */
    screen_share: (arg: { user: SignalId; streamId?: string }) => void;

    /** An error occured */
    error: (message: string, cause?: keyof RoomClientToServerEvents) => void;
}

export interface RoomClientToServerEvents {
    /** WebRTC signalling */
    signal: (arg: {
        to: SignalId;
        desc?: RTCSessionDescription | null;
        candidate?: RTCIceCandidate | null;
    }) => void;

    /** Join a room */
    join_room: (id: JsonSafe<RoomId>) => void;

    /** Leave the current room */
    leave_room: () => void;

    /** A screen share has started or stopped */
    screen_share: (arg: { streamId?: string }) => void;

    /** Start or stop recording */
    recording: (arg: { action: "start" | "stop" }) => void;

    /** Start a recording */
    upload_start: (
        arg: { mimeType: string; is_screen: boolean },
        callback: (
            arg:
                | { id: JsonSafe<RecordingId>; error?: never }
                | { id?: never; error: string }
        ) => void
    ) => void;
    /** A chunk of a recording */
    upload_chunk: (id: JsonSafe<RecordingId>, data: ArrayBuffer) => void;
    /** Stop a recording */
    upload_stop: (id: JsonSafe<RecordingId>) => void;
}

export interface MessageServerToClientEvents {
    /** Some messages from the server */
    messages: (ms: JsonSafe<Message>[]) => void;

    /** Information about some users */
    users: (us: { id: JsonSafe<UserId>; name?: string }[]) => void;

    /** An error occured */
    error: (event: keyof MessageClientToServerEvents, error: string) => void;
}

export interface MessageClientToServerEvents {
    /** Subscribe to messages on a group */
    subscribe: (id: JsonSafe<GroupId>) => void;

    /** Request older messages from a group */
    request_messages: () => void;

    /** Request information about some users */
    request_users: (ids: JsonSafe<UserId>[]) => void;

    /** Send a message */
    send: (
        arg: { groupId: JsonSafe<GroupId>; content: string; msgId: UUID },
        ack: (error?: string) => void
    ) => void;
}

export interface InterServerEvents {}

export interface SocketData {
    ssoUser?: User;
    user?: DbUser;

    /** A UUID assigned to this user for the sake of signalling */
    signalId?: SignalId;
    /** The user's name */
    userName?: string;
    /** The id of the room the user is connected to */
    roomId?: RoomId;
}

export interface RoomSocketData extends SocketData {
    /** Which messages have been seen? Using client generated UUIDs */
    seenMessages?: Set<UUID>;

    /** The group the client is currently subscribed to */
    groupId?: GroupId;
}

export type Socket = import("socket.io-client").Socket<{}, {}>;
export type RoomSocket = import("socket.io-client").Socket<
    RoomServerToClientEvents,
    RoomClientToServerEvents
>;
export type MessageSocket = import("socket.io-client").Socket<
    MessageServerToClientEvents,
    MessageClientToServerEvents
>;

export type UserEvents = RoomServerToClientEvents;

export interface RoomEvents {
    join: (id: SignalId) => void;
    leave: (id: SignalId) => void;
    screen_share: (arg: { user: SignalId; streamId?: string }) => void;
    recording: RecordingEvent;
}

export interface GroupEvents {
    /** A message has been sent */
    message: (message: JsonSafe<Message>) => void;

    /** Information about a user has been updated */
    user: (id: JsonSafe<UserId>, name?: string) => void;
}

/** Upload events generated by the server */
export interface UploadEvents {
    start: (
        from: JsonSafe<UserId>,
        id: JsonSafe<RecordingId>,
        mimeType: string
    ) => void;
    chunk: (
        from: JsonSafe<UserId>,
        id: JsonSafe<RecordingId>,
        data: Buffer
    ) => void;
    stop: (from: JsonSafe<UserId>, id: JsonSafe<RecordingId>) => void;
}

export interface PublisherEvents {
    [key: SignalId]: UserEvents;
    [key: JsonSafe<RoomId>]: RoomEvents;
    [key: JsonSafe<GroupId>]: GroupEvents;
    upload: UploadEvents;
}
