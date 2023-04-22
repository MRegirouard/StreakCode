import { EventEmitter } from 'events'
import discord from 'discord.js'
import LeetCode, { Problem } from 'leetcode-query'
import { ServerModel } from './database'
import { DateTime } from 'luxon'
import { getLangName } from './languages'
import log from './log'

const lClient = new LeetCode()

type Reply = string | discord.InteractionReplyOptions | discord.MessagePayload
let handlers: Record<string, (interaction: discord.CommandInteraction) => Promise<Reply>> = {}
let timezoneUpdates = new EventEmitter()

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
								points: 0,
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
				timezoneUpdates.emit('update', { serverId: interaction.guildId, timezone: timezone })
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

handlers['language'] = (interaction: discord.CommandInteraction): Promise<Reply> =>
{
	return new Promise((resolve, reject) =>
	{
		log.debug('Running language command')
		const subCommand = interaction.options.data[0].name
		log.debug(`Subcommand: "${subCommand}"`)

		if (subCommand === 'add')
		{
			const langValue = interaction.options.get('language')?.value as string
			const langName = getLangName(langValue)
			log.debug(`Adding language: "${langValue}" to server "${interaction.guildId}"`)

			// Upsert the language into the database
			ServerModel.findOneAndUpdate({ discordId: interaction.guildId }, { $addToSet: { languages: langValue } },
				{ upsert: true }).then((server) =>
			{
				const hadBefore = server?.languages.includes(langValue) ?? false

				if (!server || !hadBefore)
				{
					log.debug(`Added language "${langValue}" to server "${interaction.guildId}"`)
					resolve(`Added language "${langName}". Accepted languages are now: "${langName}"`)
				}
				else
				{
					log.debug(`Language "${langValue}" already exists in server "${interaction.guildId}"`)
					resolve(`Language "${langName}" is already accepted. Accepted languages are: ` +
						`${server.languages.map((lang) => getLangName(lang)).join(', ')}`)
				}
			})
			.catch((err) =>
			{
				log.error(`Error adding language "${langValue}" to server "${interaction.guildId}": "${err}"`)
				resolve(`Internal error adding accepted language "${langName}": "${err}"`)
			})
		}
		else if (subCommand === 'remove')
		{
			const langValue = interaction.options.get('language')?.value as string
			const langName = getLangName(langValue)
			log.debug(`Removing language: "${langValue}" from server "${interaction.guildId}"`)

			// Remove the language from the database
			ServerModel.findOneAndUpdate({ discordId: interaction.guildId }, { $pull: { languages: langValue } },
				{ upsert: true }).then((server) =>
			{
				const hadLang = server?.languages.includes(langValue) ?? false
				let response: string

				if (!server || !hadLang)
				{
					log.debug(`Language "${langValue}" not found in server "${interaction.guildId}"`)
					response = `Language "${langName}" is not accepted. Accepted languages are: `
				}
				else
				{
					server.languages = server.languages.filter((lang) => lang !== langValue)
					log.debug(`Language "${langValue}" removed from server "${interaction.guildId}"`)
					response = `Removed language "${langName}". Accepted languages are now: `
				}

				if (server?.languages.length === 0)
				{
					resolve(response + 'None')
				}
				else
				{
					resolve(response + server?.languages.map((lang) => getLangName(lang)).join(', '))
				}
			})
			.catch((err) =>
			{
				log.error(`Error removing language "${langValue}" from server "${interaction.guildId}": "${err}"`)
				resolve(`Internal error removing accepted language "${langName}": "${err}"`)
			})
		}
		else if (subCommand === 'list')
		{
			log.debug(`Listing languages for server "${interaction.guildId}"`)

			// Get the languages from the database
			ServerModel.findOne({ discordId: interaction.guildId }).then((server) =>
			{
				if (!server || server.languages.length === 0)
				{
					log.verbose(`Server "${interaction.guildId}" not found in database`)
					resolve('No accepted languages found. Use `/language add` to add a language.')
					return
				}

				log.verbose(`Server "${interaction.guildId}" has accepted languages: "${server.languages}"`)
				resolve(`Accepted languages are: "${server.languages.map((lang) => getLangName(lang)).join(', ')}"`)
			})
			.catch((err) =>
			{
				log.error(`Error listing languages for server "${interaction.guildId}": "${err}"`)
				resolve(`Internal error listing accepted languages: "${err}"`)
			})
		}
		else if (subCommand === 'clear')
		{
			log.debug(`Clearing languages for server "${interaction.guildId}"`)
			
			// Clear the languages from the database
			ServerModel.findOneAndUpdate({ discordId: interaction.guildId }, { languages: [] },
				{ upsert: true }).then(() =>
			{
				log.verbose(`Cleared languages for server "${interaction.guildId}"`)
				resolve(`Cleared accepted languages.`)
			})
			.catch((err) =>
			{
				log.error(`Error clearing languages for server "${interaction.guildId}": "${err}"`)
				resolve(`Internal error clearing accepted languages: "${err}"`)
			})
		}
	})
}

handlers['problems'] = (interaction): Promise<Reply> =>
{
	return new Promise((resolve, reject) =>
	{
		log.debug('Running problems command')

		const subCommand = interaction.options.data[0].name
		log.debug(`Subcommand: "${subCommand}"`)

		if (subCommand === 'add')
		{
			const problemSlug = interaction.options.get('problem')?.value as string
			log.debug(`Adding problem: "${problemSlug}" to server "${interaction.guildId}"`)

			lClient.problem(problemSlug).then((problem) =>
			{
				if (problem == null)
				{
					log.verbose(`Problem "${problemSlug}" not found`)
					resolve(`Problem "${problemSlug}" not found. Please provide a valid LeetCode problem slug.`)
				}
				else
				{
					log.debug(`Problem "${problemSlug}" found: "${problem.title}"`)

					ServerModel.findOneAndUpdate({ discordId: interaction.guildId },
						{ $addToSet: { problemList: problemSlug } }, { upsert: true }).then((server) =>
					{
						const hadBefore = server?.problemList.includes(problemSlug) ?? false

						if (!server || !hadBefore)
						{
							log.debug(`Problem "${problemSlug}" added to server "${interaction.guildId}"`)
							resolve(`Added problem "${problem.title}".`)
						}
						else
						{
							log.debug(`Problem "${problemSlug}" already in server "${interaction.guildId}"`)
							resolve(`Problem "${problem.title}" is already on the problem list.`)
						}
					})
					.catch((err) =>
					{
						log.error(`Error adding problem "${problemSlug}" to server "${interaction.guildId}": "${err}"`)
						resolve(`Internal error adding problem "${problem.title}": "${err}"`)
					})
				}
			})
			.catch((err) =>
			{
				log.error(`Error getting problem "${problemSlug}": "${err}"`)
				resolve(`Internal error getting problem: "${err}"`)
			})
		}
		else if (subCommand === 'remove')
		{
			const problemSlug = interaction.options.get('problem')?.value as string
			log.debug(`Removing problem: "${problemSlug}" from server "${interaction.guildId}"`)

			ServerModel.findOneAndUpdate({ discordId: interaction.guildId }, { $pull: { problemList: problemSlug } },
				{ upsert: true }).then((server) =>
			{
				const hadBefore = server?.problemList.includes(problemSlug) ?? false

				if (!server || !hadBefore)
				{
					log.debug(`Problem "${problemSlug}" not in server "${interaction.guildId}"`)
					resolve(`Problem "${problemSlug}" not found.`)
				}
				else
				{
					log.debug(`Problem "${problemSlug}" removed from server "${interaction.guildId}"`)
					resolve(`Removed problem "${problemSlug}".`)
				}
			})
			.catch((err) =>
			{
				log.error(`Error adding problem "${problemSlug}" to server "${interaction.guildId}": "${err}"`)
				resolve(`Internal error adding problem "${problemSlug}": "${err}"`)
			})
		}
		else if (subCommand === 'list')
		{
			log.debug(`Listing problems for server "${interaction.guildId}"`)

			ServerModel.findOne({ discordId: interaction.guildId }).then((server) =>
			{
				let response = '**Unsolved Problems:** '

				if (!server || server?.problemList.length == 0)
				{
					log.silly('No unsolved problems found on this server')
					response += 'None'
				}
				else
				{
					log.silly(`Found ${server?.problemList.length} unsolved problems on this server`)
					response += server?.problemList.join(', ')
				}

				response += '\n**Today\'s Problems:** '

				if (!server || server?.todayProblems.length == 0)
				{
					log.silly('No daily problems found on this server')
					response += 'None'
				}
				else
				{
					log.silly(`Found ${server?.todayProblems.length} daily problems on this server`)
					response += server?.todayProblems.join(', ')
				}

				response += '\n**Solved Problems:** '

				if (!server || server?.completedProblems.length == 0)
				{
					log.silly('No solved problems found on this server')
					response += 'None'
				}
				else
				{
					log.silly(`Found ${server?.completedProblems.length} solved problems on this server`)
					response += server?.completedProblems.join(', ')
				}

				resolve(response)
			})
			.catch((err) =>
			{
				log.error(`Error getting server "${interaction.guildId}": "${err}"`)
				resolve(`Internal error getting server: "${err}"`)
			})
		}
		else if (subCommand === 'clear')
		{
			ServerModel.findOneAndUpdate({ discordId: interaction.guildId, }, { $set: { problemList: [] } },
				{ upsert: true }).then(() =>
			{
				log.verbose(`Cleared unsolved problems for server "${interaction.guildId}"`)
				resolve('Cleared problem list.')
			})
			.catch((err) =>
			{
				log.error(`Error clearing solved problems for server "${interaction.guildId}": "${err}"`)
				resolve(`Internal error clearing solved problems: "${err}"`)
			})
		}
		else if (subCommand === 'add-bulk')
		{
			// Read interaction attachment
			const attachment = interaction.options.get('attachment')

			if (!attachment?.attachment)
			{
				resolve('No attachment found.')
				return
			}

			// Limit size to 0.25 MB
			if (attachment.attachment.size > 256 * 1024)
			{
				resolve('Attachment size too large. Please upload a text file under 0.25 MB (256 KB).')
				return
			}

			// Read attachment
			fetch(attachment.attachment.url).then((res) => res.text()).then((text) =>
			{
				log.debug(`Attachment content read, ${text.length} characters`)

				let problems: string[] = text.split('\r').join('').split('\n').filter((problem) => problem.length > 0)
				let validProblems: string[] = []
				let promises: Promise<Problem>[] = []

				// Validate problems
				for (const slug of problems)
				{
					promises.push(lClient.problem(slug))
				}

				log.debug(`Waiting for ${promises.length} problems to be fetched...`)

				// Wait for all problems to be fetched (could be slow by rate limiting)
				Promise.all(promises).then((problems) =>
				{
					log.debug(`Fetched ${problems.length} problems`)

					for (const problem of problems)
					{
						if (problem)
						{
							log.silly(`Problem "${problem.titleSlug}" is valid`)
							validProblems.push(problem.titleSlug)
						}
						else
						{
							log.silly('Found invalid problem')
						}
					}

					ServerModel.findOneAndUpdate({ discordId: interaction.guildId }, { $addToSet: { problemList:
						{ $each: validProblems } } }, { upsert: true }).then((server) =>
					{
						const validCount = validProblems.length
						const invalidCount = problems.length - validCount
						const hadBeforeCount = server?.problemList.filter((problem) =>
							validProblems.includes(problem)).length || 0

						log.verbose(`${validCount - hadBeforeCount} problems added to server "${interaction.guildId}"` +
							`, ignored ${invalidCount} invalid problems, ${hadBeforeCount} problems already existed`)
						resolve(`Added ${validCount - hadBeforeCount} problems. ${invalidCount} invalid problems ` +
						` not added, and ${hadBeforeCount} were already on the list.`)
					})
					.catch((err) =>
					{
						log.error(`Error adding problems to server "${interaction.guildId}": "${err}"`)
						resolve(`Internal error adding problems: "${err}"`)
					})

				})
				.catch((err) =>
				{
					log.error(`Error getting problems: "${err}"`)
					resolve(`Internal error getting problems: "${err}"`)
				})
			})
			.catch((err) =>
			{
				log.error(`Error getting problems: "${err}"`)
				resolve(`Internal error getting problems: "${err}"`)
			})
		}
		else if (subCommand === 'remove-bulk')
		{
			// Read interaction attachment
			const attachment = interaction.options.get('attachment')

			if (!attachment?.attachment)
			{
				resolve('No attachment found.')
				return
			}

			// Limit size to 0.25 MB
			if (attachment.attachment.size > 256 * 1024)
			{
				resolve('Attachment size too large. Please upload a text file under 0.25 MB (256 KB).')
				return
			}

			// Read attachment
			fetch(attachment.attachment.url).then((res) => res.text()).then((text) =>
			{
				log.debug(`Attachment content read, ${text.length} characters`)

				let problems: string[] = text.split('\r').join('').split('\n').filter((problem) => problem.length > 0)

				ServerModel.findOneAndUpdate({ discordId: interaction.guildId }, { $pull: { problemList:
					{ $in: problems } } }, { upsert: true }).then((server) =>
				{
					const hadBeforeCount = server?.problemList.filter((problem) =>
						problem.includes(problem)).length || 0

					log.verbose(`${hadBeforeCount} problems removed from server "${interaction.guildId}", ` +
						`${problems.length - hadBeforeCount} problems were not on the problem list`)

					resolve(`Removed ${hadBeforeCount} problems. ${problems.length - hadBeforeCount} ` +
						`problems were not on the problem list.`)
				})
				.catch((err) =>
				{
					log.error(`Error removing problems from server "${interaction.guildId}": "${err}"`)
					resolve(`Internal error removing problems: "${err}"`)
				})
			})
			.catch((err) =>
			{
				log.error(`Error getting problem list attachment: "${err}"`)
				resolve(`Internal error getting problems: "${err}"`)
			})
		}
		else if (subCommand === 'set-per-day')
		{
			const perDay = interaction.options.get('per-day')

			if (!perDay || !perDay.value || perDay.value < 0)
			{
				log.verbose(`Invalid per-day value "${perDay?.value}" for server "${interaction.guildId}"`)
				resolve('Invalid per-day value. Please enter a number greater than 0.')
				return
			}

			const perDayValue = perDay.value as number
			log.debug(`Parsed per-day value: ${perDayValue} from "${perDay.value}"`)

			ServerModel.findOneAndUpdate({ discordId: interaction.guildId }, { problemsPerDay: perDayValue },
				{ upsert: true }).then(() =>
			{
				log.verbose(`Set problems per day to ${perDayValue} for server "${interaction.guildId}"`)
				resolve(`Set problems per day to ${perDayValue}.`)
			})
			.catch((err) =>
			{
				log.error(`Error setting problems per day for server "${interaction.guildId}": "${err}"`)
				resolve(`Internal error setting problems per day: "${err}"`)
			})
		}
		else if (subCommand === 'set-random')
		{
			const random = interaction.options.get('random')

			if (!random)
			{
				log.verbose(`Invalid random value "${random}" for server "${interaction.guildId}"`)
				resolve('Invalid random value.')
				return
			}

			const randomValue = random.value as boolean
			log.debug(`Parsed random value: ${randomValue} from "${random.value}"`)

			ServerModel.findOneAndUpdate({ discordId: interaction.guildId }, { randomProblems: randomValue },
				{ upsert: true }).then(() =>
			{
				log.verbose(`Set random problems to ${randomValue} for server "${interaction.guildId}"`)
				resolve(`Set random problems to ${randomValue}.`)
			})
			.catch((err) =>
			{
				log.error(`Error setting random problems for server "${interaction.guildId}": "${err}"`)
				resolve(`Internal error setting random problems: "${err}"`)
			})
		}
	})
}

export default handlers
export { timezoneUpdates }
