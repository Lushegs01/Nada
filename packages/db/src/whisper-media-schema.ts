/**
 * Media on Whispers: an Echo can carry photos, GIFs, video and audio.
 *
 * The files themselves live in object storage under `whispers/`; the Echo row
 * keeps a JSON snapshot of `[{ id, kind, mimeType, size, width?, height?,
 * duration? }]` in display order. The relay writes the type and size from what
 * it stored at upload, not from the client.
 *
 * `ripple_of_media` is the same snapshot copied from the rippled Echo, so a
 * Ripple quotes the photo along with the words. It points at the source's
 * files, which go when the source is deleted — the quote then shows the media
 * as no longer available.
 */
export const WHISPER_MEDIA_SCHEMA_SQL = `
alter table whisper_echoes add column if not exists media jsonb;
alter table whisper_echoes add column if not exists ripple_of_media jsonb;
`;
