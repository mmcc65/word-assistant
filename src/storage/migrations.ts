import { CURRENT_SCHEMA_VERSION, createEmptyData } from '../domain/defaults'
import type { AppData } from '../domain/types'

type UnknownData = Partial<AppData> & { schemaVersion?: number }

export function migrateData(input: UnknownData): AppData {
  let value: UnknownData = structuredClone(input)
  const version = value.schemaVersion ?? 0
  if (version > CURRENT_SCHEMA_VERSION) throw new Error('数据来自更高版本，请先更新应用。')
  if (version < 1) value = migrateToV1(value)
  if ((value.schemaVersion ?? 0) < 2) value = migrateToV2(value)
  if ((value.schemaVersion ?? 0) < 3) value = migrateToV3(value)
  if ((value.schemaVersion ?? 0) < 4) value = migrateToV4(value)
  return value as AppData
}

function migrateToV4(input: UnknownData): AppData {
  return {
    ...createEmptyData(),
    ...input,
    schemaVersion: 4,
    flashcardProgress: input.flashcardProgress ?? [],
  } as AppData
}

function migrateToV1(input: UnknownData): AppData {
  const base = createEmptyData()
  return { ...base, ...input, schemaVersion: 1 } as AppData
}

function migrateToV2(input: UnknownData): AppData {
  return {
    ...createEmptyData(),
    ...input,
    schemaVersion: 2,
    tombstones: input.tombstones ?? [],
    dirty: input.dirty ?? false,
  } as AppData
}

function migrateToV3(input: UnknownData): AppData {
  const base = createEmptyData()
  return {
    ...base,
    ...input,
    schemaVersion: 3,
    wordbooks: (input.wordbooks ?? base.wordbooks).map((wordbook) =>
      wordbook.id === 'wb-cet6' && wordbook.name === '六级'
        ? { ...wordbook, name: '我的生词' }
        : wordbook,
    ),
  } as AppData
}
