import discord from 'discord.js'
import LeetCode from 'leetcode-query'
import { ServerModel } from './database'
import { DateTime } from 'luxon'
import log from './log'

const lClient = new LeetCode()

type Reply = string | discord.InteractionReplyOptions | discord.MessagePayload
let handlers: Record<string, (interaction: discord.CommandInteraction) => Promise<Reply>> = {}
let timezones: Set<string> = new Set(['UTC'])

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

handlers['streak'] = (interaction): Promise<Reply> =>
{
	return new Promise((resolve, reject) =>
	{
		log.debug('Running streak command')
		const subCommand = interaction.options.data[0].name
		log.debug(`Subcommand: "${subCommand}"`)

		if (subCommand === 'set-timezone')
		{
			// Use UTC as the default timezone
			let timezone = 'UTC'

			// If the user specified a timezone, use that instead
			if (interaction.options.get('timezone'))
			{
				log.silly(`Timezone option found: "${interaction.options.get('timezone')?.value}"`)
				timezone = interaction.options.get('timezone')?.value as string
			}

			log.debug(`Verifying timezone: "${timezone}"`)

			// Verify that the timezone is valid using the Luxon library
			if (!DateTime.local().setZone(timezone).isValid)
			{
				log.verbose(`Timezone "${timezone}" is invalid`)
				resolve({ content: `Invalid timezone provided: "${timezone}". Please select a valid timezone from ` +
				'this list: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones', flags: ['SuppressEmbeds'] })
				return
			}

			log.debug(`Timezone "${timezone}" is valid`)
			log.debug('Performing upsert of timezone to server in database')

			// Upsert the timezone into the database
			ServerModel.findOneAndUpdate({ discordId: interaction.guildId }, { timezone: timezone },
				{ upsert: true }).then(() =>
			{
				// Add the timezone to the cache
				timezones.add(timezone)
				log.verbose(`Timezone updated to "${timezone}"`)
				resolve(`Set timezone to "${timezone}"`)
			})
			.catch((err) =>
			{
				log.error(`Error updating timezone for server "${interaction.guildId}": "${err}"`)
				resolve(`Internal error updating timezone: "${err}"`)
			})
		}
		else if (subCommand === 'set-streak-threshold')
		{
			const streakThreshold = interaction.options.get('threshold')

			if (!streakThreshold || !streakThreshold.value || streakThreshold.value < 1)
			{
				resolve('Invalid streak threshold value. Please enter a number greater than 0.')
				return
			}

			const thresholdValue = streakThreshold.value as number
			log.debug(`Parsed streak threshold value: ${thresholdValue} from "${streakThreshold.value}"`)

			// Upsert the streak threshold into the database
			ServerModel.findOneAndUpdate({ discordId: interaction.guildId }, { streakThreshold: thresholdValue },
				{ upsert: true }).then(() =>
			{
				log.verbose(`Set streak threshold to ${thresholdValue} for server "${interaction.guildId}"`)
				resolve(`Set streak threshold to ${thresholdValue}.`)
			})
			.catch((err) =>
			{
				log.error(`Error setting streak threshold for server "${interaction.guildId}": "${err}"`)
				resolve(`Internal error setting streak threshold: "${err}"`)
			})
		}
		else if (subCommand === 'set-streak-role')
		{
			const role = interaction.options.get('role')

			if (!role || !role.value)
			{
				resolve('Invalid role provided. Please enter a valid role.')
				return
			}

			const roleValue = role.value as string
			log.debug(`Parsed role value: ${roleValue} from "${role.value}"`)

			// Upsert the streak role into the database
			ServerModel.findOneAndUpdate({ discordId: interaction.guildId }, { streakRole: roleValue },
				{ upsert: true }).then(() =>
			{
				log.verbose(`Set streak role to ${roleValue} for server "${interaction.guildId}"`)
				resolve(`Set streak role to <@&${roleValue}>.`)
			})
			.catch((err) =>
			{
				log.error(`Error setting streak role for server "${interaction.guildId}": "${err}"`)
				resolve(`Internal error setting streak role: "${err}"`)
			})
		}
		else if (subCommand === 'set-streak-loss-role')
		{
			const role = interaction.options.get('role')

			if (!role || !role.value)
			{
				resolve('Invalid role provided. Please enter a valid role.')
				return
			}

			const roleValue = role.value as string
			log.debug(`Parsed role value: ${roleValue} from "${role.value}"`)

			// Upsert the streak loss role into the database
			ServerModel.findOneAndUpdate({ discordId: interaction.guildId }, { lostStreakRole: roleValue },
				{ upsert: true }).then(() =>
			{
				log.verbose(`Set streak loss role to ${roleValue} for server "${interaction.guildId}"`)
				resolve(`Set streak loss role to <@&${roleValue}>.`)
			})
			.catch((err) =>
			{
				log.error(`Error setting streak loss role for server "${interaction.guildId}": "${err}"`)
				resolve(`Internal error setting streak loss role: "${err}"`)
			})
		}
		else if (subCommand === 'set-updates-channel')
		{
			const channel = interaction.options.get('channel')

			if (!channel || !channel.value)
			{
				resolve('Invalid channel provided. Please enter a valid channel.')
				return
			}

			const channelValue = channel.value as string
			log.debug(`Parsed channel value: ${channelValue} from "${channel.value}"`)

			// Upsert the updates channel into the database
			ServerModel.findOneAndUpdate({ discordId: interaction.guildId }, { updatesChannel: channelValue },
				{ upsert: true }).then(() =>
			{
				log.verbose(`Set updates channel to ${channelValue} for server "${interaction.guildId}"`)
				resolve(`Set updates channel to <#${channelValue}>.`)
			})
			.catch((err) =>
			{
				log.error(`Error setting updates channel for server "${interaction.guildId}": "${err}"`)
				resolve(`Internal error setting updates channel: "${err}"`)
			})
		}
	})
}

export default handlers
export { timezones }
