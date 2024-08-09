import { AsyncQueue } from "./build/backend/queue.js";

let q = new AsyncQueue([1, 2, 3]);

async function logAll() {
    for await (const val of q) {
        console.log("Value is", val);
    }
}

logAll();

function pushTime(time) {
    setTimeout(() => q.push(time), time);
}

pushTime(1000);
pushTime(1000);
pushTime(2000);
pushTime(3000);
