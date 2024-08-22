import { AsyncQueue, Queue } from "./build/backend/lib/queue.js";
import { sleep } from "./build/backend/lib/utils.js";

let q = new AsyncQueue([1, 2, 3]);

async function logAll() {
    for await (const val of q) {
        await sleep(400);
        console.log("Value is", val);
    }
}

logAll();

function pushTime(time) {
    setTimeout(() => q.push(time), time);
}

pushTime(500);
pushTime(500);
pushTime(1000);
pushTime(1000);
setTimeout(() => q.pushFront(1500), 1500);
