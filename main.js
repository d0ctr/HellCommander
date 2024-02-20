require('dotenv').config();

const { OPENAI_TOKEN, TELEGRAM_TOKEN } = process.env;

if (!OPENAI_TOKEN?.length || !TELEGRAM_TOKEN?.length) {
    console.error('[ERROR] No tokens to proceed');
    process.exit();
}

const { Bot } = require('grammy');

const gpt = require('./gpt');

const bot = new Bot(TELEGRAM_TOKEN);

bot.command('start', ctx => {
    ctx.message.text += ' give a greeting';
    gpt.handleAnswerCommand(ctx);
});

bot.command('sir', ctx => gpt.handleAnswerCommand(ctx) );

bot.on('::bot_command', () => {});

bot.on(['msg:text', 'msg:caption'], ctx =>  {
    if (ctx.message.reply_to_message?.from?.id === ctx.me.id) {
        gpt.answerReply(ctx);
    }
    else {
        gpt.answerQuestion(ctx);
    }
});

bot.api.setMyCommands( [{ command: 'sir', description: 'request assistance from the commander' }], { scope: { type: 'default' } } );

bot.start({ onStart: () => console.info('[INFO] Bot started') }).catch(err => console.error(`[ERROR] Bot error: ${JSON.stringify(err)}`));