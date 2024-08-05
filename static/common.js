// @ts-check

/**
 * @template T
 * @param {string} id
 * @param {new (...args) => T} cls
 * @returns {T | null}
 */
export function getOptElementById(id, cls) {
    const el = document.getElementById(id);
    if (el && !(el instanceof cls))
        throw new Error(
            `Element ${id} is has the wrong class. Expected ${cls.name}, got ${el.constructor.name}`
        );
    return el;
}

/**
 * @template T
 * @param {string} id
 * @param {new (...args) => T} cls
 * @returns {T}
 */
export function getElementById(id, cls) {
    const el = getOptElementById(id, cls);
    if (el === null) throw new Error(`No element with id "${id}" exists`);
    return el;
}

/** Get a URL for a roomID/roomName
 * @param {string} roomID
 * @param {string} roomName
 */
export function getRoomURL(roomID, roomName) {
    const url = new URL("/room", window.location.origin);
    url.searchParams.delete("roomNotFound");
    url.searchParams.set("name", roomName);
    url.searchParams.set("room", roomID);
    return url.href;
}

/** @param {HTMLButtonElement} loginButton  */
export function loginInit(loginButton) {
    const loginUrl = loginButton.getAttribute("data-login-url");
    loginButton.addEventListener("click", async () => {
        try {
            // @ts-ignore
            await document.requestStorageAccessFor(new URL(loginUrl).origin);
        } catch (e) {
            console.error("Unable to request storage access:", e);
        } finally {
            window.location.pathname = "/auth/login";
        }
    });
}

export class RoomNotFound extends Error {
    /** @param {string} roomID  */
    constructor(roomID) {
        super(`Room not found: ${roomID}`);
        this.roomID = roomID;
    }
}
