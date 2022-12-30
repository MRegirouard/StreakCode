import discord from 'discord.js'
import LeetCode from 'leetcode-query'
import { ServerModel } from './database'
import log from './log'

const lClient = new LeetCode()

type Reply = string | discord.InteractionReplyOptions | discord.MessagePayload
let handlers: Record<string, (interaction: discord.CommandInteraction) => Promise<Reply>> = {}

handlers['ping'] = (interaction: discord.CommandInteraction): Promise<Reply> =>
{
	log.debug('Ping')
	return new Promise((resolve, reject) => resolve('Pong!\n' +
	`Websocket Heartbeat: ${interaction.client.ws.ping}ms\n` +
	`Roundtrip Latency: ${Date.now() - interaction.createdTimestamp}ms`))
}

handlers['account'] = (interaction): Promise<Reply> =>
{
	return new Promise((resolve, reject) =>
	{
		log.debug('Running account command')
		const subCommand = interaction.options.data[0].name
		log.debug(`Subcommand: "${subCommand}"`)
		
		if (subCommand === 'connect')
		{
			const username = interaction.options.get('name')?.value as string
			log.debug(`Attempting to connect to account: "${username}"`)

			lClient.user(username).then((user) =>
			{
				if (!user.matchedUser)
				{
					log.verbose(`User "${username}" not found, responding with error`)
					resolve(`User "${username}" not found. Please enter a valid LeetCode username.`)
					return
				}

				log.verbose(`User "${username}" found, performing upsert into database`)

				// Add the user to the users array, or update their username if they already exist
				ServerModel.findOne({ discordId: interaction.guildId }).then((server) =>
				{
					if (!server)
					{
						log.verbose('Server not found, creating new server')
						server = new ServerModel({ discordId: interaction.guildId,
							users: [{ discordId: interaction.user.id, leetCodeName: username }] })
						server.save().then(() =>
						{
							log.verbose('Server saved, responding with success')
							resolve(`Successfully connected to account "${username}"`)
						})
						.catch((err) =>
						{
							log.error(`Error saving account "${username}" on server "${interaction.guildId}": "${err}"`)
							resolve(`Internal error saving account "${username}": "${err}"`)
						})
					}
					else
					{
						log.verbose('Server found, updating user')
						const userIndex = server.users.findIndex((user) => user.discordId === interaction.user.id)
						if (userIndex === -1)
						{
							log.verbose('User not found, adding user to server')
							server.users.push(
							{
								discordId: interaction.user.id,
								leetCodeName: username,
								completedProblems: [],
								streakCount: 0,
							})
						}
						else
						{
							log.verbose('User found, updating and resetting user')
							server.users[userIndex].leetCodeName = username
							server.users[userIndex].completedProblems = []
							server.users[userIndex].streakCount = 0
						}

						server.save().then(() =>
						{
							log.verbose('Server saved, responding with success')
							resolve(`Successfully connected to account "${username}"`)
						})
						.catch((err) =>
						{
							log.error(`Error saving account "${username}" on server "${interaction.guildId}": "${err}"`)
							resolve(`Internal error saving account "${username}": "${err}"`)
						})
					}
				})
				.catch((err) =>
				{
					log.error(`Error finding server "${interaction.guildId}" in database: "${err}"`)
					reject(`Internal error connecting to account "${username}": "${err}"`)
				})
			})
			.catch((err) =>
			{
				log.error(`Error connecting to account "${username}": "${err}"`)
				resolve(`Internal error connecting to account "${username}": "${err}"`)
			})
		}
		else if (subCommand === 'disconnect')
		{
			// Remove the user from the users array if they exist
			ServerModel.findOneAndUpdate({ discordId: interaction.guildId },
				{ $pull: { users: { discordId: interaction.user.id } } }, { upsert: true }).then((server) =>
			{
				if (!server || !server.users.find((user) => user.discordId === interaction.user.id))
				{
					log.verbose('User not found in database, responding with error')
					resolve('You are not connected to a LeetCode account, use `/account connect` to do so.')
					return
				}
				else
				{
					log.verbose('Removed user from database, responding with success')
					resolve('Successfully disconnected from your LeetCode account.')
				}
			})
			.catch((err) =>
			{
				log.error(`Error disconnecting from account: "${err}"`)
				resolve(`Internal error disconnecting from account: "${err}"`)
			})
		}
	})
}

export default handlers
