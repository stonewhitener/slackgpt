const util = require('util')
const { App } = require('@slack/bolt');
const { OpenAI } = require('openai');
const { DatabaseSync } = require('node:sqlite');

const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN,
});

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const db = new DatabaseSync('files.db');

db.exec('CREATE TABLE IF NOT EXISTS files (slack_file_id TEXT PRIMARY KEY, openai_file_id TEXT, openai_file_type TEXT) STRICT');

const insert = db.prepare('INSERT INTO files VALUES (?, ?, ?)');
const select = db.prepare('SELECT * FROM files WHERE slack_file_id=?');

app.event('app_mention', async ({ event, client, logger }) => {
    logger.info(util.inspect(event, { depth: null }));

    const { channel, ts, thread_ts, files } = event;

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

    const create_file = Promise.all(
        (files ?? []).map(async (meta) => {
            const downloaded = await fetch(meta.url_private_download, { headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` } });
            const buffer = Buffer.from(await downloaded.arrayBuffer());
            const file = new File([buffer], meta.name, { type: meta.mimetype });
            const uploaded = await openai.files.create({
                file,
                purpose: 'user_data',
            });
            logger.info(util.inspect(uploaded, { depth: null }));
            const mimetype = meta.mimetype.split('/')[0];
            const type = mimetype === 'image' ? 'input_'.concat(mimetype) : 'input_file';
            insert.run(meta.id, uploaded.id, type);
        })
    );

    const [, { user_id }, { messages }, ] = await Promise.all([add_reaction, test_auth, get_replies, create_file]);

    logger.info(util.inspect(messages, { depth: null }));

    const input = messages
        .filter((message) => 
            message.user === user_id || 
            message.text.includes(`<@${user_id}>`)
        )
        .map((message) => {
            const { user, text } = message;
            if (user === user_id) {
                return { role: 'assistant', content: text };
            } else {
                const input_files = (message.files ?? []).map((file) => {
                    const result = select.get(file.id);
                    return { type: result.openai_file_type, file_id: result.openai_file_id };
                });
                const content = [
                    { 
                        type: 'input_text', 
                        text: text.replace(/^<@U[A-Z0-9]+>\s*/, '')
                    },
                    ...input_files
                ];
                return { role: 'user', content };
            }
        });

    logger.info(util.inspect(input, { depth: null }));

    const response = await openai.responses.create({
        model: 'gpt-4o',
        input,
    });

    logger.info(util.inspect(response, { depth: null }));

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
