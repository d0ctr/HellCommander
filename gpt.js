const { OpenAI } = require('openai');

const PROBABILITY = process.env.PROBABILITY_MODIFIER?.length ? parseFloat(process.env.PROBABILITY_MODIFIER) : 0.5;

/**
 * ChatGPT
 * @namespace ChatGPT
 */

/** 
 * Model name
 * @typedef {'gpt-3.5-turbo-16k'} Model
 * @memberof ChatGPT
 */
/** 
 * Chat member role name
 * @typedef {('system' | 'assistant' | 'user')} NodeRole
 * @memberof ChatGPT
 */
/** 
 * GPT Message content
 * @typedef {string} NodeContent
 * @memberof ChatGPT
 */
/** 
 * @typedef {import('grammy').Context} TgContext
 * @memberof ChatGPT
 */
/** 
 * Message, recognisable by ChatGPT
 * @typedef {{
 *  role: NodeRole,
 *  content: NodeContent,
 *  name: (string | null)
 * }} NodeMessage
 * @memberof ChatGPT
 */
/**
 * Full context node data
 * @typedef {{
 *  role: NodeRole,
 *  content: NodeContent,
 *  name: string,
 *  message_id: string,
 *  prev_message_id: (string | null),
 *  model: (Model | null),
 *  name: (string | null)
 * }} NodeRawData
* @memberof ChatGPT
*/

const max_tokens = {
    'gpt-3.5-turbo-16k': undefined,
}
/** 
 * @type {Model}
 * @memberof ChatGPT
 */
const CHAT_MODEL_NAME = 'gpt-3.5-turbo-16k';

const DEFAULT_SYSTEM_PROMPT = process.env.SYSTEM_PROMPT?.length
? process.env.SYSTEM_PROMPT
: `\
you are a propagandist and a division commander in a probably fascist militaristic government representing the “Super Earth”
“Super Earth” has 2 enemies: automatons (robots) and terminids (bugs)
every answer you give must be a short encouragement as if you are sending your troops into a battle to capture (liberate) distant lands
our key values are democracy, prosperity and freedom
always stay in character
never give common knowladge answers, only the encouragments\
`;

const isToAnswer = () => Math.random() > PROBABILITY;

/**
 * @class
 * @memberof ChatGPT
 */
class ContextNode {
    /**
     * @param {{
     *  role: NodeRole,
     *  content: NodeContent,
     *  message_id: string | string,
     *  prev_node: ContextNode | null,
     *  name: string | null,
     *  model: Model | null
     * }} 
     */
    constructor({ role, content, message_id, prev_node = null, name = null, model = null } = {}) {
        /** @type {string} */
        this.role = role;

        /** @type {NodeContent} */
        this.content = content;
        
        if (name) {
            /** @type {string | undefined} */
            this.name = name?.replace(/ +/g, '_')?.replace(/[^a-zA-Z0-9_]/g, '')?.slice(0, 64);
        };

        if (message_id) {
            /** @type {string | undefined} */
            this.message_id = message_id;
        };
        if (prev_node) {
            /** @type {ContextNode | undefined} */
            this.prev_node = prev_node;
        }
        if (model) {
            /** @type {Model | undefined} */
            this.model = model;
        }

    }

    /**
     * @param {ContextNode | null}
     */
    set prev_node(node) {
        this._prev_node = node;
    }

    /**
     * @returns {ContextNode | null}
     */
    get prev_node() {
        return this._prev_node;
    }

    /**
     * Get nodes data applicable as context
     * @returns {NodeMessage}
     */
    getMessage() {
        const message = {
            role: this.role,
            content: this.content,
        };
        if (this.name) message.name = this.name;
        return message;
    }

    /**
     * Get raw data of the node
     * @returns {NodeRawData}
     */
    getRawData() {
        const data = {
            role: this.role,
            content: this.content,
            message_id: this.message_id,
        };
        if (this.prev_node) data.prev_message_id = this.prev_node.message_id;
        if (this.model) data.model = this.model;
        if (this.name) data.name =  this.name;
        return data;
    }
}

/**
 * @class
 * @memberof ChatGPT
 */
class ContextTree {
    /**
     * 
     * @param {string | null} system_prompt 
     * @param {Model | null} model 
     */
    constructor() {
        /** @type {Map<string, ContextNode>} */
        this.nodes = new Map();

        /** @type {ContextNode} */
        this.root_node = new ContextNode({
            role: 'system',
            content: DEFAULT_SYSTEM_PROMPT,
            model: CHAT_MODEL_NAME
        });
    }

    /**
     * Get Node by message_id
     * @param {string} message_id 
     * @returns {ContextNode | null}
     */
    getNode(message_id) {
        return this.nodes.has(message_id) ? this.nodes.get(message_id) : null;
    }

    /**
     * Creates new node and appends to the tree either by the prev_message_id or to the root node
     * @param {{ role: NodeRole, content: NodeContent, message_id: string, prev_message_id: string, name: string }}
     */
    appendNode({ role, content, message_id, prev_message_id, name } = {}) {
        let prev_node = this.root_node;

        if (prev_message_id && this.checkNodeExists({ message_id: prev_message_id })) {
            prev_node = this.nodes.get(prev_message_id);
        }

        this.nodes.set(message_id, new ContextNode({ role, content, message_id, prev_node, name }));
    }

    /**
     * Checks if node exists either by node's message_id or provided message_id
     * @param {{ node: ContextNode | null, message_id: string | null }} 
     * @returns {boolean}
     */
    checkNodeExists({ node = null, message_id = null } = {}) {
        if (node) {
            message_id = node.message_id;
        }

        return this.nodes.has(message_id);
    }

    /**
     * Gets the context of the message as an array
     * @param {string} message_id 
     * @param {number} limit 
     * @returns {NodeMessage[]}
     */
    getContext(message_id, limit = 30) {
        if (!this.checkNodeExists({ message_id })) {
            return [this.root_node.getMessage()]
        }

        let context = [];

        let last_node = this.getNode(message_id);

        while (last_node && context.length <= limit) {
            context.unshift(last_node.getMessage());
            last_node = last_node.prev_node;
        }

        if (context[0].role !== this.root_node.role) {
            context.unshift(this.root_node.getMessage());
        }

        return context;
    }


    /**
     * Gets the raw context of the message as an array
     * @param {string | null} message_id 
     * @returns {NodeRawData[]}
     */
    getRawContext(message_id = null) {
        const raw_context = [];

        if (!this.checkNodeExists({ message_id })) {
            return raw_context;
        }

        let last_node = this.getNode(message_id);

        while (last_node) {
            raw_context.unshift(last_node.getRawData());
            last_node = last_node.prev_node;
        }

        return raw_context;
    }
}

/**
 * @class
 * @memberof ChatGPT
 */
class ChatGPTHandler {
    constructor() {
        /** @type {OpenAI} */
        this.openAI = new OpenAI({
            apiKey: process.env.OPENAI_TOKEN,
            organization: 'org-TDjq9ytBDVcKt4eVSizl0O74'
        });

        /** @type {Map<string, ContextTree>} */
        this.context_trees_map = new Map();
    }

    /**
     * Get a context tree fitting the specified arguments
     * @param {string} chat_id
     * @returns {ContextTree}
     */
    _getContextTree(chat_id) {
        if (!chat_id) {
            throw new Error('No chat_id specified to get context tree');
        }
    
        if (!this.context_trees_map.has(chat_id)) {
            this.context_trees_map.set(chat_id, new ContextTree());
        }
    
        return this.context_trees_map.get(chat_id);
    }

    /**
     * Makes an OpenAI API request with provided context and returnes response as text
     * @param {TgContext} tgctx 
     * @param {NodeMessage[]} context 
     * @param {ContextTree} context_tree 
     * @param {string} prev_message_id 
     * @returns {Promise}
     */
    async _replyFromContext(tgctx, context, context_tree, prev_message_id) {
        tgctx.replyWithChatAction('typing');
        const continiousChatAction = setInterval(() => {
            tgctx.replyWithChatAction('typing');
        }, 5000);

        return this.openAI.chat.completions.create({
            model: context_tree.root_node.model,
            messages: context,
            max_tokens: max_tokens[context_tree.root_node.model]
        }).then((data) => {
            if (!data) {
                console.log('[WARN] No response to ChatGPT Completion');
                return;
            }

            if (!data?.choices?.length) {
                console.log('[WARN] No choices for ChatGPT Completion');
                return;
            }

            const answer = data.choices[0].message.content;

            tgctx.reply(answer, { reply_parameters: { message_id: prev_message_id, allow_sending_without_reply: true }, parse_mode: 'HTML' })
                .then(({ message_id: new_message_id } = {}) => {
                    if (!new_message_id) return;
                    context_tree.appendNode({
                        role: 'assistant',
                        name: tgctx.me.first_name,
                        content: answer,
                        message_id: new_message_id,
                        prev_message_id
                    });
                })
                .catch(err => console.error(`[ERROR] Failed to respond: ${JSON.stringify(err)}`));
        }).catch(err => {
            if (err?.response) {
                console.error(`[ERROR] API Error while getting ChatGPT Completion: ${JSON.stringify(err.response)}`);
            }
            else {
                console.error(`[ERROR] Error while getting ChatGPT Completion ${JSON.stringify(err)}`);
            }
            return;
        }).finally(() => {
            clearInterval(continiousChatAction);
        });
    }

    /**
     * Answer request received via reply
     * @param {TgContext} tgctx
     * @returns {Promise}
     */
    async answerReply(tgctx) {
        if (!tgctx.message?.reply_to_message?.from?.id == tgctx.me.id) {
            return;
        }

        console.info(`[INFO] Commander will reply`);
        
        let prev_message_id = tgctx.message.reply_to_message.message_id;

        const context_tree = this._getContextTree(tgctx.chat.id);
        
        if (!context_tree.checkNodeExists({ message_id: prev_message_id })) {
            const content = tgctx.message.text || tgctx.message.caption;

            if (content) {
                context_tree.appendNode({ role: 'assistant', content, message_id: prev_message_id, name: tgctx.me.first_name });
            }
            else {
                prev_message_id = null;
            }
        }

        const { message_id, from: { first_name: author } } = tgctx.message;

        // appending user's request to the tree
        {
            const content = tgctx.message.text || tgctx.message.caption;
    
            context_tree.appendNode({ role: 'user', content, message_id, prev_message_id, name: author });
        }

        const context = context_tree.getContext(message_id);

        this._replyFromContext(tgctx, context, context_tree, message_id);
    }

    /**
     * Respond with ChatGPT response based on provided model, content of the replied message and/or text provided with the command
     * @param {TgContext} tgctx
     * @returns {Promise}
     */
    async handleAnswerCommand(tgctx) {
        const command_text = tgctx.message.text.split(' ').slice(1).join(' ');

        if (!command_text.length) {
            return;
        }

        let context_tree = this._getContextTree(tgctx.chat.id);

        let prev_message_id = null;
        let message_id = null;
        let author = null;

        if (tgctx.message.reply_to_message) {
            ({ message_id, from: { first_name: author } } = tgctx.message.reply_to_message);
            context_tree = this._getContextTree(tgctx.chat.id)
            const content = tgctx.message.text || tgctx.message.caption;
            if (content.length && !context_tree.checkNodeExists({ message_id })) {
                context_tree.appendNode({
                    role: (command_text.length && tgctx.from.id === tgctx.me.id) ? 'assistant' : 'user',
                    content,
                    message_id: message_id,
                    name: author
                });
            }
        }

        prev_message_id = message_id;
        ({ message_id, from: { first_name: author } } = tgctx.message);
        context_tree.appendNode({
            role: 'user',
            content: 'sir, ' + command_text,
            message_id: message_id,
            prev_message_id,
            name: author
        });
    
        const context = prev_message_id ? context_tree.getContext(message_id, 2) : context_tree.getContext(message_id);

        this._replyFromContext(tgctx, context, context_tree, message_id);
    }

    /**
     * Answer request received by a message
     * @param {TgContext} tgctx 
     * @returns {Promise}
     */
    async answerQuestion(tgctx) {
        if ((tgctx.from.id === tgctx.me.id) 
            || !(tgctx.message.text || tgctx.message.caption || '').length 
            || (tgctx.chat.type !== 'private' && !isToAnswer())) {
            return;
        }

        console.info(`[INFO] Commander will reply`);

        const context_tree = this._getContextTree(tgctx.chat.id);

        const {
            message_id,
            from: { first_name: author }
        } = tgctx.message;

        if (!context_tree.checkNodeExists({ message_id })) {
            const content = tgctx.message.text || tgctx.message.caption;

            context_tree.appendNode({ role: 'user', content, message_id, name: author });
        }

        const context = context_tree.getContext(message_id);

        this._replyFromContext(tgctx, context, context_tree, message_id);
    }
}

module.exports = new ChatGPTHandler();