DEFINE TABLE user SCHEMAFULL TYPE NORMAL;
-- The SSO ID of this user
DEFINE FIELD sso_id ON user TYPE option<string>;
-- The user's nickname. This should be set if sso_id is NONE
DEFINE FIELD name ON user TYPE option<string>;
DEFINE INDEX user__sso_id ON user FIELDS sso_id UNIQUE;


-- An attachment to a message
DEFINE TABLE attachment SCHEMAFULL TYPE NORMAL;
-- The ID of the file
DEFINE FIELD file_id ON attachment TYPE uuid;
-- The file name
DEFINE FIELD name ON attachment TYPE string;
-- The MIME type of the file
DEFINE FIELD mime_type ON attachment TYPE string;
-- The group this was originally shared in
DEFINE FIELD group ON attachment TYPE record<group>;


-- A message
DEFINE TABLE message SCHEMAFULL TYPE RELATION FROM user TO group;
-- The message content
DEFINE FIELD content ON message TYPE string;
-- Any attachments
DEFINE FIELD attachments ON message TYPE array<record<attachment>>;
-- The time the message was sent
DEFINE FIELD sent_time ON message TYPE datetime;
DEFINE INDEX message__out ON message FIELDS out;


-- A single chunk of recording, as a standalone file with metadata
DEFINE TABLE recording TYPE NORMAL;
DEFINE FIELD user ON recording TYPE record<user>;
DEFINE FIELD complete ON recording TYPE bool DEFAULT false;
-- The mime type
DEFINE FIELD mimeType ON recording TYPE string;
DEFINE FIELD startTime ON recording TYPE datetime;
DEFINE FIELD is_screen ON recording TYPE bool;
DEFINE FIELD file_id ON recording TYPE uuid;


-- A room - ie a temporary group of users who are all in a call together
DEFINE TABLE room TYPE NORMAL;
-- The group this room was created in
DEFINE FIELD group ON room TYPE record<group>;
-- The recordings in this room
DEFINE FIELD recordings ON room TYPE set<record<recording>>;
-- The owner of this room - ie the person who started the call
DEFINE FIELD owner ON room TYPE record<user>;
-- The users who are currently connected to this room
DEFINE FIELD users ON room TYPE set<record<user>>;


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
-- The users in this group - required if type is "p2p"
-- For type "group", see in_group relation
DEFINE FIELD users ON group TYPE option<array<record<user>>>
    ASSERT $this.type != "p2p" OR ($value != NONE AND array::len($value) == 2);


-- A relation that is present if a user is in a group
DEFINE TABLE in_group TYPE RELATION FROM user TO group;
DEFINE INDEX in_group_unique ON in_group FIELDS in, out UNIQUE;


-- A relation that is present if a user is in a room
DEFINE TABLE in_room TYPE RELATION FROM user TO room;
DEFINE INDEX in_room_unique ON in_room FIELDS in, out UNIQUE;

-- Useful functions

-- Fetch some records
DEFINE FUNCTION fn::fetchAll($ids: array<record>) {
    RETURN (SELECT * FROM $ids);
};

-- Check if a record exists
DEFINE FUNCTION fn::exists($id: record) {
    RETURN $id.id == $id;
};

-- Create a new user without an SSO id
DEFINE FUNCTION fn::createUser() {
    RETURN array::first((CREATE user:uuid()));
};

-- Get the user from an sso_id, optionally creating a new user if none exists
DEFINE FUNCTION fn::getSsoUser($sso_id: string, $create: bool) {
    LET $user = (SELECT * FROM user WHERE sso_id = $sso_id);
    RETURN IF $user {
        RETURN array::first($user);
    } ELSE IF $create {
        RETURN array::first((CREATE user:uuid() SET sso_id = $sso_id));
    } ELSE {
        RETURN NONE;
    };
};

DEFINE FUNCTION fn::setUserName($user: record<user>, $name: option<string>) {
    UPDATE $user SET name = $name;
};

DEFINE FUNCTION fn::migrateUser($dest: record<user>, $src: record<user>) {
    -- message table
    UPDATE message SET from = $dest WHERE from = $src;

    -- recording table
    UPDATE recording SET user = $dest WHERE from = $src;

    -- room table
    UPDATE room SET owner = $dest WHERE from = $src;

    -- group table

    -- in_group table
    LET $groups = fn::getGroups($src);
    FOR $group IN $groups.groups {
        IF $group.owner == $src {
            UPDATE $group SET owner = $dest;
        };
        IF $src IN $group.users {
            UPDATE $group SET users -= $src, users += $dest;
        };
        IF !(SELECT VALUE id FROM in_group WHERE in = $dest && out = $group.id) {
            fn::joinGroup($group.id, $dest);
        };
    };

    -- in_room table

    -- user table
    DELETE $src;
};

-- Throw an error if no user exists
DEFINE FUNCTION fn::ensureUser($user: record<user>) {
    IF $user.id == NONE {
        THROW "User not found";
    };
};

-- Get all groups a user is in
DEFINE FUNCTION fn::getGroups($user: record<user>) {
    fn::ensureUser($user);
    RETURN (SELECT ->in_group.out as groups FROM ONLY $user FETCH groups[*]);
};

-- Get or create a p2p group
DEFINE FUNCTION fn::getOrCreateP2PGroup($user1: record<user>, $user2: record<user>) {
    LET $group = array::first((SELECT VALUE ->in_group->(group WHERE type = "p2p" && <-(in_group WHERE in == $user2)) FROM $user1));
    RETURN IF $group {
        RETURN array::first($group);
    } ELSE {
        LET $group = array::first((CREATE group:uuid() SET type = "p2p", users = [$user1, $user2])).id;
        RELATE [$user1, $user2]->in_group->$group;
        RETURN $group;
    };
};

-- Create an attachment
DEFINE FUNCTION fn::createAttachment($file_id: uuid, $name: string, $mime_type: string, $group: record<group>) {
    RETURN (CREATE ONLY attachment:uuid() SET file_id = $file_id, name = $name, mime_type = $mime_type, group = $group).id;
};

-- Send a message to a group
DEFINE FUNCTION fn::sendMessage($from: record<user>, $to: record<group>, $content: string, $attachments: array<record<attachment>>) {
    LET $message = array::first((RELATE $from->message->$to SET content = $content, attachments = $attachments, sent_time = time::now())).id;
    RETURN (SELECT * FROM ONLY $message FETCH attachments[*]);
};

-- Get messages from a group
DEFINE FUNCTION fn::getMessages($group: record<group>) {
    RETURN (SELECT * FROM message WHERE out = $group ORDER BY sent_time FETCH attachments[*]);
};

-- Create a group
DEFINE FUNCTION fn::createGroup($name: string, $owner: record<user>) {
    LET $group = (CREATE ONLY group:uuid() SET type = "group", name = $name, owner = $owner);
    RELATE $owner->in_group->$group;
    RETURN $group;
};

DEFINE FUNCTION fn::queryGroup($group: record<group>) {
    RETURN (SELECT * FROM ONLY $group);
};

DEFINE FUNCTION fn::joinGroup($group: record<group>, $user: record<user>) {
    RELATE $user->in_group->$group;
};

-- Create a temporary room from a group
DEFINE FUNCTION fn::createRoom($group: record<group>, $owner: record<user>) {
    LET $room = (CREATE room:uuid() SET group = $group, owner = $owner, recordings = [], users = [$owner]);
    RETURN array::first($room).id;
};

-- Get information about a room
DEFINE FUNCTION fn::queryRoom($id: record<room>) {
    RETURN (SELECT * FROM ONLY $id FETCH group, recordings[*]);
};

DEFINE FUNCTION fn::joinRoom($room: record<room>, $user: record<user>) {
    UPDATE $room SET users += $user;
};

DEFINE FUNCTION fn::leaveRoom($room: record<room>, $user: record<user>) {
    UPDATE $room SET users -= $user;
};

DEFINE FUNCTION fn::createRecording(
    $user: record<user>,
    $mimeType: string,
    $room: record<room>,
    $is_screen: bool,
) {
    LET $recording = (CREATE recording:uuid() SET
        user = $user,
        mimeType = $mimeType,
        is_screen = $is_screen,
        startTime = time::now(),
        file_id = rand::uuid::v7()
    );
    LET $id = array::first($recording).id;
    UPDATE $room SET recordings += $id;
    RETURN $id;
};

DEFINE FUNCTION fn::isRecordingOwner($user: record<user>, $recording: record<recording>) {
    RETURN $recording.user == $user;
};

DEFINE FUNCTION fn::finishRecording($user: record<user>, $recording: record<recording>) {
    IF $recording.user == $user {
        UPDATE $recording SET complete = true;
    };
};
