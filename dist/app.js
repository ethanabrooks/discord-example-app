import 'dotenv/config';
// Require the necessary discord.js classes
import { Client, GatewayIntentBits } from 'discord.js';
import ready from "./listeners.js";
import interactionCreate from './interactionCreate.js';
// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
ready(client);
interactionCreate(client);
// Log in to Discord with your client's token
client.login(process.env.DISCORD_TOKEN);
//# sourceMappingURL=app.js.map