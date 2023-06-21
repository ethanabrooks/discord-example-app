import "dotenv/config";
// Require the necessary discord.js classes
import { Client, Collection, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder, } from "discord.js";
import { Configuration, OpenAIApi } from "openai";
const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);
export default class MyClient extends Client {
    commands; // use correct type :)
    constructor(options) {
        super(options);
        this.commands = new Collection();
    }
}
// Create a new client instance
const client = new MyClient({ intents: [GatewayIntentBits.Guilds] });
// Log in to Discord with your client's token
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.APP_ID;
const guildId = process.env.GUILD_ID;
client.login(token);
const gptCommandName = "gpt";
const stopWords = ["Player:", "Game:"];
const commands = [
    {
        data: new SlashCommandBuilder()
            .setName(gptCommandName)
            .setDescription("query gpt"),
        async execute(interaction) {
            const messages = await interaction.channel.messages
                .fetch({
                limit: 100,
                cache: false,
            })
                .then((messages) => messages.map((message) => ({
                role: message.interaction != null &&
                    message.interaction.commandName == gptCommandName
                    ? "system"
                    : "user",
                content: message.content,
            })))
                .catch(console.error);
            console.log(messages);
            await interaction.deferReply();
            const [stopWord1, stopWord2] = stopWords;
            const concatenated = messages.map(({ content }) => content).join("");
            const index1 = concatenated.lastIndexOf(stopWord1);
            const index2 = concatenated.lastIndexOf(stopWord2);
            let stopWord = null;
            if (index1 > index2) {
                stopWord = stopWord2;
            }
            else if (index2 > index1) {
                stopWord = stopWord1;
            }
            console.log(messages);
            const chatCompletion = await openai.createChatCompletion({
                model: "gpt-3.5-turbo",
                messages: messages,
                stop: stopWord,
                temperature: 1,
                max_tokens: 1000,
                top_p: 0.5,
            });
            const content = chatCompletion.data.choices[0].message.content;
            console.log(content);
            await interaction.editReply(content.slice(0, 2000));
        },
    },
    {
        data: new SlashCommandBuilder()
            .setName("server")
            .setDescription("Provides information about the server."),
        async execute(interaction) {
            // interaction.guild is the object representing the Guild in which the command was run
            await interaction.reply(`This server is ${interaction.guild.name} and has ${interaction.guild.memberCount} members.`);
        },
    },
    {
        data: new SlashCommandBuilder()
            .setName("user")
            .setDescription("Provides information about the user."),
        async execute(interaction) {
            // interaction.user is the object representing the User who ran the command
            // interaction.member is the GuildMember object, which represents the user in the specific guild
            await interaction.reply(`This command was run by ${interaction.user.username}, who joined on ${interaction.member.joinedAt}.`);
        },
    },
];
for (const command of commands) {
    // Set a new item in the Collection with the key as the command name and the value as the exported module
    if ("data" in command && "execute" in command) {
        client.commands.set(command.data.name, command);
        console.log(`[INFO] Registered command ${command.data.name}`);
    }
    else {
        console.log(`[WARNING] Something weird happened`);
    }
}
// When the client is ready, run this code (only once)
client.once(Events.ClientReady, (c) => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
});
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand())
        return;
    const client = interaction.client;
    const command = client.commands.get(interaction.commandName);
    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }
    try {
        await command.execute(interaction);
    }
    catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
                content: "There was an error while executing this command!",
                ephemeral: true,
            });
        }
        else {
            await interaction.reply({
                content: "There was an error while executing this command!",
                ephemeral: true,
            });
        }
    }
});
const rest = new REST().setToken(token);
// and deploy your commands!
(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);
        const json_commands = commands.map((command) => command.data.toJSON());
        // The put method is used to fully refresh all commands in the guild with the current set
        const data = (await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: json_commands }));
        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    }
    catch (error) {
        // And of course, make sure you catch and log any errors!
        console.error(error);
    }
})();
//# sourceMappingURL=app.js.map