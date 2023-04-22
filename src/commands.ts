import { ChannelType, SlashCommandBuilder } from "discord.js"
import langChoices from "./languages"

const accountCmd = new SlashCommandBuilder()
	.setName("account")
	.setDescription("Manage LeetCode account connection")
	.addSubcommand((connectCmd) =>
		connectCmd.setName('connect')
		.setDescription('Connect your LeetCode account')
		.addStringOption((nameOpt) =>
			nameOpt.setName('name')
			.setDescription('Your LeetCode username')
			.setRequired(true)))
	.addSubcommand((disconnectCmd) =>
		disconnectCmd.setName('disconnect')
		.setDescription('Disconnect your LeetCode account'))

const streakCmd = new SlashCommandBuilder()
	.setName("streak")
	.setDescription("Manage streaks")
	.addSubcommand((setTimezoneCmd) =>
		setTimezoneCmd.setName('set-timezone')
		.setDescription('Set timezone for streaks')
		.addStringOption((timezoneOpt) =>
			timezoneOpt.setName('timezone')
			.setDescription('Timezone to set')
			.setRequired(true)))
	.addSubcommand((setStreakThresholdCmd) =>
		setStreakThresholdCmd.setName('set-streak-threshold')
		.setDescription('Set the number of days to count as a streak')
		.addIntegerOption((thresholdOpt) =>
			thresholdOpt.setName('threshold')
			.setDescription('Streak threshold')
			.setRequired(true)))
	.addSubcommand((setStreakRoleCmd) =>
		setStreakRoleCmd.setName('set-streak-role')
		.setDescription('Set the role to give to users with a streak')
		.addRoleOption((roleOpt) =>
			roleOpt.setName('role')
			.setDescription('Streak role')
			.setRequired(true)))
	.addSubcommand((setStreakLossThresholdCmd) =>
		setStreakLossThresholdCmd.setName('set-streak-loss-role')
		.setDescription('Set the role to give to users without a streak')
		.addRoleOption((roleOpt) =>
			roleOpt.setName('role')
			.setDescription('Streak loss role')
			.setRequired(true)))
	.addSubcommand((setUpdatesChannel) =>
		setUpdatesChannel.setName('set-updates-channel')
		.setDescription('Set the channel to send streak updates to')
		.addChannelOption((channelOpt) =>
			channelOpt.setName('channel')
			.setDescription('Updates channel')
			.addChannelTypes(ChannelType.GuildText)
			.addChannelTypes(ChannelType.GuildAnnouncement)
			.setRequired(true)))

const languageCmd = new SlashCommandBuilder()
	.setName("language")
	.setDescription("Manage accepted languages")
	.addSubcommand((addCmd) =>
		addCmd.setName('add')
		.setDescription('Add an accepted language')
		.addStringOption((languageOpt) =>
			languageOpt.setName('language')
			.setDescription('Language to add')
			.addChoices(...langChoices)
			.setRequired(true)))
	.addSubcommand((removeCmd) =>
		removeCmd.setName('remove')
		.setDescription('Remove an accepted language')
		.addStringOption((languageOpt) =>
			languageOpt.setName('language')
			.setDescription('Language to remove')
			.addChoices(...langChoices)
			.setRequired(true)))
	.addSubcommand((listCmd) =>
		listCmd.setName('list')
		.setDescription('List accepted languages'))
	.addSubcommand((clearCmd) =>
		clearCmd.setName('clear')
		.setDescription('Clear accepted languages'))
	.addSubcommand((acceptAllCmd) =>
		acceptAllCmd.setName('set-accept-all')
		.setDescription('Accept all languages'))

const problemCommand = new SlashCommandBuilder()
	.setName("problems")
	.setDescription("Manage problem set")
	.addSubcommand((addCmd) =>
		addCmd.setName('add')
		.setDescription('Add a problem to the problem set')
		.addStringOption((problemOpt) =>
			problemOpt.setName('problem')
			.setDescription('Problem to add to the set, from the LeetCode URL (e.g. two-sum)')
			.setRequired(true)))
	.addSubcommand((removeCmd) =>
		removeCmd.setName('remove')
		.setDescription('Remove a problem from the problem set')
		.addStringOption((problemOpt) =>
			problemOpt.setName('problem')
			.setDescription('Problem to remove from the set, from the LeetCode URL (e.g. two-sum)')
			.setRequired(true)))
	.addSubcommand((listCmd) =>
		listCmd.setName('list')
		.setDescription('List problems in the problem set'))
	.addSubcommand((clearCmd) =>
		clearCmd.setName('clear')
		.setDescription('Remove all problems from the problem set'))
	.addSubcommand((addBulkCmd) =>
		addBulkCmd.setName('add-bulk')
		.setDescription('Add many problems to the problem set')
		.addAttachmentOption((attachmentOpt) =>
			attachmentOpt.setName('attachment')
			.setDescription('Attachment containing a list of problems to add')
			.setRequired(true)))
	.addSubcommand((removeBulkCmd) =>
		removeBulkCmd.setName('remove-bulk')
		.setDescription('Remove many problems from the problem set')
		.addAttachmentOption((attachmentOpt) =>
			attachmentOpt.setName('attachment')
			.setDescription('Attachment containing a list of problems to remove')
			.setRequired(true)))
	.addSubcommand((setPerDayCmd) =>
		setPerDayCmd.setName('set-per-day')
		.setDescription('Set the number of problems to be assigned per day')
		.addIntegerOption((perDayOpt) =>
			perDayOpt.setName('per-day')
			.setDescription('Number of problems to assign per day')
			.setRequired(true)))
	.addSubcommand((setRandomCmd) =>
		setRandomCmd.setName('set-random')
		.setDescription('Set whether problems should be assigned randomly or in order')
		.addBooleanOption((randomOpt) =>
			randomOpt.setName('random')
			.setDescription('Whether problems should be assigned randomly')
			.setRequired(true)))

const pointsCommand = new SlashCommandBuilder()
	.setName("points")
	.setDescription("Configure point system")
	.addSubcommand((setHardPts) =>
		setHardPts.setName('hard-problem')
		.setDescription('Set the number of points to give for solving hard problem')
		.addIntegerOption((hardPtsOpt) =>
			hardPtsOpt.setName('points')
			.setDescription('Number of points to give for solving hard problem')
			.setRequired(true)))
	.addSubcommand((setMediumPts) =>
		setMediumPts.setName('medium-problem')
		.setDescription('Set the number of points to give for solving medium problem')
		.addIntegerOption((mediumPtsOpt) =>
			mediumPtsOpt.setName('points')
			.setDescription('Number of points to give for solving medium problem')
			.setRequired(true)))
	.addSubcommand((setEasyPts) =>
		setEasyPts.setName('easy-problem')
		.setDescription('Set the number of points to give for solving easy problem')
		.addIntegerOption((easyPtsOpt) =>
			easyPtsOpt.setName('points')
			.setDescription('Number of points to give for solving easy problem')
			.setRequired(true)))
	.addSubcommandGroup((setPtsGroup) =>
		setPtsGroup.setName('streak')
		.setDescription('Set the number and method of giving points for maintaining a streak')
		.addSubcommand((constantPts) =>
			constantPts.setName('constant')
			.setDescription('Give a constant number of points for maintaining a streak')
			.addIntegerOption((constantPtsOpt) =>
				constantPtsOpt.setName('points')
				.setDescription('Number of points to give for maintaining a streak')
				.setRequired(true)))
		.addSubcommand((growPts) =>
			growPts.setName('dynamic')
			.setDescription('Award an increasing number of points for maintaining a streak, using a logarithmic function')))
	.addSubcommand((setDailyProbPts) =>
		setDailyProbPts.setName('daily-problem')
		.setDescription('Set the number of bonus points to award for solving the daily problem')
		.addIntegerOption((dailyProbPtsOpt) =>
			dailyProbPtsOpt.setName('points')
			.setDescription('Number of bonus points to give for solving the daily problem')
			.setRequired(true)))

const commands = [accountCmd, streakCmd, languageCmd, problemCommand, pointsCommand]
export default commands
