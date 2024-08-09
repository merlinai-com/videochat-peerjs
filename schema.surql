-- A user. This is safe to share with any users who have exchanged messages
-- since the user's email is required to send a message
DEFINE TABLE user SCHEMAFULL TYPE NORMAL;
-- The user's email
DEFINE FIELD email ON user TYPE string
    ASSERT string::is::email($value);
-- Set while the user is in a call
DEFINE FIELD current_id ON user TYPE option<uuid>;
-- Set to the room the user is currently connected to
DEFINE FIELD current_room ON user TYPE option<record<room>>;
DEFINE INDEX user__email ON user FIELDS email UNIQUE;
DEFINE INDEX user__current_id ON user FIELDS current_id;


-- A message
DEFINE TABLE message SCHEMAFULL TYPE RELATION FROM user TO user;
-- The message content
DEFINE FIELD content ON message TYPE string;
-- The time the message was sent
DEFINE FIELD sent_time ON message TYPE datetime;
-- TODO: see https://github.com/surrealdb/surrealdb/issues/4046
-- DEFINE INDEX message__in_out ON message FIELDS in, out;
DEFINE INDEX message__in_out ON message FIELDS in;
DEFINE INDEX message__sent_time ON message FIELDS sent_time;


-- Extra information about each user
DEFINE TABLE user_extra TYPE NORMAL AS SELECT
    <set>->message.out AS sent_to,
    <set><-message.in AS recv_from,
    id as user FROM user;
DEFINE INDEX user_extra__user ON user_extra FIELDS user UNIQUE;


-- A recording
DEFINE TABLE recording TYPE NORMAL;
DEFINE FIELD user ON recording TYPE option<record<user>>;
DEFINE FIELD userName ON recording TYPE option<string>;
-- The temporary ID of the user who started this recording
-- This is only set when the recording is running
DEFINE FIELD owner ON recording TYPE option<uuid>;
DEFINE FIELD mimeType ON recording TYPE string;
DEFINE FIELD startTime ON recording TYPE datetime;


-- A room
DEFINE TABLE room TYPE NORMAL;
DEFINE FIELD name ON room TYPE string;
DEFINE FIELD owner ON room TYPE record<user>;
DEFINE FIELD users ON room TYPE set<record<user>>;
DEFINE FIELD recordings ON room TYPE set<record<recording>>;


-- Useful functions

DEFINE FUNCTION fn::getUser($email: string) {
    LET $user = (SELECT * FROM user WHERE email = $email);
    IF !$user {
        THROW "User not found";
    };
    RETURN array::first($user).id;
};

DEFINE FUNCTION fn::getOrCreateUser($email: string) {
    LET $user = (INSERT INTO user { email: $email });
    RETURN array::first($user).id;
}

DEFINE FUNCTION fn::createUser($email: string) {
    CREATE user SET email = $email;
};

DEFINE FUNCTION fn::getUserExtra($email: string) {
    LET $user = fn::getUser($email);
    RETURN array::first((SELECT * FROM ONLY user_extra WHERE user = $user.id FETCH user));
};

DEFINE FUNCTION fn::getUserByCurrentId($id: string) {
    RETURN array::first((SELECT * FROM user WHERE current_id = <uuid>$id));
};

DEFINE FUNCTION fn::sendMessage($from: string, $to: string, $content: string) {
    RELATE (fn::getUser($from).id)->message->(fn::getUser($to).id) SET content = $content, sent_time = time::now();
};

DEFINE FUNCTION fn::getMessages($from: string, $to: string, $limit: int, $start: int) {
    LET $from = fn::getUser($from).id;
    LET $to = fn::getUser($to).id;
    RETURN (SELECT * FROM message WHERE (in = $from && out = $to) || (in = $to && out = $from) ORDER BY sent_time LIMIT $limit START $start);
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
