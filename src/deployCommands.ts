import { REST, Routes } from 'discord.js'
import commands from './commands'
import dotenv from 'dotenv'

dotenv.config()
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!)

function putApplicationCommands(applicationId: string, guildId?: string): Promise<any>
{
	if (guildId)
		return rest.put(Routes.applicationGuildCommands(applicationId, guildId), { body: commands })
	else
		return rest.put(Routes.applicationCommands(applicationId), { body: commands })
}
