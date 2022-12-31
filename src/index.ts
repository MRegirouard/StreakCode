import log from './log'
import dotenv from 'dotenv'
import discord, { TextChannel, EmbedBuilder } from 'discord.js'
import commandHandlers, { timezoneUpdates } from './commandHandlers'
import { ServerModel } from './database'
import LeetCode, { RecentSubmission } from 'leetcode-query'
import { CronJob } from 'cron'

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

const lClient = new LeetCode()

// Represents a LeetCode user across multiple discord users and servers
interface MultiUser
{
	leetCodeName: string
	discordIds: string[]
	updateChannelIds: string[]
	completedProblems: Set<string>
}

log.debug('Creating solved problem check cron job...')

new CronJob('* * * * *', () =>
{
	log.debug('Checking if any new problems have been solved...')

	ServerModel.find({}).select(['discordId', 'users', 'updatesChannel']).then((servers) =>
	{
		log.verbose(`Updating completed problems for ${servers.length} servers...`)

		// Group users by leetcode name and store the discord id of the server
		let users: MultiUser[] = []

		servers.forEach((server) => server.users.forEach((user) =>
		{
			let foundUser = users.find((u) => u.leetCodeName === user.leetCodeName)

			if (foundUser)
			{
				foundUser.discordIds.push(user.discordId)
				foundUser.updateChannelIds.push(server.updatesChannel as string)
				user.completedProblems.forEach((problem) => foundUser!.completedProblems.add(problem))
			}
			else
			{
				let newUser: MultiUser = {
					leetCodeName: user.leetCodeName,
					discordIds: [user.discordId],
					updateChannelIds: [server.updatesChannel as string],
					completedProblems: new Set()
				}
				user.completedProblems.forEach((problem) => newUser.completedProblems.add(problem))
				users.push(newUser)
			}
		}))

		log.verbose(`Updating completed problems for ${users.length} total users...`)

		let userPromises: Promise<void>[] = []

		// Loop through each user and update their completed problems
		users.forEach((user) =>
		{
			userPromises.push(lClient.user(user.leetCodeName).then((leetCodeUser) =>
			{
				if (!leetCodeUser || !leetCodeUser.matchedUser || !leetCodeUser.recentSubmissionList)
				{
					log.error(`Failed to get user "${user.leetCodeName}" from LeetCode`)
					return
				}

				log.debug(`Updating completed problems for user "${user.leetCodeName}"...`)

				let newSolved: RecentSubmission[] = []

				for (const submission of leetCodeUser.recentSubmissionList)
				{
					if (submission.statusDisplay === 'Accepted' && !user.completedProblems.has(submission.titleSlug))
					{
						log.silly(`User "${user.leetCodeName}" has solved a new problem: "${submission.titleSlug}"`)
						newSolved.push(submission)
						user.completedProblems.add(submission.titleSlug)
					}
				}

				if (newSolved.length === 0)
					return
				
				user.updateChannelIds.forEach((channelId, i) =>
				{
					if (!channelId || channelId == '')
						return

					dClient.channels.fetch(channelId).then((channel) =>
					{
						const txtChannel = channel as TextChannel
						newSolved.forEach((submission) =>
						{
							log.silly(`Sending embed message to channel "${channelId}"`)

							const embed = new EmbedBuilder()
								.setTitle('New problem solved!')
								.setColor('#00ff00')
								.setDescription(`[${submission.title}]` +
								`(https://leetcode.com/problems/${submission.titleSlug}/)`)
								.addFields({ name: 'User', value: `<@${user.discordIds[i]}>`, inline: true })
								.addFields({ name: 'LeetCode User', value: `[${user.leetCodeName}]` +
								`(https://leetcode.com/${user.leetCodeName}/)`, inline: true })

							txtChannel.send({ embeds: [embed] }).then(() =>
							{
								log.debug(`Sent new problem solved message to channel "${channelId}"`)
							})
							.catch((err) =>
							{
								log.error('Failed to send new problem solved message to channel ' +
								`"${channelId}": "${err}"`)
							})
						})
					})
					.catch((err) =>
					{
						log.error(`Failed to fetch channel "${channelId}": "${err}"`)
					})
				})
			})
			.catch((err) =>
			{
				log.error(`Failed to get user "${user.leetCodeName}" from LeetCode: "${err}"`)
			}))
		})

		Promise.all(userPromises).finally(() =>
		{
			servers.forEach((server) =>
			{
				let modified = false
				server.users.forEach((user) =>
				{
					const multiUser = users.find((u) => u.leetCodeName === user.leetCodeName)
	
					if (multiUser)
					{
						user.completedProblems = Array.from(multiUser.completedProblems)
						modified = true
					}
				})
	
				if (!modified)
					return
	
				server.save().then(() =>
				{
					log.verbose(`Server "${server.discordId}" saved`)
				}).catch((err) =>
				{
					log.error(`Failed to save server "${server.discordId}"`)
				})
			})
		})
	})
}, null, true)

let timezoneJobs = new Map<string, CronJob>()

timezoneUpdates.on('update', (update: { serverId: string, timezone: string }) =>
{
	log.verbose(`Timezone for server "${update.serverId}" updated to "${update.timezone}"`)

	if (timezoneJobs.has(update.serverId))
	{
		timezoneJobs.get(update.serverId)!.stop()
		timezoneJobs.delete(update.serverId)
	}

	timezoneJobs.set(update.serverId, new CronJob(`0 0 0 * * *`, () =>
	{
		daily(update.serverId)
	}, null, true, update.timezone))
})

log.verbose('Fetching servers to start daily jobs...')

ServerModel.find().then((servers) => servers.forEach((server) =>
{
	log.debug(`Starting daily job for server "${server.discordId}"...`)
	timezoneJobs.set(server.discordId, new CronJob(`0 0 0 * * *`, () =>
	{
		daily(server.discordId)
	}, null, true, server.timezone))
}))

// Update problem lists, send messages, and update streaks and streak roles
function daily(discordId: string)
{
	log.verbose(`Running daily job for server "${discordId}"...`)

	// Fetch the server
	ServerModel.findOne({ discordId: discordId }).then((server) =>
	{
		if (!server)
		{
			log.error(`Server "${discordId}" not found for daily job`)
			return
		}

		log.verbose(`Updating problems for server "${discordId}"...`)

		// Update the problem lists
		let nextProblems: string[] = []

		if (server.problemsPerDay >= server.problemList.length)
		{
			nextProblems = server.problemList
			server.problemList = []
		}
		else if (server.randomize)
		{
			nextProblems.push(...server.problemList.sort(() => Math.random() - 0.5).slice(0, server.problemsPerDay))
			server.problemList = server.problemList.filter((problem) => !nextProblems.includes(problem))
		}
		else
		{
			nextProblems.push(...server.problemList.slice(0, server.problemsPerDay))
			server.problemList = server.problemList.slice(server.problemsPerDay)
		}

		log.verbose(`Updating streaks for server "${discordId}"...`)

		// Fetch the guild and channel
		const guildPromise = dClient.guilds.fetch(discordId)
		guildPromise.catch((err) =>
		{
			log.error(`Failed to fetch guild "${discordId}" for daily job: "${err}"`)
		})

		let channelPromise: Promise<TextChannel | null> | null = null
		
		if (server.updatesChannel)
		{
			channelPromise = guildPromise.then((guild) =>
			{
				return guild.channels.fetch(server.updatesChannel as string) as Promise<TextChannel | null>
			})
		}

		// Make sure each user has solved all the problems
		server.users.forEach((user) =>
		{
			let keepStreak = true
			server.todayProblems.forEach((problem) =>
			{
				if (!user.completedProblems.includes(problem))
				{
					keepStreak = false
					user.streakCount = 0
					return
				}
			})

			if (keepStreak)
			{
				user.streakCount++
			}
		})

		// Cycle the problem lists
		server.completedProblems.push(...server.todayProblems)
		server.todayProblems = nextProblems

		// If there are roles to add, add them
		if (server.users.length > 0 && ((server.streakRole && server.streakRole !== '') ||
			(server.lostStreakRole && server.lostStreakRole !== '')))
		{
			guildPromise.then((guild) =>
			{
				if (!guild)
				{
					log.error(`Failed to fetch guild "${discordId}" for adding streak role`)
					return
				}

				log.silly(`Guild fetched, updating roles for ${server.users.length} members...`)

				guild.members.fetch({ user: server.users.map((u) => u.discordId) }).then((members) => 
					members.forEach((member) => 
				{
					// Find the user in the database
					const dbUser = server.users.find((u) => u.discordId === member.id)

					if (!dbUser)
					{
						log.warn(`Extra member "${member.id}" retrieved from server "${discordId}"`)
						return
					}

					let addRole: string, removeRole: string

					if (dbUser.streakCount > server.streakThreshold)
					{
						log.silly(`Member "${member.id}" has streak count ${dbUser.streakCount}, adding streak role...`)
						addRole = server.streakRole as string
						removeRole = server.lostStreakRole as string
					}
					else
					{
						log.silly(`Member "${member.id}" has streak count ${dbUser.streakCount}` +
						', adding lost streak role...')
						addRole = server.lostStreakRole as string
						removeRole = server.streakRole as string
					}

					log.silly(`Add role: "${addRole}", remove role: "${removeRole}"`)
					
					// Add the role if there is one
					if (addRole && addRole !== '')
					{
						log.silly(`Adding role "${addRole}" to member "${member.id}"...`)
						member.roles.add(addRole).then(() =>
						{
							log.verbose(`Added role "${addRole}" to member "${member.id}" in server "${discordId}"`)
						})
						.catch((err) =>
						{
							log.error(`Failed to add role "${addRole}" to member "${member.id}" in server ` +
							`"${discordId}": "${err}"`)
						})
					}

					// Remove the role if there is one
					if (removeRole && removeRole !== '')
					{
						log.silly(`Removing role "${removeRole}" from member "${member.id}"...`)
						member.roles.remove(removeRole).then(() =>
						{
							log.verbose(`Removed role "${removeRole}" from member "${member.id}" in server ` +
							`"${discordId}"`)
						})
						.catch((err) =>
						{
							log.error(`Failed to remove role "${removeRole}" from member "${member.id}" in server ` +
							`"${discordId}": "${err}"`)
						})
					}
				}))
				.catch((err) =>
				{
					log.error(`Failed to fetch members for adding streak role: "${err}"`)
				})
			})
		}

		// Send the daily problem message
		if (channelPromise)
		{
			channelPromise.then((channel) =>
			{
				if (!channel)
				{
					log.warn(`Channel "${server.updatesChannel}" not found for daily job`)
					return
				}

				channel.send(`Today's problems are: ${nextProblems.join(', ')}`)
			})
		}

		// Save the server
		server.save().then(() =>
		{
			log.info(`Server "${discordId}" updated`)
		})
		.catch((err) =>
		{
			log.error(`Failed to save server "${discordId}": "${err}"`)
		})
	})
	.catch((err) =>
	{
		log.error(`Failed to find server "${discordId}": "${err}"`)
	})
}
