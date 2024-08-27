import { optionsStore, read } from "./stores";

export class AudioEngine<T extends string | symbol> {
    elements: Record<T, HTMLAudioElement>;

    constructor(
        tracks: Record<T, (URL | string)[] | URL | string>,
        parent?: HTMLElement
    ) {
        this.elements = {} as Record<T, HTMLAudioElement>;
        parent ??= document.body;
        for (const track in tracks) {
            let existing = document.getElementById(`audio-track-${track}`);
            if (existing) {
                if (!(existing instanceof HTMLAudioElement)) {
                    console.debug(existing);
                    throw new Error(
                        `Element audio-track-${track} is not an audio element`
                    );
                }
                this.elements[track] = existing;
                continue;
            }

            const audio = document.createElement("audio");
            audio.id = `audio-track-${track}`;
            this.elements[track] = audio;

            if (Array.isArray(tracks[track]) && tracks[track].length === 0)
                console.warn(`No source specified for track ${track}`);

            for (const url of [tracks[track]].flat()) {
                const source = document.createElement("source");
                source.src = url.toString();
                audio.appendChild(source);
            }

            parent.appendChild(audio);
        }
    }

    /** Play a track, resolves once the track has finished playing */
    async play(track: T): Promise<void> {
        const opts = read(optionsStore);
        if (!opts.playSoundOnMessage) return;

        const audio = this.elements[track];
        await audio.play();

        return new Promise(async (resolve, reject) => {
            const onEnded = () => {
                audio.removeEventListener("ended", onEnded);
                audio.removeEventListener("error", onError);
                resolve();
            };
            const onError = (event: ErrorEvent) => {
                audio.addEventListener("ended", onEnded);
                audio.addEventListener("error", onError);
                reject(event.error);
            };
            audio.addEventListener("ended", onEnded);
            audio.addEventListener("error", onError);
        });
    }
}
