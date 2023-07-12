import "dotenv/config";
import * as fs from "fs";
// Require the necessary discord.js classes
import {
  ApplicationCommand,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
} from "discord.js";
import { Commands } from "./commands.js";

export default class MyClient extends Client {
  commands: Collection<any, any>; // use correct type :)
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

// Register commands
for (const command of Commands) {
  // Set a new item in the Collection with the key as the command name and the value as the exported module
  if ("data" in command && "execute" in command) {
    client.commands.set(command.data.name, command);
    console.log(`[INFO] Registered command ${command.data.name}`);
  } else {
    console.log(`[WARNING] Something weird happened`);
  }
}

// When the client is ready, run this code (only once)
client.once(Events.ClientReady, (c) => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const client = interaction.client as MyClient;
  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "There was an error while executing this command!",
        ephemeral: true,
      });
    } else {
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
    console.log(
      `Started refreshing ${Commands.length} application (/) commands.`,
    );
    const json_commands = Commands.map((command) => command.data.toJSON());

    // The put method is used to fully refresh all commands in the guild with the current set
    const data = (await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: json_commands },
    )) as unknown as ApplicationCommand[];

    console.log(
      `Successfully reloaded ${data.length} application (/) commands.`,
    );
  } catch (error) {
    // And of course, make sure you catch and log any errors!
    console.error(error);
  }
})();
