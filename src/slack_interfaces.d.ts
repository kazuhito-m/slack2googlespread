// Slack's interfaces.

interface ISlackResponse {
  ok:       boolean;
  error?:   string;
}

// https://api.slack.com/methods/channels.list
interface ISlackChannelsListResponse extends ISlackResponse {
  channels: ISlackChannel[];
}

// https://api.slack.com/methods/channels.history
interface ISlackChannelsHistoryResponse extends ISlackResponse {
  latest?: string;
  oldest?: string;
  has_more: boolean;
  messages: ISlackMessage[];
}

// https://api.slack.com/methods/users.list
interface ISlackUsersListResponse extends ISlackResponse {
  members: ISlackUser[];
}

// https://api.slack.com/types/channel
interface ISlackChannel {
  id:      string;
  name:    string;
  created: number;

  // ...and more fields
}

// https://api.slack.com/events/message
interface ISlackMessage {
  type:   string;
  ts:     string;
  user:   string;
  text:   string;

  // https://api.slack.com/events/message/bot_message
  username?: string;

  // ...and more fields
}

// https://api.slack.com/types/user
interface ISlackUser {
  id:   string;
  name: string;

  // ...and more fields
}

// https://api.slack.com/methods/team.info
interface ISlackTeamInfoResponse extends ISlackResponse {
  team: {
    id:     string;
    name:   string;
    domain: string;
    // ...and more fields
  };
}
