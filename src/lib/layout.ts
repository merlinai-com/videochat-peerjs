function sum(xs: number[]): number {
    return xs.reduce((x, y) => x + y, 0);
}

/**
 * Find the best layout for the given videos.
 *
 * Aspect ratio is always width / height.
 */
export function findBestLayout(
    client: { width: number; height: number },
    videos: { aspectRatio?: number }[]
): { rows: number; cols: number } {
    const count = videos.length;
    const clientAspectRatio = client.width / client.height;

    let best = { rows: 1, cols: videos.length, score: Infinity };
    for (let rows = 1; rows <= videos.length; rows++) {
        /** The minimum number of columns to fit all videos */
        const cols = Math.ceil(count / rows);

        /** The aspect ratio of each video */
        const aspectRatio = clientAspectRatio * (rows / cols);

        /** The score */
        let score = sum(
            videos.map((video) =>
                video.aspectRatio != undefined
                    ? Math.abs(video.aspectRatio - aspectRatio)
                    : 0
            )
        );

        const empty = rows * cols - count;
        score += empty * aspectRatio;

        if (score < best.score) best = { rows, cols, score };
    }

    return best;
}
