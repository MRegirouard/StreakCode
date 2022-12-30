import log from './log'
import dotenv from 'dotenv'
import discord from 'discord.js'
import commandHandlers from './commandHandlers'

log.info('Starting StreakCode bot...')

dotenv.config()

log.debug('Creating Discord client...')
const dClient = new discord.Client({ intents: [] })

log.verbose('Logging in to Discord...')
dClient.login(process.env.DISCORD_TOKEN)

dClient.on('ready', () =>
{
	log.info('StreakCode bot is ready!')
})

function editReply(deferPromise: Promise<discord.InteractionResponse<boolean>>,
	interaction: discord.ChatInputCommandInteraction<discord.CacheType> |
	discord.MessageContextMenuCommandInteraction<discord.CacheType> |
	discord.UserContextMenuCommandInteraction<discord.CacheType>,
	reply: string | discord.InteractionReplyOptions | discord.MessagePayload)
{
	log.silly(`Replying to interaction with "${JSON.stringify(reply)}" when deferred reply is ready...`)

	deferPromise.then(() =>
	{
		log.silly('Deferred reply is ready, editing reply...')

		interaction.editReply(reply).then(() =>
		{
			log.verbose('Successfully replied to interaction')
		})
		.catch((err) =>
		{
			log.error(`Failed to reply to interaction: "${err}"`)
		})
	})
}

dClient.on('interactionCreate', (interaction) =>
{
	log.silly('Received interaction')

	if (!interaction.isCommand())
	{
		log.debug('Interaction is not a command')
		return
	}

	// Defer the reply, showing a loading state until we're ready to reply
	let deferPromise = interaction.deferReply()
	deferPromise.catch((err) =>
	{
		log.error(`Failed to defer reply: "${err}"`)
	})
	
	log.verbose(`Interaction command: "${interaction.commandName}"`)
	log.debug(`Interaction options: "${JSON.stringify(interaction.options.data)}"`)

	// Run command handler and reply
	if (commandHandlers[interaction.commandName])
	{
		log.debug(`Running command handler for "${interaction.commandName}"`)
		commandHandlers[interaction.commandName](interaction).then((reply) =>
		{
			log.debug(`Command handler for "${interaction.commandName}" was successful, replying to interaction...`)
			editReply(deferPromise, interaction, reply)
		})
		.catch((err) =>
		{
			log.error(`Command handler for "${interaction.commandName}" failed: "${err}"`)
			editReply(deferPromise, interaction, `Command handler for "${interaction.commandName}" failed: "${err}"`)
		})
	}
	else
	{
		log.warn(`No command handler found for "${interaction.commandName}"`)
		editReply(deferPromise, interaction, `No command handler found for "${interaction.commandName}"`)
	}
})
