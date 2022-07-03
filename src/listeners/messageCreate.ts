import { Listener } from '@sapphire/framework';
import {
	ColorResolvable,
	DMChannel,
	GuildMember,
	Message,
	MessageActionRow,
	MessageButton,
	MessageEmbed,
	NewsChannel,
	PartialDMChannel,
	TextChannel,
	ThreadChannel,
	VoiceBasedChannel,
	WebhookClient
} from 'discord.js';
import log from '../utils/log.js';
import { emotes } from '../utils/emotes.js';
import * as config from '../config.js';
import sleep from '../utils/sleep.js';
import fetch from 'node-fetch';
import type { Ticket } from '../structures/Ticket.js';

export class MessageCreateListener extends Listener {
	inviteRegex = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite)\/.+[a-z]/gi;
	domainRegex = /(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]/gi;
	autoDelete = /[\u0900-\u097F]/gm;

	//@ts-expect-error
	public async run(msg: Message) {
		if (msg.author.bot || msg.webhookId || msg.guildId !== config.mainServer) return;

		if ((msg.mentions.members?.size ?? 0) >= 5 && !this.isStaff(msg.member!) && !this.isTicket(msg.channel)) {
			const res = await msg.member?.timeout(1 * 60 * 60 * 1000, 'Mass mentioning members');
			log('MASS_PING', msg);
			if (res) {
				const embed: MessageEmbed = new MessageEmbed()
					.setAuthor({
						name: msg.author.tag,
						iconURL: msg.author.displayAvatarURL({ dynamic: true })
					})
					.setColor(config.color as ColorResolvable)
					.setDescription(`${emotes.timeout} ${msg.author} has been timed out for 1h`)
					.addField('Reason', 'Mass mentioning members', true);

				await msg.channel.send({ embeds: [embed] });
			}
		}
		if (msg.channelId === config.boostChannel && !msg.author.bot) {
			const msgs = await msg.channel.messages.fetch();
			(msg.channel as TextChannel).bulkDelete(msgs.filter((m) => m.author.id === msg.client.user!.id));
			if (msg.system) {
				const button = new MessageButton()
				.setStyle('LINK')
				.setURL(`${config.boostPerks}`)
				.setEmoji(`${emotes.boost}`)
				.setLabel('Boost Perks');
				// const embed = new MessageEmbed().setColor('#e659f3').setTitle('Boost Perks');

				const comp = new MessageActionRow().setComponents([button]);
				msg.channel.send({
					content: `${msg.author} Thank you for boosting!, make a ticket in <#${config.ticketChannel}> to claim your perks.`,
					// embeds: [embed],
					components: [comp]
				});
			}
		}

		if (this.inviteRegex.test(msg.content) && !this.isTicket(msg.channel) && !this.isStaff(msg.member!)) {
			await msg.delete();
			log('INVITE_LINK', msg);
			const res = await msg.member?.timeout(30 * 1000, 'Sending Invite links');
			if (res) {
				const embed: MessageEmbed = new MessageEmbed()
					.setAuthor({
						name: msg.author.tag,
						iconURL: msg.author.displayAvatarURL({ dynamic: true })
					})
					.setColor(config.color as ColorResolvable)
					.setDescription(`${emotes.timeout} ${msg.author} has been timed out for 30s`)
					.addField('Reason', 'Sending Invite links', true);

				await msg.channel.send({ embeds: [embed] });
			}
		}

		if (this.domainRegex.test(msg.content) && !this.isStaff(msg.member!)) {
			const trustedDomains = [
				'discord.gg',
				'discord.com',
				'youtube.com',
				'twitter.com',
				'instagram.com',
				'facebook.com'
			];

			const domains = [...new Set(msg.content.match(this.domainRegex))].filter(
				(link) => !trustedDomains.includes(link)
			);
			if (domains.length === 0) return;

			const data = JSON.stringify({
				message: domains.join(' ')
			});

			const res = await fetch('https://anti-fish.bitflow.dev/check', {
				method: 'POST',
				body: data,
				headers: {
					'User-Agent': `${msg.client.user!.username} (${msg.client.user!.id})`,
					'Content-Type': 'application/json',
					'Content-Length': `${data.length}`
				}
			}).catch((e) => {
				console.log('Unable to connect with anti-fish API!', e);
				return null;
			});
			if (!res) return;

			const response = (await res.json()) as {
				match: boolean;
				matches?: {
					followed: boolean;
					domain: string;
					source: string;
					type: 'PHISHING' | 'IP_LOGGER';
					trust_rating: number;
				}[];
			};

			if (!response.match) return;

			await msg.delete();
			log('SCAM_LINK', msg);

			const timedOut = await msg.member?.timeout(2 * 60 * 60 * 1000, 'Sending scam links');
			if (!timedOut) return;

			const embed: MessageEmbed = new MessageEmbed()
				.setAuthor({
					name: msg.author.tag,
					iconURL: msg.author.displayAvatarURL({ dynamic: true })
				})
				.setColor(config.color as ColorResolvable)
				.setDescription(`${emotes.timeout} ${msg.author} has been timed out for 2h`)
				.addField('Reason', 'Sending scam links', true);

			response.matches!.forEach((match, i) => {
				embed.addField(
					`Match #${i + 1}`,
					`Source: \`${match.source}\`${config.dot}Confidence: \`${Math.round(match.trust_rating * 100)}%\``
				);
			});

			await msg.channel.send({ embeds: [embed] });
		}

		if (
			config.blacklistedWords.some((word) => msg.content.toLowerCase().includes(word)) &&
			!this.isTicket(msg.channel) &&
			!this.isStaff(msg.member!)
		) {
			if (!msg.member?.permissions.has('MANAGE_MESSAGES')) {
				await msg.delete();
				log('BLACKLISTED', msg);
				const res = await msg.channel.send(`${msg.author}, Your message contained a blacklisted word.`);
				sleep(5 * 1000);
				res.delete();
			}
		}

		if (this.autoDelete.test(msg.content) && !this.isStaff(msg.member!)) msg.delete();

		if (msg.content.startsWith(msg.client.tags.prefix)) {
			const trigger = msg.content.slice(msg.client.tags.prefix.length);
			const data = msg.client.tags.get(trigger);
			if (data) msg.reply(JSON.parse(data));
		}

		if (msg.channelId === config.automatedSupport) {
			const res = msg.client.classifier.getClassifications(msg.content);
			if (res[0].value <= 0.5) return msg.react('<:BlobCatThink:916972425965604875>');

			const button = new MessageButton()
				.setStyle('PRIMARY')
				.setDisabled()
				.setCustomId('AI_SUPPORT')
				.setLabel(`Confidence: ${Math.round(res[0].value * 100)}%`);

			const comp = new MessageActionRow().setComponents([button]);

			return (msg.client.webhooks.get('AI_SUPPORT') as WebhookClient).send({
				content: res[0].label,
				components: [comp]
			});
		}
	}

	private isTicket(
		channel: DMChannel | PartialDMChannel | TextChannel | ThreadChannel | NewsChannel | VoiceBasedChannel
	) {
		return channel.client.tickets.some((t: Ticket) => t.channel?.id === channel.id);
	}

	private isStaff(member: GuildMember) {
		return member.permissions.has('ADMINISTRATOR') || member.roles.cache.some((r) => config.staffRoles.includes(r.id));
	}
}
