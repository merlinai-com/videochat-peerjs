import { ensureEmit } from "$lib/socket";
import type { JsonSafe, RecordingId } from "backend/lib/database";
import { AsyncQueue } from "backend/lib/queue";
import type { RoomSocket } from "backend/lib/types";

export type ChunkedRecording = {
    data: Promise<ArrayBuffer>[];
    startTime: Date;
    id: JsonSafe<RecordingId>;
};

export interface RecordingHandler {
    start: (emit: boolean) => Promise<void>;
    stop: (emit: boolean) => Promise<void>;
}

const videoStore = "video";
const uploadInterval = 100;

// function initIndexedDb(): Promise<IDBDatabase> {
//     return new Promise((resolve, reject) => {
//         const request = indexedDB.open("recordings", 1);
//         request.addEventListener("success", () => resolve(request.result));
//         request.addEventListener("upgradeneeded", () => {
//             const db = request.result;
//             db.createObjectStore(videoStore, {
//                 keyPath: "id",
//             });
//             resolve(db);
//         });
//         request.addEventListener("error", () => reject(request.error));
//     });
// }

// function saveRecording(
//     db: IDBDatabase,
//     recording: ChunkedRecording
// ): Promise<void> {
//     return new Promise((resolve, reject) => {
//         const trans = db.transaction(videoStore, "readwrite");
//         const store = trans.objectStore(videoStore);
//         const req = store.add(recording);
//         req.addEventListener("success", () => resolve());
//         req.addEventListener("error", () => reject(req.error));
//     });
// }

export async function createRecordingHandler(
    socket: RoomSocket,
    streams: { local?: MediaStream; screen?: MediaStream },
    signal: AbortSignal,
    state: { recording: boolean },
    callbacks: {
        afterStart: () => void;
        afterStop: () => void;
    }
): Promise<RecordingHandler> {
    // TODO: choose codecs
    const videoMimeTypes = ["video/webm", "video/ogg"];
    const mimeType = videoMimeTypes.find(MediaRecorder.isTypeSupported);
    if (!mimeType) throw new Error("No support recorder MIME types");

    // const db = await initIndexedDb();
    let recordings: Record<JsonSafe<RecordingId>, ChunkedRecording> = {};

    let mediaRecorders = new Set<MediaRecorder>();

    const callbackQueue = new AsyncQueue<
        | {
              ev: "upload_chunk";
              id: JsonSafe<RecordingId>;
              data: Promise<ArrayBuffer>;
              index: number;
          }
        | { ev: "upload_stop"; id: JsonSafe<RecordingId>; count: number }
    >();
    callbackQueue
        .consume(
            async (val) => {
                if (val.ev === "upload_chunk") {
                    socket.emit(
                        "upload_chunk",
                        val.id,
                        await val.data,
                        val.index
                    );
                } else {
                    socket.emit("upload_stop", val.id, val.count);
                }
            },
            { signal }
        )
        .catch((error) => console.error("In upload queue handler:", error));

    const startRecorder = async (stream: MediaStream, is_screen: boolean) => {
        const { error, id } = await socket.emitWithAck("upload_start", {
            mimeType,
            is_screen,
        });
        if (error !== undefined) throw new Error(error);

        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorders.add(recorder);
        const currentRecording = {
            id,
            startTime: new Date(),
            data: [] as Promise<ArrayBuffer>[],
        };
        recordings[id] = currentRecording;

        recorder.addEventListener("dataavailable", (ev) => {
            if (ev.data.size > 0) {
                const data = ev.data.arrayBuffer();
                const len = currentRecording.data.push(data);
                callbackQueue.push({
                    ev: "upload_chunk",
                    id: currentRecording.id,
                    data,
                    index: len - 1,
                });
            }
        });
        recorder.addEventListener("stop", async () => {
            mediaRecorders.delete(recorder);
            // const recording = {
            //     id: currentRecording.id,
            //     startTime: currentRecording.startTime,
            //     blob: new Blob(currentRecording.blobs, {
            //         type: mimeType,
            //     }),
            // };
            callbackQueue.push({
                ev: "upload_stop",
                id: currentRecording.id,
                count: currentRecording.data.length,
            });
            // await saveRecording(db, recording);
        });
        recorder.start(uploadInterval);
    };

    const handlers: RecordingHandler = {
        async start(emit) {
            if (state.recording == true) return;
            state.recording = true;

            if (emit)
                await ensureEmit(socket, {}, "recording", { action: "start" });

            const promises = [];
            if (streams.local)
                promises.push(startRecorder(streams.local, false));
            if (streams.screen)
                promises.push(startRecorder(streams.screen, true));
            await Promise.all(promises);

            callbacks.afterStart();
        },

        async stop(emit) {
            if (emit && state.recording)
                await ensureEmit(socket, {}, "recording", { action: "stop" });

            for (const recorder of mediaRecorders) {
                recorder.stop();
            }

            state.recording = false;
            callbacks.afterStop();
        },
    };

    socket.on("request_upload_chunk", async (id, start, stop) => {
        const recording = recordings[id];
        if (!recording)
            throw new Error(
                `Unknown recording: ${id} - some data might have been lost`
            );

        callbackQueue.pushFront(
            ...recording.data.slice(start, stop).map((data, index) => ({
                ev: "upload_chunk" as const,
                id,
                data,
                index: index + start,
            }))
        );
    });

    window.Zap.$recordingHandlers = handlers;

    return handlers;
}
