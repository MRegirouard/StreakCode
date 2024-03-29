import mongoose from 'mongoose'
import dotenv from 'dotenv'
import log from './log'

dotenv.config()

const Server = new mongoose.Schema(
{
	discordId: { type: String, required: true, unique: true },
	timezone: { type: String, required: true, default: 'UTC' },
	languages: [String],
	allowAnyLanguage: { type: Boolean, default: true },
	users: [
	{
		discordId: { type: String, required: true },
		leetCodeName: { type: String, required: true },
		completedProblems: [String],
		streakCount: { type: Number, default: 0, min: 0 },
		points: { type: Number, default: 0, min: 0 },
	}],
	streakRole: String,
	lostStreakRole: String,
	updatesChannel: String,
	streakThreshold: { type: Number, required: true, default: 5, min: 1 },
	problemList: [String],
	todayProblems: [String],
	completedProblems: [String],
	problemsPerDay: { type: Number, required: true, default: 1, min: 0 },
	randomize: { type: Boolean, required: true, default: false },
	hardPoints: { type: Number, required: true, default: 5, min: 0 },
	mediumPoints: { type: Number, required: true, default: 3, min: 0 },
	easyPoints: { type: Number, required: true, default: 2, min: 0 },
	constStreakPoints: { type: Number, required: true, default: 1, min: 0 },
	dynamicStreakPoints: { type: Boolean, required: true, default: false },
	dailyProblemPoints: { type: Number, required: true, default: 1, min: 0 },
})

const ServerModel = mongoose.model('Server', Server)

log.debug(`Connecting to MongoDB with URI "${process.env.MONGOOSE_URI}"`)

mongoose.connect(process.env.MONGOOSE_URI || '').then(() =>
{
	log.info('Successfully connected to MongoDB Database')
})
.catch((err) =>
{
	log.error(`Failed to connect to MongoDB: "${err}"`)
})

export default mongoose
export { mongoose, ServerModel }
