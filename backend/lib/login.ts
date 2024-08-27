import { SSO } from "sso";
import { Database, type UserId } from "./database.js";
import { select } from "./utils.js";

export async function getUserNames(
    db: Database,
    sso: SSO,
    userIds: UserId[]
): Promise<{ id: UserId; name?: string }[]> {
    const names = [];
    const users = await db.selectAll(userIds);

    // Users with a nickname
    names.push(...select(users, "name"));

    /** Users with sso_id without name */
    const ssoNoNick = select(
        users.filter((user) => !user.name),
        "sso_id"
    );
    const userIdBySsoId = Object.fromEntries(
        ssoNoNick.map(({ sso_id, id }) => [sso_id, id])
    );
    const ssoUsers = await sso.getUsers({
        ids: ssoNoNick.map(({ sso_id }) => sso_id),
    });

    const ssoWithName = select(ssoUsers, "name").map(({ id, name }) => ({
        id: userIdBySsoId[id],
        name,
    }));
    names.push(...ssoWithName);

    return names;
}
