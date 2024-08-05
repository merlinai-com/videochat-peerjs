// @ts-check

import { loginInit } from "./common.js";
import { elements, createRoomInit } from "./utils.js";

/** Initialisation after page load */
async function init() {
    if (elements.loginButton) loginInit(elements.loginButton);
    createRoomInit();
}

document.addEventListener("DOMContentLoaded", init);
