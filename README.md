# slackgpt

## Slack App Configuration

```yaml
oauth_config:
  scopes:
    bot:
      - app_mentions:read
      - channels:history
      - chat:write
      - groups:history
      - im:history
      - mpim:history
      - reactions:write
settings:
  event_subscriptions:
    bot_events:
      - app_mention
      - message.channels
      - message.groups
      - message.im
      - message.mpim
  socket_mode_enabled: true
```

## Run

```shell
export SLACK_SIGNING_SECRET='***'
export SLACK_BOT_TOKEN='xoxb-***'
export SLACK_APP_TOKEN='xapp-***'
export OPENAI_API_KEY='sk-***'

# Run
node app.js
```
