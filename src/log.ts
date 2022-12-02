/**
 * A custom logger for this project
 */

import dotenv from 'dotenv'
import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import DiscordTransport from 'winston-discord-transport'

dotenv.config()

// Create a custom log format that prints the timestamp, level, and message in a formated way
const customFormat = winston.format.printf((info : winston.LogEntry) =>
{
	let spaceVal = 7

	if (info.level.length > 7)
		spaceVal = 17

	info.level = info.level.padStart(info.level.length + Math.floor((spaceVal - info.level.length) / 2), ' ')
	info.level = info.level.padEnd(spaceVal, ' ')
	const date = new Date()
	info.timestamp = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
	info.timestamp = info.timestamp.slice(0, -3) + '.' + date.getMilliseconds().toString().padStart(3, '0') + info.timestamp.slice(-3)

	return `[ ${info.timestamp} ] [ ${info.level} ] ${info.message}`
})

// A custom log format to capitalize the log level
const capsFormat = winston.format((info : winston.LogEntry) =>
{
	info.level = info.level.toUpperCase()
	return info
})()

// Create the logger
const log : winston.Logger = winston.createLogger(
{
	exitOnError: false,
	level: 'silly',
	transports: [
		new DailyRotateFile(
		{
			filename: 'logs/%DATE%.log',
			format: winston.format.combine(capsFormat, customFormat),
			handleExceptions: true
		}),
		new winston.transports.Console(
		{
			format: winston.format.combine(capsFormat, winston.format.colorize(), customFormat),
			handleExceptions: true
		})
	]
})

// Change console logging level based on environment
if (!process.env.NODE_ENV || !process.env.NODE_ENV.toLowerCase().startsWith('dev'))
{
	// Add a Discord transport
	log.add(new DiscordTransport(
	{
		level: 'info',
		webhook: `${process.env.DISCORD_LOG_WEBHOOK}`,
		defaultMeta: {},
		handleExceptions: true
	}))
}

export default log
