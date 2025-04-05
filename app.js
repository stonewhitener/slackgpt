const { App } = require('@slack/bolt');
const { OpenAI } = require('openai');

const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN,
});

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

app.event('app_mention', async ({ event, client, logger }) => {
    logger.info({ event });

    const { channel, ts, thread_ts } = event;

    // Indicate that the request is being processed.
    const add_reaction = client.reactions.add({
        channel,
        name: 'thinking_face',
        timestamp: ts,
    });

    const test_auth = client.auth.test();

    const get_replies = client.conversations.replies({
        channel,
        ts: thread_ts || ts,    // Reply to a thread.
    });

    const [_, { user_id }, { messages }] = await Promise.all([add_reaction, test_auth, get_replies]);

    logger.info({ messages });

    const input = messages
        .filter((message) => 
            message.user === user_id || 
            message.text.includes(`<@${user_id}>`)
        )
        .map((message) => {
            const { user, text } = message;
            const role = user === user_id ? 'assistant' : 'user';
            const content = text.replace(/^<@U[A-Z0-9]+>\s*/, '');
            return { role, content };
        })
        .filter((message) => message.content !== '');

    logger.info({ input });

    const response = await openai.responses.create({
        model: 'gpt-4o-mini',
        input
    });

    logger.info({ response });

    const post_message = client.chat.postMessage({
        channel,
        thread_ts: thread_ts || ts, // Reply to a thread.
        text: response.output_text,
    });

    // Indicate that the request is completed.
    const remove_reaction = client.reactions.remove({
        channel,
        name: 'thinking_face',
        timestamp: ts,
    });

    await Promise.all([post_message, remove_reaction]);
});

(async () => {
    await app.start();

    app.logger.info('⚡️ Bolt app is running!');
})();
