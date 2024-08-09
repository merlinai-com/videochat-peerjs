-- A user. This is safe to share with any users who have exchanged messages
-- since the user's email is required to send a message
DEFINE TABLE user SCHEMAFULL TYPE NORMAL;
-- The user's email
DEFINE FIELD email ON user TYPE string
    ASSERT string::is::email($value);
-- Set to the room the user is currently connected to
DEFINE FIELD current_room ON user TYPE option<record<room>>;
DEFINE INDEX user__email ON user FIELDS email UNIQUE;
DEFINE INDEX user__current_id ON user FIELDS current_id;


-- An attachment to a message
DEFINE TABLE attachment SCHEMAFULL TYPE NORMAL;
-- The file name
DEFINE FIELD name ON attachment TYPE string;
-- The group this was originally shared in
DEFINE FIELD group ON attachment TYPE record<group>;


-- A message
DEFINE TABLE message SCHEMAFULL TYPE RELATION FROM user TO group;
-- The message content
DEFINE FIELD content ON message TYPE string;
-- The attachment
DEFINE FIELD attachment ON message TYPE option<record<attachment>>;
-- The time the message was sent
DEFINE FIELD sent_time ON message TYPE datetime;
DEFINE INDEX message__out ON message FIELDS out;


-- A single chunk of recording, as a standalone file with metadata
DEFINE TABLE recording TYPE NORMAL;
DEFINE FIELD user ON recording TYPE option<record<user>>;
DEFINE FIELD userName ON recording TYPE option<string>;
-- The temporary ID of the user who started this recording
-- This is only set when the recording is running
DEFINE FIELD owner ON recording TYPE option<uuid>;
-- The mime type
DEFINE FIELD mimeType ON recording TYPE string;
DEFINE FIELD startTime ON recording TYPE datetime;


-- A room - ie a temporary group of users who are all in a call together
DEFINE TABLE room TYPE NORMAL;
DEFINE FIELD name ON room TYPE string;
DEFINE FIELD group ON room TYPE option<record<group>>;
DEFINE FIELD recordings ON room TYPE set<record<recording>>;
DEFINE FIELD owner ON room TYPE record<user>;


-- A group of users who can all share messages
DEFINE TABLE group TYPE NORMAL;
-- What sort of group this is - this is used to work out the displayed name
DEFINE FIELD type ON group TYPE string
    ASSERT $value == "p2p" OR $value == "group";
-- The name of this group - required if type is "group"
DEFINE FIELD name ON group TYPE option<string>
    ASSERT $this.type != "group" OR $value != NONE;
-- The owner of this group - required if type is "group"
DEFINE FIELD owner ON group TYPE option<record<user>>
    ASSERT $this.type != "group" OR $value != NONE;


-- A relation that is present if a user is in a group
DEFINE TABLE in_group TYPE RELATION FROM user TO group;
DEFINE INDEX in_group_unique ON in FIELDS in, out UNIQUE;


-- A table containing calculated data about a user
-- DEFINE TABLE user_extra SCHEMAFULL TYPE NORMAL AS
--     SELECT in AS user, array::distinct(out) AS groups FROM is_in GROUP BY in;
-- DEFINE INDEX user_extra__user ON user_extra FIELDS user UNIQUE;


-- Useful functions

-- Get the id of a user by email address - throws "User not found" if no such user exists
DEFINE FUNCTION fn::getUser($email: string) {
    LET $user = (SELECT * FROM user WHERE email = $email);
    IF !$user {
        THROW "User not found";
    };
    RETURN array::first($user).id;
};

-- Get the id of a user by email address - creates a new user if no user exists yet
DEFINE FUNCTION fn::getOrCreateUser($email: string) {
    -- Get existing user
    LET $user = (SELECT * FROM user WHERE email = $email);
    -- If there is no such user, create one
    LET $user = IF $user {
        $user
    } ELSE {
        (CREATE user:uuid() SET email = $email);
    };
    -- Return the id
    RETURN array::first($user).id;
};

-- Get extra information about a user.
-- This will be NONE if the user is not in any groups or rooms
DEFINE FUNCTION fn::getUserExtra($email: string) {
    LET $user = fn::getUser($email);
    RETURN array::first((SELECT * FROM user_extra WHERE user = $user));
};

-- Send a message to a group
DEFINE FUNCTION fn::sendGroupMessage(
    $from: string,
    $to: record<group>,
    $content: string,
    $attachment: option<record<attachment>>,
){
    RELATE (fn::getOrCreateUser($from))->message->$to SET content = $content, attachment = $attachment, sent_time = time::now();
};

-- Get or create a p2p group
DEFINE FUNCTION fn::getOrCreateP2PGroup($user1: string, $user2: string) {
    LET $user1 = fn::getOrCreateUser($user1);
    LET $user2 = fn::getOrCreateUser($user2);

    LET $group = array::first((SELECT VALUE ->in_group->(group WHERE type = "p2p" && <-(in_group WHERE in == $user2)) FROM $user1));
    RETURN IF $group {
        RETURN array::first($group);
    } ELSE {
        LET $group = array::first((CREATE group SET type = "p2p")).id;
        RELATE [$user1, $user2]->in_group->$group;
        RETURN $group;
    };
};

-- Send a message between 2 users
DEFINE FUNCTION fn::sendP2PMessage(
    $from: string,
    $to: string,
    $content: string,
    $attachment: option<record<attachment>>,
) {
    RELATE (fn::getOrCreateUser($from))->message->(fn::getOrCreateUser($to)) SET content = $content, attachment = $attachment, sent_time = time::now();
};

DEFINE FUNCTION fn::getMessages($group: record<group>, $limit: int, $start: int) {
    RETURN (SELECT * FROM message WHERE out = $group ORDER BY sent_time LIMIT $limit START $start);
};

DEFINE FUNCTION fn::createRoomFrom($group: record<group>, $owner: string) {
    LET $room = (CREATE room:uuid() SET name = $group.name, group = $group, recordings = []);
    RETURN array::first($room).id;
};

DEFINE FUNCTION fn::createRoom($name: string, $owner: string) {
    LET $room = (CREATE room SET name = $name, owner = fn::getOrCreateUser($owner), users = [], recordings = []);
    RETURN array::first($room).id;
};

DEFINE FUNCTION fn::queryRoom($id: record<room>) {
    RETURN (SELECT * FROM ONLY $id FETCH owner, recordings[*]);
};

DEFINE FUNCTION fn::joinRoom($email: string, $id: string, $room: record<room>) {
    UPDATE fn::getUser($email) SET current_id = <uuid>$id, current_room = $room;
};

DEFINE FUNCTION fn::createRecording(
    $user: option<record<user>>,
    $owner: string,
    $userName: option<string>,
    $mimeType: string,
    $room: record<room>,
) {
    LET $recording = (CREATE recording:uuid() SET
        user = $user,
        userName = $userName,
        mimeType = $mimeType,
        owner = <uuid>$owner,
        startTime = time::now()
    );
    LET $id = array::first($recording).id;
    UPDATE $room SET recordings += $id;
    RETURN $id;
};

DEFINE FUNCTION fn::isRecordingOwner($user: string, $recording: record<recording>) {
    LET $owner = (SELECT VALUE owner FROM ONLY $recording);
    RETURN $owner == <uuid>$user;
};

DEFINE FUNCTION fn::finishRecording($user: string, $recording: record<recording>) {
    IF fn::ownsRecording($user, $recording) {
        UPDATE $recording UNSET owner;
    }
};
