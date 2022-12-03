import log from './log'

const langNames = [ 'C++', 'Java', 'Python', 'Python3', 'C', 'C#', 'JavaScript', 'Ruby', 'Swift', 'Go', 'Scala',
	'Kotlin', 'Rust', 'PHP', 'TypeScript', 'Racket', 'Erlang', 'Dart' ]

const langValues = [ 'cpp', 'java', 'python', 'python3', 'c', 'csharp', 'javascript', 'ruby', 'swift', 'go', 'scala',
	'kotlin', 'rust', 'php', 'typescript', 'racket', 'erlang', 'dart' ]

// Store language names and values formatted for Discord string option choices
const langChoices = langNames.map((name, i) => ({ name: name, value: langValues[i] }))

/**
 * Get the name of a language from its storage value.
 * @param value The value of the language.
 * @returns The name of the language.
 */
function getLangName(value: string): string
{
	const name = langNames[langValues.indexOf(value)]
	log.silly(`Language name for "${value}": "${name}"`)
	return name
}

/**
 * Get the storage value of a language from its name.
 * @param name The name of the language.
 * @returns The value of the language.
 */
function getLangValue(name: string): string
{
	const value = langValues[langNames.indexOf(name)]
	log.silly(`Language value for "${name}": "${value}"`)
	return value
}

export default langChoices
export { langChoices, getLangName, getLangValue }
