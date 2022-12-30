import discord from 'discord.js'

type Reply = string | discord.InteractionReplyOptions | discord.MessagePayload
let handlers: Record<string, (interaction: discord.CommandInteraction) => Promise<Reply>> = {}

export default handlers
