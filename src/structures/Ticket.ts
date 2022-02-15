import type { SapphireClient } from '@sapphire/framework';
import {
	BaseGuildTextChannel,
	ButtonInteraction,
	GuildMember,
	GuildTextBasedChannel,
	Message,
	MessageEmbed,
	ModalSubmitInteraction,
	User
} from 'discord.js';
import { ticketLogsChannel, transcriptChannel, staffRoles, dot } from '../config.js';
import { transcript } from '../utils/transcript.js';

export class Ticket {
	ticketNumber: number;
	user: User;
	channel: GuildTextBasedChannel | null;
	reason: string;

	constructor(
		client: SapphireClient,
		interaction: ModalSubmitInteraction | ButtonInteraction | null,
		channel?: BaseGuildTextChannel,
		author?: User
	) {
		let prev: number | null;
		if (interaction) {
			prev = client.db.get('ticketCounter') as number;
			client.db.set('ticketCounter', prev + 1);
		}

		this.ticketNumber = interaction ? prev! + 1 : parseInt(channel?.name?.split('-')[1] ?? '0');
		this.user = author ?? interaction!.user;
		this.channel = (channel as GuildTextBasedChannel) ?? null;
		this.reason = channel
			? channel.topic ?? 'none'
			: interaction!.isModalSubmit()
			? interaction.components[0].components[0].value
			: 'none';
	}

	async delete(staff: GuildMember, reason: 'STAFF_DELETE' | 'AUTO_DELETE') {
		await this.log(staff);

		const reasons = {
			STAFF_DELETE: 'Ticket deleted by staff',
			AUTO_DELETE: 'Ticket deleted automatically'
		};

		const em = new MessageEmbed()
			.setAuthor({ name: this.user.tag, iconURL: this.user.displayAvatarURL({ dynamic: true }) })
			.setTitle(reasons[reason] ?? 'Ticket deleted')
			.setDescription(this.reason)
			.setColor('RED')
			.setFooter({ text: staff.user.tag, iconURL: staff.user.displayAvatarURL({ dynamic: true }) })
			.setTimestamp();

		await (staff.guild.channels.cache.get(ticketLogsChannel)! as GuildTextBasedChannel).send({ embeds: [em] });

		staff.client.tickets.delete(this.user.id);
		return this.channel!.delete();
	}

	private async log(staff: GuildMember) {
		const msgsArray: Message[] = [];
		let first: string | undefined = undefined;
		let msgs: Message[] | null = null;

		staff.client.deleting = true;

		do {
			msgs = (await this.channel!.messages.fetch({ before: first })).map((m) => m);
			if (!msgs || msgs.length === 0) break;

			const firstMsgId: string = msgs![msgs!.length - 1]?.id;
			if (first === firstMsgId) break;

			msgsArray.push(...msgs!);
			first = firstMsgId;
		} while (true);

		console.log('...');

		const data = await transcript(staff.client, this.ticketNumber, this.channel!.name, msgsArray.reverse());

		console.log('......');

		staff.client.deleting = false;

		const staffs = staff.guild.members.cache
			.filter((m) => m.roles.cache.some((r) => staffRoles.includes(r.id)))
			.map((s) => ({
				mention: s.user.toString(),
				msgs: msgsArray.filter((m) => m.author.id === s.user.id).length
			}))
			.sort((b, a) => a.msgs - b.msgs);

		const em = new MessageEmbed()
			.setTitle('Ticket transcript')
			.setColor('BLUE')
			.setAuthor({ name: this.user.tag, iconURL: this.user.displayAvatarURL({ dynamic: true }) })
			.setTimestamp()
			.setDescription(this.reason)
			.addField('Staff msgs', staffs.map((s) => `${s.mention} ${dot} \`${s.msgs}\` messages`).join('\n'));

		return await (staff.client.channels.cache.get(transcriptChannel) as GuildTextBasedChannel).send({
			embeds: [em],
			files: [{ name: `ticket-${this.ticketNumber}.html`, attachment: Buffer.from(data) }]
		});
	}
}
