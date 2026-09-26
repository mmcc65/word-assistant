import { describe, expect, it } from 'vitest'
import { buildImportPreview, parseCsv, parsePlainText } from '../domain/importer'

describe('导入', () => {
  it('清理 TXT 空行并生成行号', () => {
    expect(parsePlainText(' significant \n\nissue\r\n')).toEqual([
      { rowNumber: 1, word: 'significant' },
      { rowNumber: 3, word: 'issue' },
    ])
  })

  it('兼容完整 CSV 字段和中文表头', () => {
    const rows = parseCsv('word,part_of_speech,meaning,example,example_translation,phrase,phrase_translation,note\nissue,n.,问题,This is an issue.,这是一个问题。,address an issue,处理问题,阅读遇到')
    expect(rows[0]).toMatchObject({ word: 'issue', partOfSpeech: 'n.', meaning: '问题', exampleTranslation: '这是一个问题。', phraseTranslation: '处理问题', note: '阅读遇到' })
    const chinese = parseCsv('单词,词性,中文释义\naddress,v.,处理')
    expect(chinese[0]).toMatchObject({ word: 'address', partOfSpeech: 'v.', meaning: '处理' })
  })

  it('区分可导入、已有、同批重复与无效项', () => {
    const preview = buildImportPreview(parsePlainText('Issue\nnew word\nissue\n123'), ['issue'])
    expect(preview.map((row) => row.status)).toEqual(['existing', 'ready', 'existing', 'invalid'])
  })
})
