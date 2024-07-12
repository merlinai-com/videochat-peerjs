// @ts-check

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @returns {import("sso").Cookies}
 */
function makeCookies(req, res) {
    return {
        get(cookie) {
            return req.cookies[cookie];
        },
        set(cookie) {
            res.cookie(cookie.name, cookie.value, cookie.attributes);
        },
    }
}

/**
 * @param {import("express").Request} req
 * @param {string} path
 */
export function getRedirectUrl(req, path) {
    return new URL(`${req.protocol}://${req.get("host")}${path}`);
}

/**
 * @param {import("sso").SSO} sso
 * @returns {import("express").RequestHandler}
 */
export function ssoMiddleware(sso) {
    return async (req, res, next) => {
        const fullUrl = new URL(`${req.protocol}://${req.get("host")}${req.originalUrl}`);
        const redirect = await sso.handleRedirect(fullUrl, makeCookies(req, res));
        switch (redirect.type) {
            case "redirect":
                return res.redirect(redirect.status, redirect.url.href);
            case "error":
                return res.status(redirect.status).send(redirect.message);
            case "ok":
                break;
        }

        const validate = await sso.validateSession(makeCookies(req, res));
        switch (validate.type) {
            case "redirect":
                return res.redirect(validate.status, validate.url.href);
            case "error":
                return res.status(validate.status).send(validate.message);
            case "ok":
                break;
        }

        req.locals ??= {};
        req.locals.user = validate.value.user;
        req.locals.session = validate.value.session;
        next();
    }
}
