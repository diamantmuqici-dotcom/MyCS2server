import { randomUUID } from 'node:crypto';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type Message,
} from 'discord.js';
import { baseEmbed } from './embeds.js';

export interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
}

/**
 * Shows an ephemeral confirmation prompt. Returns true only when the same user
 * presses the confirm button within 60 seconds.
 */
export async function confirmAction(
  interaction: ChatInputCommandInteraction,
  options: ConfirmOptions,
): Promise<boolean> {
  const id = randomUUID().slice(0, 8);
  const embed = baseEmbed(options.title, options.description).setColor(
    options.danger === false ? 0x075bff : 0xff5c7a,
  );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`de:confirm:${id}`)
      .setLabel(options.confirmLabel ?? 'Confirm')
      .setStyle(options.danger === false ? ButtonStyle.Primary : ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`de:cancel:${id}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );
  await interaction.editReply({ embeds: [embed], components: [row] });
  const message = (await interaction.fetchReply()) as Message;
  try {
    const button = await message.awaitMessageComponent({
      filter: (candidate) => candidate.user.id === interaction.user.id,
      time: 60_000,
    });
    await button.deferUpdate();
    if (button.customId.startsWith('de:confirm:')) {
      await interaction.editReply({ embeds: [], components: [] });
      return true;
    }
    await interaction.editReply({
      embeds: [baseEmbed('Cancelled', 'No action was taken.').setColor(0xa9b8d6)],
      components: [],
    });
    return false;
  } catch {
    await interaction
      .editReply({ embeds: [baseEmbed('Timed out', 'No action was taken.')], components: [] })
      .catch(() => undefined);
    return false;
  }
}
