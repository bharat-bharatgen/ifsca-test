/**
 * Shared configuration for chat animation behavior.
 * Used across global-chat and document-chat components for consistent typing effects.
 */

/**
 * Number of characters to display per animation update.
 * Higher values = faster animation, lower values = smoother animation.
 */
export const CHAT_ANIMATION_CHUNK_SIZE = 3;

/**
 * Delay in milliseconds between character group updates.
 * Higher values = slower animation, lower values = faster animation.
 */
export const CHAT_ANIMATION_DELAY_MS = 40;

