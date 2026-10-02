/**
 * Tagging on Whispers: an Echo or Reflection can "@" other ghosts.
 *
 * A tag is stored on the row it appears in as a JSON snapshot of
 * `[{ pubkeyHash, name }]`. The name is frozen at tag time, like
 * `reply_to_name`, so a later rename cannot change what an existing post
 * appears to say. Neither Echoes nor Reflections are editable, so the snapshot
 * never has to be reconciled with a changed body.
 *
 * `mention_privacy` mirrors `dm_privacy`: 'everyone' | 'following' (only
 * people this ghost follows) | 'none'. The relay enforces it when a tag is
 * written, and the "@" picker never offers someone who would be refused.
 */
export const WHISPER_MENTIONS_SCHEMA_SQL = `
alter table whisper_echoes add column if not exists mentions jsonb;
alter table whisper_reflections add column if not exists mentions jsonb;
alter table whisper_profiles
  add column if not exists mention_privacy text not null default 'everyone';

-- Serves the "@" picker's prefix match. Matching from the start of a later
-- word ("Key" in "Silent Key 4F2A") cannot use it and scans instead, which is
-- bounded by the profile count and the picker's small limit.
create index if not exists whisper_profiles_display_name_idx
  on whisper_profiles (lower(display_name) text_pattern_ops);
`;
