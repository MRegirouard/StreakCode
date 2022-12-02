import log from './log'
import dotenv from 'dotenv'
import discord from 'discord.js'

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
