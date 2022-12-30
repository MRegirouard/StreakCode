import discord from 'discord.js'
import log from './log'

type Reply = string | discord.InteractionReplyOptions | discord.MessagePayload
let handlers: Record<string, (interaction: discord.CommandInteraction) => Promise<Reply>> = {}

handlers['ping'] = (interaction: discord.CommandInteraction): Promise<Reply> =>
{
	log.debug('Ping')
	return new Promise((resolve, reject) => resolve('Pong!\n' +
	`Websocket Heartbeat: ${interaction.client.ws.ping}ms\n` +
	`Roundtrip Latency: ${Date.now() - interaction.createdTimestamp}ms`))
}

export default handlers
