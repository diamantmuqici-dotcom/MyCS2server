import type { ChatInputCommandInteraction } from 'discord.js';
import { baseEmbed } from '../embeds.js';
import { confirmAction } from '../ui.js';
import type { BotContext } from '../context.js';
import { UserFacingError, canUseSetup } from '../permissions.js';
import { applySetup, previewSetup, saveSetupConfiguration } from '../setup.js';
import {
  deferEphemeral,
  loadConfig,
  replyWithEmbeds,
  requireGuild,
  requireModerator,
  showError,
  truncate,
} from './shared.js';

export async function handleSetup(
  interaction: ChatInputCommandInteraction,
  ctx: BotContext,
): Promise<void> {
  try {
    await deferEphemeral(interaction);
    const guild = requireGuild(interaction);
    const member = (interaction.member as import('discord.js').GuildMember | null) ?? null;
    if (!member) throw new UserFacingError('Could not resolve your membership.');
    const config = await loadConfig(ctx, guild.id);
    if (!canUseSetup(guild, member, config, ctx.env.ownerIds, ctx.env.coOwnerIds)) {
      throw new UserFacingError(
        'Only the server owner or an allowlisted Owner / Co-Owner may run setup. Configure the allowlist on the backend and try again.',
      );
    }
    await requireModerator(interaction, ctx);

    const preview = await previewSetup(guild);
    const embed = baseEmbed(
      'Setup preview',
      'Nothing has been created yet. Review the plan, then confirm. Existing roles and channels are reused and never renamed or deleted.',
    ).addFields(
      {
        name: 'Roles',
        value: truncate(
          `Create: ${preview.rolesToCreate.join(', ') || 'none'}\nReuse: ${preview.rolesExisting.join(', ') || 'none'}`,
          1024,
        ),
      },
      {
        name: 'Categories',
        value: truncate(
          `Create: ${preview.categoriesToCreate.join(', ') || 'none'}\nReuse: ${preview.categoriesExisting.join(', ') || 'none'}`,
          1024,
        ),
      },
      {
        name: 'Channels',
        value: truncate(
          `Create: ${preview.channelsToCreate.join(', ') || 'none'}\nReuse: ${preview.channelsExisting.join(', ') || 'none'}`,
          1024,
        ),
      },
      {
        name: 'Bot permissions',
        value:
          preview.missingBotPermissions.length === 0
            ? 'All required permissions are present.'
            : `Missing: ${preview.missingBotPermissions.join(', ')}`,
      },
    );

    const confirmed = await confirmAction(interaction, {
      title: 'Apply setup',
      description:
        'Create the missing roles, categories and channels now? Existing resources are reused. The bot will then save the ID map to the backend.',
      confirmLabel: 'Create structure',
      danger: false,
    });
    if (!confirmed) {
      await replyWithEmbeds(interaction, embed);
      return;
    }

    const applied = await applySetup(guild, interaction.user.id);
    let saved = false;
    let saveError: string | null = null;
    try {
      await saveSetupConfiguration(ctx.api, ctx.configs, guild, interaction.user.id, applied);
      saved = true;
    } catch (error) {
      saveError = (error as Error).message;
      ctx.logger.error('Failed to persist setup configuration', error);
    }

    const summary = baseEmbed(
      'Setup completed',
      saved
        ? 'The roles, categories and channels are in place and the ID map is stored on the backend.'
        : 'Discord resources were created, but saving the ID map to the backend failed. Re-run /setup-server once the API is reachable — it is idempotent.',
    ).addFields(
      {
        name: 'Created',
        value: `Roles: ${applied.created.roles} · Categories: ${applied.created.categories} · Channels: ${applied.created.channels}`,
        inline: true,
      },
      {
        name: 'Reused',
        value: `Roles: ${applied.reused.roles} · Categories: ${applied.reused.categories} · Channels: ${applied.reused.channels}`,
        inline: true,
      },
    );
    if (applied.errors.length > 0) {
      summary.addFields({
        name: 'Warnings',
        value: truncate(applied.errors.map((line) => `• ${line}`).join('\n'), 1024),
      });
    }
    if (saveError) {
      summary.addFields({ name: 'Backend save error', value: truncate(saveError, 1024) });
    }
    await replyWithEmbeds(interaction, summary);
  } catch (error) {
    await showError(interaction, error, ctx);
  }
}
