import type { ColorResolvable, Message } from 'discord.js';
import { MessageEmbed, TextBasedChannel, TextChannel, ThreadChannel } from 'discord.js';
import * as config from '../config.js';

const types = {
	INVITE_LINK: 'Invite Link deleted',
	SCAM_LINK: 'Scam link deleted',
	BLACKLISTED: 'Blacklisted substring deleted',
	MASS_PING: 'Mass ping detected'
};

export default async (type: keyof typeof types, msg: Message) => {
	const embed: MessageEmbed = new MessageEmbed()
		.setColor(config.color as ColorResolvable)
		.setTitle(types[type] ?? 'Unknown')
		.setDescription(msg.content)
		.setAuthor({
			name: msg.author.tag,
			iconURL: msg.author.displayAvatarURL({ dynamic: true })
		})
		.addField('Channel', (msg.channel as TextChannel | ThreadChannel).name, true)
		.addField('User', msg.author.toString(), true);

	(msg.client.channels.cache.get(config.logs) as TextBasedChannel)?.send({ embeds: [embed] });
};
